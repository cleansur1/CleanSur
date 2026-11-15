// Módulo de Órdenes de Compra para Limpieza Caviahue
// Estados: Borrador, Enviada, Confirmada, Recibida. Al recibir mercadería, transforma en Compra con Costo Caviahue.

import { db } from '../db.js';
import { Formatter } from '../models.js';

export const OrdenesCompraView = {
  render(container) {
    const pos = db.getPurchaseOrders();

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Órdenes de Compra a Proveedores</h1>
            <p class="text-xs text-slate-500">Planificación y emisión de pedidos a fábricas y distribuidores mayoristas.</p>
          </div>
          <button onclick="window.app.navigate('reposicion')" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
            <i data-lucide="sparkles" class="w-4 h-4"></i> Ir a Reposición Sugerida
          </button>
        </div>

        <!-- Tabla de Órdenes de Compra -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Órdenes Emitidas</h3>
            <span class="text-xs text-slate-500">${pos.length} órdenes</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-4">N° OC</th>
                  <th class="py-3 px-4">Fecha Emisión</th>
                  <th class="py-3 px-4">Proveedor</th>
                  <th class="py-3 px-4">Llegada Estimada</th>
                  <th class="py-3 px-4">Estado</th>
                  <th class="py-3 px-4 text-right">Total Estimado</th>
                  <th class="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${pos.map(po => `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="py-3 px-4 font-mono font-bold text-slate-800">${po.order_number}</td>
                    <td class="py-3 px-4 text-slate-600">${Formatter.date(po.date)}</td>
                    <td class="py-3 px-4 font-medium text-slate-900">${po.supplier_name}</td>
                    <td class="py-3 px-4 text-slate-600">${Formatter.date(po.expected_date)}</td>
                    <td class="py-3 px-4">
                      <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${po.status === 'Recibida' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
                        ${po.status}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right font-bold text-slate-900">${Formatter.money(po.total)}</td>
                    <td class="py-3 px-4 text-center">
                      ${po.status !== 'Recibida' ? `
                        <button onclick="window.ordenesCompraModule.receivePO('${po.id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold">
                          Recibir Mercadería
                        </button>
                      ` : `
                        <span class="text-slate-400 text-[10px]">Ingresada a Stock</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.ordenesCompraModule = {
  receivePO(poId) {
    const pos = db.getPurchaseOrders();
    const po = pos.find(p => p.id === poId);
    if (!po) return;

    if (confirm(`¿Marcar la orden ${po.order_number} como recibida e ingresar al módulo de Compras para cargar el flete Caviahue?`)) {
      po.status = 'Recibida';
      db.saveTable('purchase_orders', pos);
      window.app.showNotification(`Orden ${po.order_number} marcada como recibida.`, 'success');
      window.app.navigate('compras', { action: 'new' });
    }
  }
};
