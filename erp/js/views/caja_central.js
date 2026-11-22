import { Formatter } from '../models.js';
import { getAdminSession } from '../supabase_admin.js';
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from '../supabase_public.js';
import { salesDialog } from './sales_dialog.js';

async function cashRequest(action, cash = null, notes = null) {
  const token = getAdminSession()?.access_token;
  if (!token) throw Error('Volvé a iniciar sesión en CleanSur.');
  const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/stayclean_staff_cash_register', {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_action: action, p_cash: cash, p_notes: notes })
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || 'No se pudo consultar la caja.');
  return data;
}

export async function renderCentralCash(container) {
  container.textContent = 'Cargando caja diaria…';
  const money = value => Formatter.money(Number(value ?? 0));
  try {
    const data = await cashRequest('read');
    if (window.app.currentRoute !== 'caja') return;
    const register = data.register;
    const open = register?.status === 'ABIERTA';
    container.innerHTML = `
      <section class="space-y-5 rounded-xl border bg-white p-5 text-slate-800">
        <header><h1 class="text-2xl font-bold">Caja diaria y arqueo</h1>
          <p class="text-sm">${Formatter.date(data.date)} · ${open ? 'Abierta' : register ? 'Cerrada' : 'Pendiente de apertura'}</p>
        </header>
        <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          ${[['Fondo inicial',register?.initial_cash],['Ventas cobradas en efectivo',data.cash_sales],['Gastos en efectivo',data.cash_expenses],['Efectivo esperado',data.expected]].map(([label,value]) =>
            `<div class="rounded-lg bg-slate-50 p-3"><dt class="text-sm">${label}</dt><dd class="font-bold">${money(value)}</dd></div>`).join('')}
        </dl>
        ${open || !register ? `<button type="button" data-cash-action class="rounded-lg bg-[#0E3A6B] px-4 py-2 font-bold text-white">${open ? 'Cerrar caja y registrar arqueo' : 'Abrir caja'}</button>` : ''}
        <h2 class="font-bold">Últimos cierres</h2>
        ${data.history.length ? data.history.map(row => `<p class="rounded-lg border p-3">${Formatter.date(row.close_date)} · Esperado ${money(row.final_cash_expected)} · Contado ${money(row.final_cash_counted)} · Diferencia ${money(row.difference)}</p>`).join('') : '<p>Todavía no hay cierres registrados.</p>'}
      </section>`;
    const button = container.querySelector('[data-cash-action]');
    if (button) button.onclick = async () => {
      button.disabled = true;
      try {
        const input = document.createElement('input');
        Object.assign(input, { type: 'number', min: '0', step: '0.01', required: true, className: 'w-full rounded-lg border p-2' });
        input.setAttribute('aria-label', open ? 'Efectivo contado' : 'Fondo inicial');
        const result = await salesDialog(open ? 'Cerrar caja' : 'Abrir caja',
          open ? 'Ingresá el efectivo contado. Esperado: ' + money(data.expected) : 'Ingresá el fondo inicial en efectivo.',
          'Guardar', input);
        if (result === false) return;
        await cashRequest(open ? 'close' : 'open', Number(result));
        if (window.app.currentRoute === 'caja') await renderCentralCash(container);
      } catch (error) {
        await salesDialog('Caja diaria', error.message);
      } finally {
        button.disabled = false;
      }
    };
  } catch (error) {
    container.textContent = error.message;
  }
}
