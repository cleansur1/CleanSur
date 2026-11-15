// Módulo de Cuentas Corrientes para Limpieza Caviahue
// Saldos deudores, cobranzas parciales, emisión de recibos y Estado de Cuenta comercial.

import { db } from '../db.js';
import { Formatter } from '../models.js';

let activeCustomerId = null;

export const CuentasCorrientesView = {
  render(container, params = {}) {
    const customers = db.getCustomers().filter(c => c.credit_account_enabled || c.current_balance > 0);
    activeCustomerId = params.customerId || (customers.length > 0 ? customers[0].id : null);

    const totalDeudaGlobal = customers.reduce((sum, c) => sum + (c.current_balance || 0), 0);
    const activeCustomer = db.getCustomer(activeCustomerId);
    const movements = activeCustomerId ? db.getCustomerAccountMovements(activeCustomerId) : [];

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Cuentas Corrientes & Cobranzas</h1>
            <p class="text-xs text-slate-500">Gestión de créditos comerciales a hoteles, cabañas y restaurantes de Caviahue.</p>
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-500 block">Total a Cobrar en Plaza:</span>
            <span class="text-xl font-extrabold text-amber-700">${Formatter.money(totalDeudaGlobal)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Columna Izquierda: Lista de Clientes con Saldo (1 col) -->
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[650px]">
            <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Clientes con Crédito</h2>
              <span class="text-[11px] font-semibold text-slate-500">${customers.length} cuentas</span>
            </div>

            <div class="p-3 border-b border-slate-100">
              <input type="text" id="searchCtaCteCust" placeholder="Filtrar clientes..." class="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            </div>

            <div class="divide-y divide-slate-100 overflow-y-auto flex-1" id="ctaCteCustomerList">
              ${customers.map(c => `
                <div onclick="window.app.navigate('cuentas_corrientes', { customerId: '${c.id}' })" class="p-3.5 hover:bg-indigo-50/50 cursor-pointer transition flex items-center justify-between ${c.id === activeCustomerId ? 'bg-indigo-50/80 border-l-4 border-indigo-600' : ''}">
                  <div>
                    <div class="text-xs font-bold text-slate-800">${c.name}</div>
                    <div class="text-[10px] text-slate-500">${c.customer_type} • Límite: ${Formatter.money(c.credit_limit)}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-xs font-bold ${c.current_balance > 0 ? 'text-amber-700' : 'text-emerald-600'}">
                      ${Formatter.money(c.current_balance)}
                    </div>
                    <span class="text-[10px] ${c.current_balance > 0 ? 'text-amber-600' : 'text-slate-400'}">
                      ${c.current_balance > 0 ? 'Pendiente' : 'Al día'}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Columna Derecha: Detalle de la Cuenta Corriente Seleccionada (2 cols) -->
          <div class="lg:col-span-2 space-y-4">
            ${activeCustomer ? `
              <!-- Ficha de la Cuenta -->
              <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <span class="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded">${activeCustomer.customer_type}</span>
                    <h2 class="text-xl font-bold text-slate-800 mt-1">${activeCustomer.name}</h2>
                    <p class="text-xs text-slate-500">CUIT/DNI: ${activeCustomer.cuit_dni || 'S/N'} • Tel: ${activeCustomer.phone || '-'}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button onclick="window.cuentasModule.printAccountStatement('${activeCustomer.id}')" class="px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                      <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Estado
                    </button>
                    <button onclick="window.cuentasModule.openPaymentModal('${activeCustomer.id}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5">
                      <i data-lucide="dollar-sign" class="w-4 h-4"></i> Registrar Cobranza
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <span class="text-xs text-amber-800 font-medium">Saldo Deudor Actual:</span>
                    <div class="text-xl font-extrabold text-amber-900 mt-1">${Formatter.money(activeCustomer.current_balance)}</div>
                  </div>
                  <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span class="text-xs text-slate-500 font-medium">Límite de Crédito:</span>
                    <div class="text-base font-bold text-slate-800 mt-1">${Formatter.money(activeCustomer.credit_limit)}</div>
                  </div>
                  <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span class="text-xs text-slate-500 font-medium">Crédito Disponible:</span>
                    <div class="text-base font-bold text-emerald-700 mt-1">
                      ${Formatter.money(Math.max(0, (activeCustomer.credit_limit || 0) - (activeCustomer.current_balance || 0)))}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Movimientos Históricos de Cuenta Corriente -->
              <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Movimientos de la Cuenta</h3>
                  <span class="text-xs text-slate-500">${movements.length} movimientos</span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th class="py-2.5 px-3">Fecha</th>
                        <th class="py-2.5 px-3">Tipo</th>
                        <th class="py-2.5 px-3">Comprobante / Ref</th>
                        <th class="py-2.5 px-3">Medio de Pago / Motivo</th>
                        <th class="py-2.5 px-3 text-right">Debe (Venta)</th>
                        <th class="py-2.5 px-3 text-right">Haber (Cobranza)</th>
                        <th class="py-2.5 px-3 text-right">Saldo Resultante</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      ${movements.map(m => {
                        const isVenta = m.type === 'VENTA';
                        const isPago = m.type === 'PAGO' || m.type === 'NOTA_CREDITO';
                        return `
                          <tr class="hover:bg-slate-50 transition">
                            <td class="py-2.5 px-3 text-slate-600">${Formatter.date(m.date)}</td>
                            <td class="py-2.5 px-3">
                              <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${isVenta ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                                ${m.type}
                              </span>
                            </td>
                            <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${m.reference_id || '-'}</td>
                            <td class="py-2.5 px-3 text-slate-600">${m.notes || m.payment_method || '-'}</td>
                            <td class="py-2.5 px-3 text-right font-medium text-slate-800">
                              ${isVenta ? Formatter.money(m.amount) : '-'}
                            </td>
                            <td class="py-2.5 px-3 text-right font-semibold text-emerald-600">
                              ${isPago ? Formatter.money(Math.abs(m.amount)) : '-'}
                            </td>
                            <td class="py-2.5 px-3 text-right font-bold text-slate-900">
                              ${Formatter.money(m.balance_after)}
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : `
              <div class="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
                Seleccioná un cliente de la lista para ver su estado de cuenta corriente.
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Modal de Registro de Cobranza / Pago -->
      <div id="paymentModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 class="text-base font-bold text-slate-800">Registrar Pago / Cobranza</h3>
            <button onclick="document.getElementById('paymentModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="window.cuentasModule.submitPayment(event)" class="space-y-4 text-xs">
            <input type="hidden" id="payCustomerId">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Cliente</label>
              <input type="text" id="payCustomerName" disabled class="w-full border border-slate-200 bg-slate-100 rounded-lg p-2 font-bold text-slate-700">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Saldo Adeudado Actual</label>
              <input type="text" id="payCurrentBalance" disabled class="w-full border border-amber-200 bg-amber-50 rounded-lg p-2 font-bold text-amber-800">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Monto a Cobrar ($ ARS) *</label>
              <input type="number" id="payAmount" required min="1" step="0.01" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-emerald-800 text-base">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Medio de Pago *</label>
              <select id="payMethod" required class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="Transferencia">Transferencia Bancaria (BPN / Mercado Pago)</option>
                <option value="Efectivo">Efectivo en Mostrador</option>
                <option value="Cheque">Cheque al Día / Pago Diferido</option>
                <option value="Débito">Tarjeta de Débito</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">N° Comprobante / Referencia / Notas</label>
              <input type="text" id="payNotes" placeholder="Ej: Transferencia BPN N° 981249" class="w-full border border-slate-300 rounded-lg p-2">
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onclick="document.getElementById('paymentModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg">Cancelar</button>
              <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">Confirmar Cobranza</button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.attachSearchFilter();
  },

  attachSearchFilter() {
    const input = document.getElementById('searchCtaCteCust');
    if (input) {
      input.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const items = document.querySelectorAll('#ctaCteCustomerList > div');
        items.forEach(it => {
          const text = it.textContent.toLowerCase();
          it.style.display = text.includes(q) ? '' : 'none';
        });
      });
    }
  }
};

window.cuentasModule = {
  openPaymentModal(customerId) {
    const cust = db.getCustomer(customerId);
    if (!cust) return;

    const modal = document.getElementById('paymentModal');
    document.getElementById('payCustomerId').value = cust.id;
    document.getElementById('payCustomerName').value = cust.name;
    document.getElementById('payCurrentBalance').value = Formatter.money(cust.current_balance);
    document.getElementById('payAmount').value = cust.current_balance > 0 ? cust.current_balance : 0;

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  submitPayment(e) {
    e.preventDefault();
    const custId = document.getElementById('payCustomerId')?.value;
    const amount = Number(document.getElementById('payAmount')?.value) || 0;
    const method = document.getElementById('payMethod')?.value;
    const notes = document.getElementById('payNotes')?.value;

    if (!custId || amount <= 0) {
      alert('Ingresá un monto válido para la cobranza.');
      return;
    }

    try {
      const res = db.addCustomerPayment(custId, amount, method, notes);
      document.getElementById('paymentModal').classList.add('hidden');
      window.app.showNotification(`Cobranza de $${amount} registrada con Recibo ${res.receiptId}.`, 'success');
      window.app.navigate('cuentas_corrientes', { customerId: custId });
    } catch (err) {
      alert(err.message);
    }
  },

  printAccountStatement(customerId) {
    const cust = db.getCustomer(customerId);
    if (!cust) return;
    const movs = db.getCustomerAccountMovements(customerId);

    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>Estado de Cuenta - ${cust.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background: #f1f5f9; }
            .text-right { text-align: right; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>LIMPIEZA CAVIAHUE - ESTADO DE CUENTA CORRIENTE</h1>
            <p style="margin: 0; font-size: 13px;">Fecha de emisión: ${Formatter.date(new Date().toISOString())}</p>
            <p style="margin: 4px 0 0 0; font-size: 13px;"><strong>Cliente:</strong> ${cust.name} | CUIT: ${cust.cuit_dni || 'S/N'} | Saldo: ${Formatter.money(cust.current_balance)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Comprobante</th>
                <th>Detalle</th>
                <th class="text-right">Monto</th>
                <th class="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${movs.map(m => `
                <tr>
                  <td>${Formatter.date(m.date)}</td>
                  <td>${m.type}</td>
                  <td>${m.reference_id || '-'}</td>
                  <td>${m.notes || m.payment_method || '-'}</td>
                  <td class="text-right">${Formatter.money(m.amount)}</td>
                  <td class="text-right">${Formatter.money(m.balance_after)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  }
};
