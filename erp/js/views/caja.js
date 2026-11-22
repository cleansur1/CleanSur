// Módulo de Caja Diaria, Arqueo Obligatorio & Cierre con Lote ARCA
// Limpieza Caviahue ERP
import { renderCentralCash } from './caja_central.js';
import { db } from '../db.js';
import { Formatters } from '../models.js';

export const CajaView = {
  render(container) {
    if (window.app.centralReadOnly) return renderCentralCash(container);
    const todayStr = new Date().toISOString().substring(0, 10);
    const registers = db.getCashRegisters();
    const activeRegister = registers.find(r => r.status === 'ABIERTA');
    const summary = db.getCashSummary(todayStr);
    const currentUser = db.getCurrentUser();

    // Comprobar si hay ventas hoy y la caja está cerrada o no abierta
    const hasSalesToday = summary.salesTotal > 0;
    const isClosedToday = registers.some(r => r.date === todayStr && r.status === 'CERRADA');

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-6xl mx-auto">
        <!-- Encabezado -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${activeRegister ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}">
                <i data-lucide="${activeRegister ? 'unlock' : 'lock'}" class="w-3.5 h-3.5 mr-1 inline"></i>
                Caja ${activeRegister ? 'ABIERTA' : (isClosedToday ? 'CERRADA HOY' : 'PENDIENTE DE APERTURA')}
              </span>
              ${hasSalesToday && !isClosedToday ? `
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 animate-pulse">
                  <i data-lucide="alert-circle" class="w-3.5 h-3.5 mr-1 inline"></i> Cierre Diario Requerido
                </span>
              ` : ''}
            </div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-1">Control de Caja Diaria & Arqueo</h1>
            <p class="text-xs text-slate-500">Gestión de turnos de caja, arqueo físico de billetes y emisión consolidada de lotes ARCA al final del día.</p>
          </div>

          <div class="flex gap-2">
            ${!activeRegister && !isClosedToday ? `
              <button onclick="window.cajaModule.openRegisterModal()" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5">
                <i data-lucide="key" class="w-4 h-4"></i> Abrir Caja del Día
              </button>
            ` : ''}
            ${activeRegister ? `
              <button onclick="window.cajaModule.openCloseModal()" class="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5">
                <i data-lucide="lock" class="w-4 h-4"></i> Cerrar Caja & Emitir Lote ARCA
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Alerta reglamentaria si hubo ventas -->
        ${hasSalesToday && !isClosedToday ? `
          <div class="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl text-xs text-amber-900 space-y-1">
            <div class="flex items-center gap-2 font-bold text-sm">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600"></i>
              Regla Operativa Obligatoria: Cierre de Turno y Lote ARCA
            </div>
            <p>Se registraron ventas en el día de hoy (${summary.salesCount} operaciones por ${Formatters.currency(summary.salesTotal)}). Debe realizarse el Arqueo físico de caja antes de finalizar la jornada. Al cerrar la caja, el sistema emitirá automáticamente el <b>Lote de Facturas Electrónicas ARCA</b> correspondiente.</p>
          </div>
        ` : ''}

        <!-- Resumen del Día Actual -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Fondo Inicial / Apertura</span>
            <span class="text-xl font-bold text-slate-800 mt-1 block">${Formatters.currency(summary.initialCash)}</span>
            <span class="text-[11px] text-slate-400">Efectivo en gaveta</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Ventas en Efectivo</span>
            <span class="text-xl font-bold text-emerald-600 mt-1 block">+${Formatters.currency(summary.salesCash)}</span>
            <span class="text-[11px] text-slate-400">${summary.breakdown['Efectivo']?.count || 0} cobros</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Gastos en Efectivo</span>
            <span class="text-xl font-bold text-rose-600 mt-1 block">-${Formatters.currency(summary.expensesTotal)}</span>
            <span class="text-[11px] text-slate-400">${summary.expenses.length} retiros</span>
          </div>

          <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-sm">
            <span class="text-xs font-semibold text-indigo-900 block">Efectivo Teórico en Caja</span>
            <span class="text-xl font-bold text-indigo-700 mt-1 block">${Formatters.currency(summary.expectedCash)}</span>
            <span class="text-[11px] text-indigo-600 font-medium">Debe haber en el arqueo</span>
          </div>
        </div>

        <!-- Desglose de Ventas por Medio de Pago -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 class="text-sm font-bold text-slate-800 flex items-center justify-between">
              <span>Desglose de Facturación por Medio de Pago (${Formatters.date(todayStr)})</span>
              <span class="text-xs text-indigo-600 font-normal font-mono">Total: ${Formatters.currency(summary.salesTotal)}</span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              ${Object.entries(summary.breakdown).map(([method, data]) => `
                <div class="p-3.5 rounded-lg border border-slate-100 bg-slate-50/70 space-y-1">
                  <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-700 flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full ${method === 'Efectivo' ? 'bg-emerald-500' : (method === 'Cuenta Corriente' ? 'bg-amber-500' : 'bg-blue-500')}"></span>
                      ${method}
                    </span>
                    <span class="text-[11px] text-slate-400 font-mono">${data.count} ops</span>
                  </div>
                  <div class="text-base font-bold text-slate-800">
                    ${Formatters.currency(data.total)}
                  </div>
                  <div class="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                    <div class="bg-indigo-600 h-full" style="width: ${summary.salesTotal > 0 ? (data.total / summary.salesTotal * 100) : 0}%"></div>
                  </div>
                </div>
              `).join('')}
            </div>

            <!-- Lista de Ventas del Turno -->
            <div class="mt-4 pt-4 border-t border-slate-100">
              <h4 class="text-xs font-bold text-slate-700 mb-2">Comprobantes Emitidos Hoy (${summary.sales.length})</h4>
              <div class="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
                ${summary.sales.length === 0 ? `
                  <p class="text-slate-400 py-3 text-center">No hay ventas registradas en el día de hoy.</p>
                ` : summary.sales.map(s => `
                  <div class="py-2 flex justify-between items-center hover:bg-slate-50 px-2 rounded">
                    <div>
                      <span class="font-mono font-bold text-slate-800">${s.sale_number}</span>
                      <span class="text-slate-500 ml-2">${s.customer_name}</span>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ml-1.5">${s.payment_method}</span>
                    </div>
                    <span class="font-bold text-slate-900">${Formatters.currency(s.total)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Panel de Estado ARCA & Acciones de Cierre -->
          <div class="space-y-4">
            <div class="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-300">Emisión Electrónica</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">ARCA Lotes</span>
              </div>
              <div>
                <p class="text-xs text-slate-400">Comprobantes pendientes de lote hoy:</p>
                <p class="text-3xl font-extrabold text-white mt-1">${summary.sales.length}</p>
                <p class="text-[11px] text-slate-400 mt-1">Se consolidarán y enviarán a los servidores de ARCA al realizar el cierre definitivo.</p>
              </div>

              ${activeRegister ? `
                <button onclick="window.cajaModule.openCloseModal()" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow">
                  <i data-lucide="send" class="w-4 h-4"></i> Cerrar Caja & Transmitir Lote
                </button>
              ` : `
                <div class="p-3 bg-white/5 rounded-lg text-xs text-slate-300">
                  <i data-lucide="info" class="w-3.5 h-3.5 inline mr-1 text-sky-400"></i>
                  La caja se encuentra cerrada o sin turno activo.
                </div>
              `}
            </div>

            <!-- Retiros / Gastos de Caja del Turno -->
            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-slate-800">Gastos Pagados en Efectivo Hoy</h4>
                <button onclick="window.location.hash='#/gastos'" class="text-[11px] text-indigo-600 hover:underline">+ Cargar Gasto</button>
              </div>
              <div class="divide-y divide-slate-100 text-xs">
                ${summary.expenses.length === 0 ? `
                  <p class="text-slate-400 py-2 text-center text-[11px]">Sin retiros de gastos hoy.</p>
                ` : summary.expenses.map(e => `
                  <div class="py-1.5 flex justify-between items-center">
                    <div>
                      <span class="font-medium text-slate-700">${e.category}</span>
                      <p class="text-[10px] text-slate-400">${e.description || 'Sin notas'}</p>
                    </div>
                    <span class="font-bold text-rose-600">-${Formatters.currency(e.amount)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Historial de Cierres Anteriores -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 class="text-sm font-bold text-slate-800">Historial de Turnos y Cierres de Caja</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 text-[11px] uppercase">
                <tr>
                  <th class="p-3">Fecha</th>
                  <th class="p-3">Estado</th>
                  <th class="p-3">Responsable</th>
                  <th class="p-3 text-right">Fondo Inicial</th>
                  <th class="p-3 text-right">Ventas Totales</th>
                  <th class="p-3 text-right">Efectivo Teórico</th>
                  <th class="p-3 text-right">Arqueo Contado</th>
                  <th class="p-3 text-center">Diferencia</th>
                  <th class="p-3 text-center">Lote ARCA</th>
                  <th class="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${registers.length === 0 ? `
                  <tr><td colspan="10" class="text-center p-6 text-slate-400">No hay registros de caja aún.</td></tr>
                ` : registers.map(r => `
                  <tr class="hover:bg-slate-50">
                    <td class="p-3 font-semibold text-slate-800">${Formatters.date(r.date)}</td>
                    <td class="p-3">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'ABIERTA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
                        ${r.status}
                      </span>
                    </td>
                    <td class="p-3">${r.user_name || 'Admin'}</td>
                    <td class="p-3 text-right font-mono">${Formatters.currency(r.initial_cash)}</td>
                    <td class="p-3 text-right font-bold text-slate-900">${Formatters.currency(r.sales_total || 0)}</td>
                    <td class="p-3 text-right font-mono">${Formatters.currency(r.expected_cash || 0)}</td>
                    <td class="p-3 text-right font-mono font-bold">${r.status === 'CERRADA' ? Formatters.currency(r.counted_cash) : '-'}</td>
                    <td class="p-3 text-center">
                      ${r.status === 'CERRADA' ? `
                        <span class="font-bold text-[11px] ${r.difference === 0 ? 'text-emerald-600' : (r.difference < 0 ? 'text-rose-600' : 'text-blue-600')}">
                          ${r.difference > 0 ? '+' : ''}${Formatters.currency(r.difference)}
                        </span>
                      ` : '-'}
                    </td>
                    <td class="p-3 text-center">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${r.arca_batch_emitted ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}">
                        ${r.arca_batch_emitted ? 'Emitido ✓' : 'Pendiente'}
                      </span>
                    </td>
                    <td class="p-3 text-right">
                      <button onclick="window.cajaModule.viewRegisterDetail('${r.id}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] text-slate-700 font-medium">
                        Detalle
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Apertura de Caja -->
      <div id="open-register-modal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-base font-bold text-slate-800">Apertura de Caja Diaria</h3>
            <button onclick="document.getElementById('open-register-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <p class="text-xs text-slate-500">Ingresá el importe de billetes con el que arranca la jornada para dar inicio al turno.</p>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Monto en Efectivo Inicial ($)</label>
            <input type="number" id="open-initial-cash" value="15000" class="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold">
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button onclick="document.getElementById('open-register-modal').classList.add('hidden')" class="px-3 py-2 text-xs text-slate-600">Cancelar</button>
            <button onclick="window.cajaModule.confirmOpenRegister()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow">
              Abrir Turno
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Cierre de Caja & Arqueo -->
      <div id="close-register-modal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-base font-bold text-slate-800">Arqueo & Cierre de Caja</h3>
            <button onclick="document.getElementById('close-register-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          
          <div class="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-500">Fondo inicial:</span>
              <span class="font-semibold">${Formatters.currency(summary.initialCash)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Ventas en efectivo (+):</span>
              <span class="font-semibold text-emerald-600">${Formatters.currency(summary.salesCash)}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">Gastos en efectivo (-):</span>
              <span class="font-semibold text-rose-600">-${Formatters.currency(summary.expensesTotal)}</span>
            </div>
            <div class="flex justify-between pt-1 border-t border-slate-200 font-bold">
              <span class="text-slate-800">Efectivo Teórico esperado:</span>
              <span class="text-indigo-700 font-mono" id="close-expected-amount" data-val="${summary.expectedCash}">${Formatters.currency(summary.expectedCash)}</span>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Efectivo Real Contado en Gaveta ($)</label>
            <input type="number" id="close-counted-cash" value="${summary.expectedCash}" class="w-full p-2.5 border border-slate-300 rounded-lg text-base font-bold text-slate-800" oninput="window.cajaModule.updateDiff()">
            <div id="close-diff-indicator" class="text-xs font-bold mt-1 text-emerald-600">
              Diferencia: $0,00 (Caja cuadrada exacta)
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Observaciones / Justificación de Arqueo</label>
            <textarea id="close-notes" rows="2" placeholder="Ej: Sin novedades, billetes entregados al gerente." class="w-full p-2 border border-slate-300 rounded-lg text-xs"></textarea>
          </div>

          <div class="bg-indigo-50 border border-indigo-200 p-3 rounded-lg text-xs text-indigo-900 space-y-1">
            <div class="flex items-center gap-1.5 font-bold">
              <i data-lucide="send" class="w-3.5 h-3.5 text-indigo-600"></i> Emisión Automática ARCA
            </div>
            <p class="text-[11px] text-indigo-800">Al confirmar el cierre, se emitirá el lote fiscal con CAE para todas las ventas realizadas hoy.</p>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button onclick="document.getElementById('close-register-modal').classList.add('hidden')" class="px-3 py-2 text-xs text-slate-600">Cancelar</button>
            <button onclick="window.cajaModule.confirmCloseRegister()" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow">
              Confirmar Cierre & Lote ARCA
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.initHandlers();
  },

  initHandlers() {
    window.cajaModule = {
      openRegisterModal: () => {
        document.getElementById('open-register-modal').classList.remove('hidden');
      },

      confirmOpenRegister: () => {
        const initialCash = Number(document.getElementById('open-initial-cash').value) || 0;
        try {
          db.openCashRegister(initialCash);
          document.getElementById('open-register-modal').classList.add('hidden');
          CajaView.render(document.getElementById('app-content'));
        } catch (e) {
          alert('Error: ' + e.message);
        }
      },

      openCloseModal: () => {
        document.getElementById('close-register-modal').classList.remove('hidden');
        this.updateDiff();
      },

      updateDiff: () => {
        const expected = Number(document.getElementById('close-expected-amount').dataset.val) || 0;
        const counted = Number(document.getElementById('close-counted-cash').value) || 0;
        const diff = counted - expected;
        const diffEl = document.getElementById('close-diff-indicator');

        if (diff === 0) {
          diffEl.className = 'text-xs font-bold mt-1 text-emerald-600';
          diffEl.innerText = 'Diferencia: $0,00 (Caja cuadrada exacta)';
        } else if (diff > 0) {
          diffEl.className = 'text-xs font-bold mt-1 text-blue-600';
          diffEl.innerText = `Sobrante: +${Formatters.currency(diff)}`;
        } else {
          diffEl.className = 'text-xs font-bold mt-1 text-rose-600';
          diffEl.innerText = `Faltante: -${Formatters.currency(Math.abs(diff))}`;
        }
      },

      confirmCloseRegister: () => {
        const counted = Number(document.getElementById('close-counted-cash').value) || 0;
        const notes = document.getElementById('close-notes').value;

        try {
          const res = db.closeCashRegister(counted, notes);
          document.getElementById('close-register-modal').classList.add('hidden');
          alert(`¡Caja cerrada con éxito!\nArqueo contado: ${Formatters.currency(counted)}\nDiferencia: ${Formatters.currency(res.diff)}\nLote ARCA emitido: ${res.arcaBatchResult ? res.arcaBatchResult.emittedCount + ' comprobantes generados' : 'Al día'}`);
          CajaView.render(document.getElementById('app-content'));
        } catch (e) {
          alert('Error al cerrar caja: ' + e.message);
        }
      },

      viewRegisterDetail: (regId) => {
        const reg = db.getCashRegisters().find(r => r.id === regId);
        if (!reg) return;
        alert(`Detalle Cierre de Caja (${Formatters.date(reg.date)}):\n- Responsable: ${reg.user_name}\n- Fondo Inicial: ${Formatters.currency(reg.initial_cash)}\n- Ventas Totales: ${Formatters.currency(reg.sales_total)}\n- Efectivo Teórico: ${Formatters.currency(reg.expected_cash)}\n- Arqueo Contado: ${Formatters.currency(reg.counted_cash)}\n- Diferencia: ${Formatters.currency(reg.difference)}\n- Lote ARCA: ${reg.arca_batch_emitted ? 'Emitido con éxito' : 'Sin emisión'}\n- Notas: ${reg.notes || 'Sin notas'}`);
      }
    };
  }
};
