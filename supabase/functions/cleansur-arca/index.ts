import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { ArcaError, config, errors, lastAuthorized, login, tag, vatConditions, wsfe } from "./arca.ts";
import type { Config, Ticket } from "./arca.ts";

const project = Deno.env.get("SUPABASE_URL")!;
const service = createClient(project, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const dateFromArca = (value: string) => /^\d{8}$/.test(value)
  ? value.slice(0, 4) + "-" + value.slice(4, 6) + "-" + value.slice(6) : "";

let renewing: Promise<Ticket> | undefined;
async function getTicket(cfg: Config) {
  const scope = (cfg.production ? "prod:" : "test:") + cfg.cuit;
  const read = async () => {
    const { data, error } = await service.from("arca_wsaa_tickets").select("token,sign,expires_at").eq("scope", scope).maybeSingle();
    if (error) throw new ArcaError("No se pudo leer el ticket WSAA.");
    if (data && Date.parse(data.expires_at) > Date.now() + 60000) {
      return { token: data.token, sign: data.sign, expiresAt: data.expires_at };
    }
  };
  const existing = await read();
  if (existing) return existing;
  renewing ??= (async () => {
    try {
      const ticket = await login(cfg);
      const { error } = await service.from("arca_wsaa_tickets").upsert({
        scope, token: ticket.token, sign: ticket.sign, expires_at: ticket.expiresAt,
      });
      if (error) throw new ArcaError("No se pudo guardar el ticket WSAA.");
      return ticket;
    } catch (error) {
      const fromConcurrentRequest = await read();
      if (fromConcurrentRequest) return fromConcurrentRequest;
      throw error;
    }
  })().finally(() => { renewing = undefined; });
  return renewing;
}

interface Pending {
  sale_id: string;
  cuit: string;
  punto: number;
  numero: number;
  doc_tipo: number;
  doc_nro: string;
  receptor_iva_id: number;
  fecha: string;
  total: number;
}

function invoiceRequest(pending: Pending) {
  const detail = Object.entries({
    Concepto: 1, DocTipo: pending.doc_tipo, DocNro: pending.doc_nro || "0",
    CbteDesde: pending.numero, CbteHasta: pending.numero, CbteFch: pending.fecha.replace(/-/g, ""),
    ImpTotal: pending.total, ImpTotConc: 0, ImpNeto: pending.total,
    ImpOpEx: 0, ImpTrib: 0, ImpIVA: 0, MonId: "PES", MonCotiz: 1,
    CondicionIVAReceptorId: pending.receptor_iva_id,
  }).map(([name, value]) => tag(name, value)).join("");
  return "<FeCAEReq><FeCabReq>" + tag("CantReg", 1) + tag("PtoVta", pending.punto) +
    tag("CbteTipo", 11) + "</FeCabReq><FeDetReq><FECAEDetRequest>" + detail +
    "</FECAEDetRequest></FeDetReq></FeCAEReq>";
}

async function saveInvoice(pending: Pending, cae: string, expiration: string) {
  const due = dateFromArca(expiration);
  if (!/^\d{14}$/.test(cae) || !due) throw new ArcaError("Falta verificar el CAE. Usá Conciliar para consultar a ARCA.");
  const { data, error } = await service.rpc("cleansur_arca_finalize", {
    p_sale: pending.sale_id, p_numero: pending.numero, p_cae: cae, p_vto: due,
  });
  if (error) throw new ArcaError("ARCA devolvió un CAE y el guardado quedó pendiente. Usá Conciliar.");
  return data;
}

async function fiscalize(cfg: Config, saleId: string, iva: number, reconcile: boolean) {
  if (!cfg.production) throw new ArcaError("El punto 00005 debe estar configurado en producción para esta operación.");
  const existing = await service.from("arca_invoices").select("*").eq("sale_id", saleId).maybeSingle();
  if (existing.error) throw new ArcaError("No se pudo consultar el historial fiscal.");
  if (existing.data) return existing.data;
  if (reconcile) {
    const { data: pending, error } = await service.from("arca_pending_invoices").select("*")
      .eq("sale_id", saleId).eq("cuit", cfg.cuit).eq("punto", cfg.point).maybeSingle();
    if (error || !pending) throw new ArcaError("No hay una solicitud pendiente para esta venta.");
    const ticket = await getTicket(cfg);
    const response = await wsfe(cfg, ticket, "FECompConsultar", "<FeCompConsReq>" + tag("CbteTipo", 11) +
      tag("CbteNro", pending.numero) + tag("PtoVta", cfg.point) + "</FeCompConsReq>");
    const result = response.ResultGet;
    if (errors(response).length || result?.Resultado !== "A" || result.EmisionTipo !== "CAE" ||
      Number(result.PtoVta) !== cfg.point || Number(result.CbteTipo) !== 11 || Number(result.Concepto) !== 1 ||
      Number(result.CbteDesde) !== pending.numero || Number(result.CbteHasta) !== pending.numero ||
      Number(result.DocTipo) !== pending.doc_tipo || Number(result.DocNro) !== Number(pending.doc_nro) ||
      Number(result.CondicionIVAReceptorId) !== pending.receptor_iva_id || Number(result.ImpTotal) !== Number(pending.total) ||
      dateFromArca(result.CbteFch) !== pending.fecha || result.MonId !== "PES") {
      throw new ArcaError("ARCA no devolvió un comprobante autorizado que coincida con la solicitud. La reserva sigue pendiente.");
    }
    return saveInvoice(pending, result.CodAutorizacion, result.FchVto);
  }

  if (Deno.env.get("ARCA_FIRST_SALE_ID") !== saleId) throw new ArcaError("Esta venta todavía requiere autorización para emitir en ARCA.");
  const { data: sale, error } = await service.from("sales").select("status,total,customer_cuit_dni,arca_invoice_id")
    .eq("id", saleId).maybeSingle();
  if (error || !sale || sale.status !== "COMPLETADA" || sale.arca_invoice_id || !(Number(sale.total) > 0)) {
    throw new ArcaError("La venta debe estar completada y pendiente de facturación.");
  }
  const doc = String(sale.customer_cuit_dni ?? "").replace(/[.\s-]/g, "");
  const anonymousConsumer = iva === 5 && doc === "" && Number(sale.total) < 10_000_000;
  const docType = anonymousConsumer ? 99 : /^\d{11}$/.test(doc) ? 80 : /^\d{7,8}$/.test(doc) && iva === 5 ? 96 : 0;
  if (!docType) throw new ArcaError("Ingresá un CUIT válido, o un DNI si el receptor es Consumidor Final. Para Consumidor Final, el documento puede quedar vacío si el total es menor a $10.000.000.");
  const ticket = await getTicket(cfg);
  const conditions = await vatConditions(cfg, ticket);
  if (!conditions.some((condition) => condition.id === iva)) throw new ArcaError("Seleccioná una condición de IVA válida para Factura C.");
  const last = await lastAuthorized(cfg, ticket);
  const { data: pending, error: reserveError } = await service.rpc("cleansur_arca_reserve", {
    p_sale: saleId, p_cuit: cfg.cuit, p_punto: cfg.point, p_numero: last + 1,
    p_doc_tipo: docType, p_doc_nro: doc, p_iva: iva, p_total: sale.total,
  });
  if (reserveError || !pending) throw new ArcaError("No se reservó la numeración. Verificá si la venta ya fue facturada o requiere conciliación.");

  const response = await wsfe(cfg, ticket, "FECAESolicitar", invoiceRequest(pending));
  const header = response.FeCabResp;
  const detail = response.FeDetResp?.FECAEDetResponse;
  const sameRequest = Number(header?.PtoVta) === cfg.point && Number(header?.CbteTipo) === 11 &&
    Number(detail?.CbteDesde) === pending.numero && Number(detail?.CbteHasta) === pending.numero &&
    Number(detail?.DocTipo) === pending.doc_tipo && Number(detail?.DocNro) === Number(pending.doc_nro);
  if (sameRequest && header.Reproceso === "N" && header.Resultado === "A" && detail.Resultado === "A") {
    return saveInvoice(pending, detail.CAE, detail.CAEFchVto);
  }
  if (sameRequest && header.Resultado === "R" && detail.Resultado === "R" && !detail.CAE) {
    const released = await service.from("arca_pending_invoices").delete().eq("sale_id", saleId).eq("numero", pending.numero);
    if (released.error) throw new ArcaError("Solicitud rechazada. El registro sigue pendiente de conciliación.");
    const observations = [detail.Observaciones?.Obs ?? []].flat().map((row) => row.Code).filter((code) => /^\d+$/.test(code));
    throw new ArcaError("ARCA rechazó la solicitud. Códigos: " + [...errors(response), ...observations].join(", "));
  }
  throw new ArcaError("Resultado fiscal indeterminado. Usá Conciliar antes de volver a operar.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  const bearer = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer) return reply({ error: "Iniciá sesión en el ERP." }, 401);
  try {
    const { data, error } = await service.auth.getUser(bearer);
    if (error || !data.user) return reply({ error: "Sesión inválida." }, 401);
    const access = await service.from("staff_access").select("role").eq("user_id", data.user.id).eq("active", true).maybeSingle();
    if (access.error || access.data?.role !== "ADMIN") return reply({ error: "Acceso fiscal restringido." }, 403);
    const body = await req.json().catch(() => null);
    if (!body || !["status", "issue", "reconcile"].includes(body.action)) return reply({ error: "Acción inválida." }, 400);
    const cfg = config();
    if (body.action === "status") {
      const ticket = await getTicket(cfg);
      const last = await lastAuthorized(cfg, ticket);
      const vat = await vatConditions(cfg, ticket);
      const pending = await service.from("arca_pending_invoices").select("sale_id").eq("cuit", cfg.cuit).eq("punto", cfg.point).maybeSingle();
      return reply({ wsaa: true, last, vat, production: cfg.production, point: cfg.point,
        authorizedSale: cfg.production && !pending.error ? Deno.env.get("ARCA_FIRST_SALE_ID") ?? null : null,
        pendingSale: pending.data?.sale_id ?? null, billingReady: !pending.error });
    }
    if (typeof body.saleId !== "string" || !body.saleId || body.saleId.length > 150 ||
      (body.action === "issue" && !Number.isInteger(body.iva))) return reply({ error: "Datos de factura inválidos." }, 400);
    return reply({ invoice: await fiscalize(cfg, body.saleId, body.iva, body.action === "reconcile") });
  } catch (error) {
    return reply({ error: error instanceof ArcaError ? error.message : "Error interno del facturador." }, 502);
  }
});
