import { getAdminSession, refreshAdminSession } from '../supabase_admin.js';
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from '../supabase_public.js';
import { Formatter } from '../models.js';

async function call(path, { method = 'GET', body } = {}) {
  const token = getAdminSession()?.access_token;
  if (!token) throw new Error('Ingresá al ERP para consultar ARCA.');
  const response = await fetch(STAYCLEAN_SUPABASE_URL + path, {
    method,
    headers: {
      apikey: STAYCLEAN_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: body && JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || payload.message || 'No se pudo consultar la facturación.');
  return payload;
}

const arca = (action, fields) => call('/functions/v1/cleansur-arca', { method: 'POST', body: { action, ...fields } });
const number = (point, receipt) => String(point).padStart(5, '0') + '-' + String(receipt).padStart(8, '0');

export const ArcaView = {
  async render(container) {
    container.innerHTML = `
      <section class="space-y-5 rounded-xl border bg-white p-5">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-xl font-bold">Facturación electrónica ARCA</h1>
          <button type="button" data-fiscal-refresh class="rounded-lg border px-3 py-2">Actualizar</button>
        </header>
        <p data-fiscal-status role="status">Consultando ARCA…</p>
        <p data-fiscal-error role="alert" class="text-red-700"></p>
        <form data-fiscal-sale hidden class="space-y-3 rounded-lg border p-4">
          <h2 class="font-semibold">Primera Factura C autorizada para emitir</h2>
          <p data-fiscal-preview></p>
          <label class="block">Condición frente al IVA del receptor
            <select required class="ml-2 rounded border px-2 py-1"></select>
          </label>
          <p class="text-sm text-slate-600">Para Consumidor Final por debajo de $10.000.000, el documento es opcional.</p>
          <button type="submit" class="rounded-lg bg-emerald-700 px-3 py-2 text-white">Solicitar CAE</button>
        </form>
        <button type="button" data-fiscal-reconcile hidden class="rounded-lg border px-3 py-2">Conciliar solicitud pendiente</button>
        <div class="overflow-x-auto">
          <h2 class="mb-2 font-semibold">Comprobantes autorizados</h2>
          <p data-fiscal-empty></p>
          <table data-fiscal-history hidden class="w-full text-left text-sm">
            <thead><tr><th>Factura C</th><th>Receptor</th><th>Total</th><th>CAE</th><th>Vencimiento CAE</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </section>`;
    const panel = container.firstElementChild;
    const find = (selector) => panel.querySelector(selector);
    find('[data-fiscal-refresh]').onclick = () => this.render(container);
    const status = find('[data-fiscal-status]');
    const error = find('[data-fiscal-error]');
    const form = find('[data-fiscal-sale]');
    const reconcile = find('[data-fiscal-reconcile]');
    try {
      await refreshAdminSession();
      const [connection, invoices] = await Promise.allSettled([
        arca('status'),
        call('/rest/v1/arca_invoices?select=sale_id,punto_vta,nro_cbte,nombre_cliente,importe_total,cae,cae_vto&estado=eq.AUTORIZADA&order=created_at.desc&limit=250')
      ]);
      if (!panel.isConnected) return;
      if (invoices.status === 'fulfilled') {
        const history = find('[data-fiscal-history]');
        history.hidden = !invoices.value.length;
        if (history.hidden) find('[data-fiscal-empty]').textContent = 'Todavía no hay comprobantes autorizados en el ERP.';
        for (const invoice of invoices.value) {
          const row = history.tBodies[0].insertRow();
          for (const value of [number(invoice.punto_vta, invoice.nro_cbte), invoice.nombre_cliente,
            Formatter.money(Number(invoice.importe_total)), invoice.cae, invoice.cae_vto]) {
            row.insertCell().textContent = value ?? '';
          }
        }
      } else {
        find('[data-fiscal-empty]').textContent = 'No se pudo cargar el historial fiscal.';
      }
      if (connection.status === 'rejected') throw connection.reason;
      const { production, point, last, vat, authorizedSale, pendingSale } = connection.value;
      status.textContent = 'WSAA y WSFEv1 operativos en ' + (production ? 'producción' : 'homologación') +
        ' · Punto ' + String(point).padStart(5, '0') + ' · ' +
        (last ? 'Última Factura C ' + number(point, last) : 'Sin Facturas C autorizadas') +
        (!authorizedSale ? ' · Emisión bloqueada hasta autorización.' : '');
      if (pendingSale) {
        reconcile.hidden = false;
        reconcile.onclick = async () => {
          reconcile.disabled = true;
          error.textContent = '';
          try {
            await arca('reconcile', { saleId: pendingSale });
            if (panel.isConnected) await this.render(container);
          } catch (failure) {
            error.textContent = failure.message;
            reconcile.disabled = false;
          }
        };
      }
      if (!authorizedSale || pendingSale || invoices.status !== 'fulfilled') return;
      const sales = await call('/rest/v1/sales?' + new URLSearchParams({
        select: 'sale_number,customer_name,customer_cuit_dni,total,status,arca_invoice_id', id: 'eq.' + authorizedSale
      }));
      if (!panel.isConnected) return;
      const sale = sales[0];
      if (!sale || sale.status !== 'COMPLETADA' || sale.arca_invoice_id) return;
      find('[data-fiscal-preview]').textContent = [sale.sale_number, sale.customer_name,
        sale.customer_cuit_dni || 'Sin documento', Formatter.money(Number(sale.total))].join(' · ');
      const select = form.querySelector('select');
      select.add(new Option('Seleccioná la condición fiscal', ''));
      for (const option of vat) select.add(new Option(option.label, option.id));
      form.hidden = false;
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (!confirm('¿Confirmás la solicitud de una Factura C real para la venta ' + sale.sale_number + '?')) return;
        const submit = form.querySelector('button');
        submit.disabled = true;
        error.textContent = '';
        try {
          await arca('issue', { saleId: authorizedSale, iva: Number(select.value) });
          if (panel.isConnected) await this.render(container);
        } catch (failure) {
          error.textContent = failure.message;
          form.hidden = true;
        }
      };
    } catch (failure) {
      status.textContent = 'Consulta ARCA pendiente.';
      error.textContent = failure.message;
    }
  }
};
