import forge from "npm:node-forge@1.3.3";
import { XMLParser } from "npm:fast-xml-parser@5.3.8";

const xml = new XMLParser({ removeNSPrefix: true, parseTagValue: false, ignoreAttributes: true });
const feNamespace = "http://ar.gov.afip.dif.FEV1/";
const aaNamespace = "http://wsaa.view.sua.dvadac.desein.afip.gov";
export const tag = (name: string, value: string | number) =>
  '<' + name + '>' + String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</' + name + '>';
export class ArcaError extends Error {}
export function config() {
  const environment = Deno.env.get("ARCA_ENV")?.trim().toLowerCase();
  const production = ["prod", "produccion", "producción", "production", "live"].includes(environment ?? "");
  if (!production && !["homo", "homologacion", "homologación", "homologation", "test", "testing"].includes(environment ?? "")) {
    throw new ArcaError("ARCA_ENV inválido.");
  }
  const cuit = Deno.env.get("ARCA_CUIT")?.replace(/[-\s]/g, "") ?? "";
  const point = Number(Deno.env.get("ARCA_PUNTO_VENTA"));
  if (!/^\d{11}$/.test(cuit) || point !== 5) throw new ArcaError("CUIT emisor o punto de venta ARCA inválido.");
  return { production, cuit, point };
}
export type Config = ReturnType<typeof config>;
export type Ticket = { token: string; sign: string; expiresAt: string };

async function soap(stage: string, url: string, ns: string, method: string, action: string, request: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"' + action + '"' },
      body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><' +
        method + ' xmlns="' + ns + '">' + request + '</' + method + '></soap:Body></soap:Envelope>',
    });
  } catch (error) {
    console.warn(stage, error instanceof Error ? error.name : "transport");
    throw new ArcaError(stage + " sin respuesta. Verificá el resultado antes de reintentar.");
  }
  const raw = await response.text();
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new ArcaError(stage + " devolvió XML inesperado.");
  const body = xml.parse(raw)?.Envelope?.Body;
  const fault = body?.Fault?.detail?.exceptionName ?? body?.Fault?.faultcode;
  if (fault && /^[\w.:-]{1,120}$/.test(String(fault))) throw new ArcaError(stage + " devolvió " + fault + ".");
  if (!response.ok || !body?.[method + "Response"]) throw new ArcaError(stage + " devolvió una respuesta inválida (HTTP " + response.status + ").");
  return body[method + "Response"];
}

export async function login(cfg: Config): Promise<Ticket> {
  const pem = (name: string, label: string) => {
    const value = Deno.env.get(name)?.trim().replace(/\\r\\n|\\n|\\r/g, "\n") ?? "";
    if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) return value;
    const body = value.replace(/\s/g, "").match(/.{1,64}/g)?.join("\n");
    return "-----BEGIN " + label + "-----\n" + body + "\n-----END " + label + "-----";
  };
  const privateKey = () => {
    try { return forge.pki.privateKeyFromPem(pem("ARCA_KEY_PEM", "PRIVATE KEY")); }
    catch { return forge.pki.privateKeyFromPem(pem("ARCA_KEY_PEM", "RSA PRIVATE KEY")); }
  };
  let cms: string;
  try {
    const now = Date.now();
    const tra = '<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>' +
      tag("uniqueId", Math.floor(now / 1000)) +
      tag("generationTime", new Date(now - 300000).toISOString()) +
      tag("expirationTime", new Date(now + 600000).toISOString()) +
      "</header><service>wsfe</service></loginTicketRequest>";
    const signed = forge.pkcs7.createSignedData();
    const certificate = forge.pki.certificateFromPem(pem("ARCA_CERT_PEM", "CERTIFICATE"));
    signed.content = forge.util.createBuffer(tra, "utf8");
    signed.addCertificate(certificate);
    signed.addSigner({
      key: privateKey(), certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime },
      ],
    });
    signed.sign();
    cms = forge.util.encode64(forge.asn1.toDer(signed.toAsn1()).getBytes());
  } catch {
    throw new ArcaError("WSAA: no se pudo firmar el ticket con el certificado y la clave configurados.");
  }
  const host = cfg.production ? "wsaa" : "wsaahomo";
  const result = await soap("WSAA", "https://" + host + ".afip.gov.ar/ws/services/LoginCms", aaNamespace, "loginCms", "", tag("in0", cms));
  const access = xml.parse(result.loginCmsReturn)?.loginTicketResponse;
  const ticket = { token: access?.credentials?.token, sign: access?.credentials?.sign, expiresAt: access?.header?.expirationTime };
  if (!ticket.token || !ticket.sign || !(Date.parse(ticket.expiresAt) > Date.now())) throw new ArcaError("WSAA devolvió un ticket inválido.");
  return ticket;
}

export async function wsfe(cfg: Config, ticket: Ticket, method: string, request: string) {
  const host = cfg.production ? "servicios1" : "wswhomo";
  const auth = "<Auth>" + tag("Token", ticket.token) + tag("Sign", ticket.sign) + tag("Cuit", cfg.cuit) + "</Auth>";
  const response = await soap("WSFEv1 " + method, "https://" + host + ".afip.gov.ar/wsfev1/service.asmx", feNamespace, method, feNamespace + method, auth + request);
  const result = response[method + "Result"];
  if (!result) throw new ArcaError("WSFEv1 devolvió un resultado vacío.");
  return result;
}

export function errors(result: { Errors?: { Err?: { Code?: string } | { Code?: string }[] } }) {
  return [result.Errors?.Err ?? []].flat().map((error) => error.Code).filter((code) => /^\d+$/.test(code ?? ""));
}

export async function lastAuthorized(cfg: Config, ticket: Ticket) {
  const result = await wsfe(cfg, ticket, "FECompUltimoAutorizado", tag("PtoVta", cfg.point) + tag("CbteTipo", 11));
  const codes = errors(result);
  if (codes.length || !/^\d+$/.test(result.CbteNro) || Number(result.PtoVta) !== cfg.point || Number(result.CbteTipo) !== 11) {
    throw new ArcaError("No se pudo consultar la numeración WSFEv1." + (codes.length ? " Códigos ARCA: " + codes.join(", ") : ""));
  }
  return Number(result.CbteNro);
}

export async function vatConditions(cfg: Config, ticket: Ticket) {
  const result = await wsfe(cfg, ticket, "FEParamGetCondicionIvaReceptor", tag("ClaseCmp", "C"));
  const codes = errors(result);
  const rows = result.ResultGet?.CondicionIvaReceptor;
  if (codes.length || !rows) throw new ArcaError("No se pudo consultar el catálogo IVA de ARCA." + (codes.length ? " Códigos: " + codes.join(", ") : ""));
  return [rows].flat().map((row) => ({ id: Number(row.Id), label: String(row.Desc) }))
    .filter(({ id, label }) => Number.isInteger(id) && id > 0 && label !== "undefined");
}
