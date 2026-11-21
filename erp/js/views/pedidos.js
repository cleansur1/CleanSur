// Módulo de Pedidos de Clientes para Limpieza Caviahue
// Estados: Nuevo, Preparando, Listo, Entregado. Conversión directa a Venta Facturada.

import { db } from '../db.js';
import { getAdminSession } from '../supabase_admin.js';
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from '../supabase_public.js';
import { Formatter } from '../models.js';

export const PedidosView = {
  render(container) {
    const orders = db.getOrders();

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Gestión de Pedidos & Preparación</h1>
            <p class="text-xs text-slate-500">Recepción de pedidos de hoteles, aparts y restaurantes antes de la facturación y despacho.</p>
          </div>
        </div>

        <!-- Tabla de Pedidos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Listado de Pedidos</h3>
            <span class="text-xs text-slate-500">${orders.length} pedidos</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-4">N° Pedido</th>
                  <th class="py-3 px-4">Fecha</th>
                  <th class="py-3 px-4">Cliente</th>
                  <th class="py-3 px-4">Estado</th>
                  <th class="py-3 px-4">Forma Pago Prevista</th>
                  <th class="py-3 px-4 text-right">Total Estimado</th>
                  <th class="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${orders.map(o => {
                  let badge = 'bg-blue-100 text-blue-800';
                  if (o.status === 'Preparando') badge = 'bg-amber-100 text-amber-800';
                  if (o.status === 'Listo') badge = 'bg-indigo-100 text-indigo-800';
                  if (o.status === 'Entregado') badge = 'bg-emerald-100 text-emerald-800';
                  if (o.status === 'Cancelado') badge = 'bg-rose-100 text-rose-800';

                  return `
                    <tr class="hover:bg-slate-50 transition">
                      <td class="py-3 px-4 font-mono font-bold text-slate-800">${o.order_number}</td>
                      <td class="py-3 px-4 text-slate-600">${Formatter.date(o.date)}</td>
                      <td class="py-3 px-4 font-bold text-slate-900">${o.customer_name}</td>
                      <td class="py-3 px-4">
                        <span class="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badge}">
                          ${o.status}
                        </span>
                      </td>
                      <td class="py-3 px-4 text-slate-600">${o.payment_method}</td>
                      <td class="py-3 px-4 text-right font-bold text-slate-900">${Formatter.money(o.total)}</td>
                      <td class="py-3 px-4 text-center space-x-2">
                        ${!['ENTREGADO','CANCELADO'].includes(String(o.status).toUpperCase()) && !o.converted_to_sale_number ? `
                          <button onclick="window.pedidosModule.convertOrder('${o.id}', this)" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shadow-sm">
                            Convertir en Venta
                          </button>
                        ` : `
                          <span class="text-slate-400 text-[10px]">${o.converted_to_sale_number || o.status}</span>
                        `}
                      </td>
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

window.pedidosModule = {
  async convertOrder(orderId, button) {
    const central = window.app.centralReadOnly;
    const message = central
      ? '¿Registrar la entrega y convertir el pedido en venta? Se conserva el estado de pago y el stock ya descontado.'
      : '¿Convertir este pedido en venta y registrar el movimiento de stock?';
    if (!confirm(message)) return;
    button.disabled = true;
    try {
      let sale;
      if (central) {
        const token = getAdminSession()?.access_token;
        if (!token) throw Error('Volvé a iniciar sesión en CleanSur.');
        const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/stayclean_staff_convert_order', {
          method: 'POST',
          headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_order_id: orderId })
        });
        sale = await response.json();
        if (!response.ok) throw Error(sale.message || 'No se pudo convertir el pedido.');
        db.centralSetTable('orders', db.getOrders().map(order => order.id === orderId
          ? { ...order, status: 'ENTREGADO', converted_to_sale_number: sale.sale_number } : order));
      } else {
        sale = db.convertOrderToSale(orderId);
      }
      window.app.showNotification('Venta ' + sale.sale_number + ' registrada', 'success');
      window.app.navigate('ventas');
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  }
};
