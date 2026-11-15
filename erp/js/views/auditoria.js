// Módulo de Auditoría & Trazabilidad para Limpieza Caviahue
// Registro cronológico de acciones críticas (ventas, compras, ajustes de inventario, cambios de precios y roles).

import { db } from '../db.js';
import { Formatter } from '../models.js';

export const AuditoriaView = {
  render(container) {
    const logs = db.getTable('audit_log') || [];

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Registro de Auditoría & Trazabilidad</h1>
            <p class="text-xs text-slate-500">Historial inmutable de transacciones, anulaciones, ajustes de inventario y modificaciones de costos.</p>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Eventos Auditados del Sistema</h3>
            <span class="text-xs text-slate-500">${logs.length} registros</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-4">Fecha y Hora</th>
                  <th class="py-3 px-4">Usuario</th>
                  <th class="py-3 px-4">Rol</th>
                  <th class="py-3 px-4">Módulo</th>
                  <th class="py-3 px-4">Acción</th>
                  <th class="py-3 px-4">Detalle de la Operación</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${logs.map(l => {
                  let badge = 'bg-slate-100 text-slate-800';
                  if (l.action.includes('VENTA')) badge = 'bg-emerald-100 text-emerald-800';
                  if (l.action.includes('COMPRA')) badge = 'bg-blue-100 text-blue-800';
                  if (l.action.includes('AJUSTE') || l.action.includes('ANULAR')) badge = 'bg-rose-100 text-rose-800';
                  if (l.action.includes('COBRANZA')) badge = 'bg-indigo-100 text-indigo-800';

                  return `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="py-2.5 px-4 font-mono text-slate-600">${Formatter.dateTime(l.timestamp)}</td>
                      <td class="py-2.5 px-4 font-bold text-slate-900">${l.user_name}</td>
                      <td class="py-2.5 px-4">
                        <span class="text-[10px] font-semibold text-slate-500">${l.user_role}</span>
                      </td>
                      <td class="py-2.5 px-4 font-mono text-[11px] text-slate-500">${l.module}</td>
                      <td class="py-2.5 px-4">
                        <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${badge}">
                          ${l.action}
                        </span>
                      </td>
                      <td class="py-2.5 px-4 text-slate-700 max-w-lg truncate font-medium">${l.details}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};
