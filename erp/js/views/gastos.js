// Módulo de Gastos Operativos para Limpieza Caviahue
// Control de estructura de costos (Alquiler, Sueldos, Gas, EPEN, Fletes) separado del CMV.

import { db } from '../db.js';
import { Formatter } from '../models.js';

export const GastosView = {
  render(container) {
    const expenses = db.getExpenses();
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Agrupación por categoría
    const byCategory = {};
    expenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Gastos Operativos del Negocio</h1>
            <p class="text-xs text-slate-500">Alquiler local, sueldos, gas Hidenesa, energía EPEN y honorarios (no mezclados con CMV).</p>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right mr-2">
              <span class="text-xs text-slate-500 block">Total Gastos Registrados:</span>
              <span class="text-xl font-extrabold text-rose-700">${Formatter.money(totalExpenses)}</span>
            </div>
            <button onclick="window.gastosModule.openNewModal()" class="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> + Registrar Gasto
            </button>
          </div>
        </div>

        <!-- Resumen por Categorías -->
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          ${Object.keys(byCategory).map(cat => `
            <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <div class="text-xs text-slate-500 font-medium truncate">${cat}</div>
              <div class="text-sm font-bold text-slate-800 mt-1">${Formatter.money(byCategory[cat])}</div>
            </div>
          `).join('')}
        </div>

        <!-- Tabla de Gastos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Historial de Comprobantes de Gastos</h3>
            <span class="text-xs text-slate-500">${expenses.length} registros</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-4">Fecha</th>
                  <th class="py-3 px-4">Categoría</th>
                  <th class="py-3 px-4">Descripción / Concepto</th>
                  <th class="py-3 px-4">N° Comprobante</th>
                  <th class="py-3 px-4">Forma de Pago</th>
                  <th class="py-3 px-4 text-center">Recurrente</th>
                  <th class="py-3 px-4 text-right">Importe ($ ARS)</th>
                  <th class="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${expenses.map(e => `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="py-3 px-4 text-slate-600">${Formatter.date(e.date)}</td>
                    <td class="py-3 px-4">
                      <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                        ${e.category}
                      </span>
                    </td>
                    <td class="py-3 px-4 font-medium text-slate-900">${e.description}</td>
                    <td class="py-3 px-4 font-mono text-slate-500">${e.receipt_number || '-'}</td>
                    <td class="py-3 px-4 text-slate-600">${e.payment_method}</td>
                    <td class="py-3 px-4 text-center">
                      <span class="text-[11px] ${e.is_recurring ? 'text-blue-600 font-semibold' : 'text-slate-400'}">
                        ${e.is_recurring ? 'Mensual' : 'Puntual'}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right font-bold text-rose-700">${Formatter.money(e.amount)}</td>
                    <td class="py-3 px-4 text-center space-x-1">
                      <button onclick="window.gastosModule.openEditModal('${e.id}')" title="Editar Gasto" class="p-1 text-blue-600 hover:bg-blue-50 rounded">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                      </button>
                      <button onclick="window.gastosModule.deleteExp('${e.id}')" title="Eliminar Gasto" class="p-1 text-rose-500 hover:bg-rose-50 rounded">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal de Registro de Gasto -->
      <div id="newExpenseModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 class="text-base font-bold text-slate-800" id="expModalTitle">Registrar Gasto Operativo</h3>
            <button onclick="document.getElementById('newExpenseModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="window.gastosModule.submitExpense(event)" class="space-y-4 text-xs">
            <input type="hidden" id="expId" value="">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha</label>
                <input type="date" id="expDate" required value="${new Date().toISOString().substring(0, 10)}" class="w-full border border-slate-300 rounded-lg p-2">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Categoría *</label>
                <select id="expCategory" required class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                  <option value="Alquiler">Alquiler Local / Depósito</option>
                  <option value="Sueldos">Sueldos y Cargas Sociales</option>
                  <option value="Electricidad">Electricidad (EPEN)</option>
                  <option value="Gas">Gas (Hidenesa / Garrafones)</option>
                  <option value="Internet">Internet / Comunicaciones</option>
                  <option value="Transporte">Combustible / Repartos Caviahue</option>
                  <option value="Contador">Honorarios Contables</option>
                  <option value="Impuestos">Impuestos / Tasas Municipales</option>
                  <option value="Marketing">Marketing & Publicidad</option>
                  <option value="Mantenimiento">Mantenimiento de Edificio</option>
                  <option value="Comisiones">Comisiones Posnet / Bancarias</option>
                  <option value="Otros">Otros Gastos</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Descripción / Concepto *</label>
              <input type="text" id="expDescription" required placeholder="Ej: Factura gas depósito invierno" class="w-full border border-slate-300 rounded-lg p-2 font-medium">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Importe ($ ARS) *</label>
                <input type="number" id="expAmount" required min="1" step="0.01" placeholder="Ej: 45000" class="w-full border border-rose-300 rounded-lg p-2 font-bold text-rose-700 text-sm">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Medio de Pago</label>
                <select id="expPaymentMethod" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Débito">Tarjeta Débito</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Crédito">Tarjeta Crédito</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">N° Comprobante / Factura (Opcional)</label>
              <input type="text" id="expReceipt" placeholder="FAC-B 0001-0000492" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
            </div>

            <div class="flex items-center gap-2 pt-1">
              <input type="checkbox" id="expRecurring" class="w-4 h-4 text-rose-600 rounded">
              <label for="expRecurring" class="font-medium text-slate-700">Es un gasto mensual recurrente</label>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onclick="document.getElementById('newExpenseModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg">Cancelar</button>
              <button type="submit" class="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold">Guardar Gasto</button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.gastosModule = {
  openNewModal() {
    const modal = document.getElementById('newExpenseModal');
    if (!modal) return;
    document.getElementById('expModalTitle').innerText = 'Registrar Gasto Operativo';
    document.getElementById('expId').value = '';
    document.getElementById('expDate').value = new Date().toISOString().substring(0, 10);
    document.getElementById('expDescription').value = '';
    document.getElementById('expAmount').value = '';
    document.getElementById('expReceipt').value = '';
    document.getElementById('expRecurring').checked = false;
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  openEditModal(id) {
    const expenses = db.getExpenses();
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    const modal = document.getElementById('newExpenseModal');
    if (!modal) return;

    document.getElementById('expModalTitle').innerText = 'Editar Gasto Operativo';
    document.getElementById('expId').value = exp.id;
    document.getElementById('expDate').value = exp.date;
    document.getElementById('expCategory').value = exp.category;
    document.getElementById('expDescription').value = exp.description;
    document.getElementById('expAmount').value = exp.amount;
    document.getElementById('expPaymentMethod').value = exp.payment_method;
    document.getElementById('expReceipt').value = exp.receipt_number || '';
    document.getElementById('expRecurring').checked = !!exp.is_recurring;

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  submitExpense(e) {
    e.preventDefault();
    const id = document.getElementById('expId')?.value;
    const date = document.getElementById('expDate')?.value;
    const category = document.getElementById('expCategory')?.value;
    const description = document.getElementById('expDescription')?.value;
    const amount = Number(document.getElementById('expAmount')?.value) || 0;
    const payment_method = document.getElementById('expPaymentMethod')?.value;
    const receipt_number = document.getElementById('expReceipt')?.value;
    const is_recurring = document.getElementById('expRecurring')?.checked || false;

    if (!description || amount <= 0) {
      alert('Ingresá una descripción y un monto válido.');
      return;
    }

    try {
      const expData = {
        date,
        category,
        description,
        amount,
        payment_method,
        receipt_number,
        is_recurring
      };
      if (id) {
        expData.id = id;
      }

      db.saveExpense(expData);

      document.getElementById('newExpenseModal').classList.add('hidden');
      window.app.showNotification(`Gasto ${id ? 'actualizado' : 'registrado'} con éxito (${Formatter.money(amount)}).`, 'success');
      window.app.navigate('gastos');
    } catch (err) {
      alert(err.message);
    }
  },

  deleteExp(id) {
    if (confirm('¿Eliminar este registro de gasto? Esta acción no se puede deshacer.')) {
      db.deleteExpense(id);
      window.app.showNotification('Gasto eliminado correctamente.', 'info');
      window.app.navigate('gastos');
    }
  }
};
