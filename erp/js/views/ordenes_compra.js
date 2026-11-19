// Módulo de Órdenes de Compra para Limpieza Caviahue
// Estados: Borrador, Enviada, Confirmada, Recibida. Al recibir mercadería, transforma en Compra con Costo Caviahue.

import { db } from '../db.js';
import { Formatter } from '../models.js';
import { getAdminSession } from '../supabase_admin.js';
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from '../supabase_public.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const numberOf = order => order.po_number || order.order_number;
const totalOf = order => order.estimated_total ?? order.total ?? 0;

function orderMessage(order) {
  return ['Hola, les enviamos el pedido de CleanSur ' + numberOf(order) + '.',
    ...order.items.map(item => '- ' + item.quantity + ' ' + (item.unit || '') + ' · ' +
      (item.sku ? item.sku + ' · ' : '') + (item.product_name || item.name)),
    '¿Nos confirman disponibilidad, precio y fecha de entrega? Gracias.'].join('\n');
}

function contactLinks(order) {
  if (!Array.isArray(order.items) || !order.items.length) return '';
  const supplier = db.getSupplier(order.supplier_id);
  const message = orderMessage(order);
  let phone = String(supplier?.whatsapp || supplier?.phone || '').replace(/\D/g, '');
  if (phone.length === 10) phone = '549' + phone;
  const whatsapp = /^549\d{10}$/.test(phone)
    ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)
    : 'https://wa.me/?text=' + encodeURIComponent(message);
  const email = supplier?.email ? '<a class="underline" href="mailto:' + encodeURIComponent(supplier.email) +
    '?subject=' + encodeURIComponent('Orden de compra CleanSur ' + numberOf(order)) +
    '&amp;body=' + encodeURIComponent(message) + '">Abrir correo</a>' : '';
  return '<a class="underline" target="_blank" rel="noopener" href="' + escape(whatsapp) + '">' +
    (/^549\d{10}$/.test(phone) ? 'Abrir WhatsApp' : 'Compartir por WhatsApp') + '</a> ' + email;
}


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
          <button data-purchase-order-control type="button" id="newPurchaseOrder" class="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Nueva orden de compra</button>
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
                    <td class="py-3 px-4 font-mono font-bold text-slate-800">${escape(numberOf(po))}</td>
                    <td class="py-3 px-4 text-slate-600">${Formatter.date(po.date)}</td>
                    <td class="py-3 px-4 font-medium text-slate-900">${escape(po.supplier_name)}</td>
                    <td class="py-3 px-4 text-slate-600">${po.expected_date ? Formatter.date(po.expected_date) : '—'}</td>
                    <td class="py-3 px-4">
                      <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${po.status === 'Recibida' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">
                        ${escape(po.status)}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right font-bold text-slate-900">${Formatter.money(totalOf(po))}</td>
                    <td class="py-3 px-4 text-center">
                      ${Array.isArray(po.items) && po.items.length ? `<details class="text-left">
                        <summary class="cursor-pointer">Ver pedido y enviar</summary>
                        <pre class="my-2 whitespace-pre-wrap text-xs">${escape(orderMessage(po))}</pre>
                        ${contactLinks(po)}
                      </details>` : ''}
                      ${!window.app.centralReadOnly && po.status !== 'Recibida' ? `
                        <button onclick="window.ordenesCompraModule.receivePO('${po.id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold">
                          Recibir Mercadería
                        </button>
                      ` : `
                        ${po.status === 'Recibida' ? '<span class="text-slate-400 text-[10px]">Ingresada a Stock</span>' : ''}
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

    container.querySelector('#newPurchaseOrder').onclick = () => this.openNewOrder(container);
    if (window.lucide) window.lucide.createIcons();
  },

  openNewOrder(container) {
    const suppliers = db.getSuppliers().filter(supplier => supplier.active !== false)
      .sort((left, right) => left.name.localeCompare(right.name, 'es'));
    const dialog = document.createElement('dialog');
    dialog.id = 'purchaseOrderDialog';
    dialog.setAttribute('aria-labelledby', 'purchaseOrderTitle');
    dialog.className = 'w-[calc(100%-2rem)] max-w-3xl rounded-xl p-6 shadow-xl backdrop:bg-slate-900/50';
    dialog.innerHTML = `<form class="space-y-4">
      <h2 id="purchaseOrderTitle" class="text-xl font-bold">Nueva orden de compra</h2>
      <label class="block">Proveedor
        <select name="supplier" required class="block w-full rounded border p-2">
          <option value="">Elegí un proveedor</option>
          ${suppliers.map(supplier => '<option value="' + escape(supplier.id) + '">' + escape(supplier.name) + '</option>').join('')}
        </select>
      </label>
      <p class="text-sm">Ingresá la cantidad de cada producto que quieras pedir.</p>
      <div data-products class="max-h-[45vh] overflow-auto"></div>
      <p data-error role="alert" class="text-sm text-red-700"></p>
      <div class="flex gap-3"><button type="submit" class="rounded bg-blue-700 px-4 py-2 text-white" disabled>Guardar orden</button>
        <button type="button" data-close class="rounded border px-4 py-2">Cancelar</button></div>
    </form>`;
    const form = dialog.querySelector('form');
    const supplierInput = form.elements.supplier;
    const productsBox = form.querySelector('[data-products]');
    const feedback = form.querySelector('[data-error]');
    const save = form.querySelector('[type=submit]');
    let products = [];
    let requestId = crypto.randomUUID();

    supplierInput.onchange = () => {
      const supplierId = supplierInput.value;
      const supplierProductIds = new Set(db.getPurchases()
        .filter(purchase => purchase.supplier_id === supplierId && !/^anulad|^cancelad/i.test(purchase.status || ''))
        .flatMap(purchase => Array.isArray(purchase.items) ? purchase.items.map(item => item.product_id) : []));
      products = supplierId ? db.getProducts().filter(product => product.active !== false && (
        product.preferred_supplier_id === supplierId || product.supplier_id === supplierId || supplierProductIds.has(product.id)
      )).sort((left, right) => left.name.localeCompare(right.name, 'es')) : [];
      productsBox.innerHTML = products.length ? products.map((product, index) => `
        <label class="flex items-center justify-between gap-3 border-b py-2 text-sm">
          <span>${escape(product.name)} <small>${escape(product.sku)} · ${escape(product.purchase_unit || 'unidad')}</small></span>
          <input type="number" min="0" max="100000" step="any" inputmode="decimal" data-quantity="${index}" placeholder="0" class="w-24 rounded border p-2">
        </label>`).join('') : (supplierId ? '<p>Este proveedor no tiene productos vinculados.</p>' : '');
      save.disabled = !products.length;
      feedback.textContent = '';
    };
    form.querySelector('[data-close]').onclick = () => { if (!supplierInput.disabled) dialog.close(); };
    dialog.addEventListener('cancel', event => { if (supplierInput.disabled) event.preventDefault(); });
    form.onsubmit = async event => {
      event.preventDefault();
      if (supplierInput.disabled) return;
      const supplier = db.getSupplier(supplierInput.value);
      if (!supplier) return;
      const items = products.flatMap((product, index) => {
        const quantity = Number(productsBox.querySelector('[data-quantity="' + index + '"]').value);
        return quantity > 0 ? [{
          product_id: product.id, product_name: product.name, sku: product.sku || '',
          unit: product.purchase_unit || 'unidad', quantity, unit_cost: Number(product.purchase_cost || 0)
        }] : [];
      });
      if (!items.length) { feedback.textContent = 'Ingresá una cantidad para al menos un producto.'; return; }
      save.disabled = true;
      supplierInput.disabled = true;
      feedback.textContent = '';
      try {
        let order;
        if (window.app.centralReadOnly) {
          const token = getAdminSession()?.access_token;
          if (!token) throw Error('Volvé a iniciar sesión para guardar la orden.');
          const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/stayclean_staff_create_purchase_order', {
            method: 'POST',
            headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_id: requestId, p_supplier: supplier.id, p_items: items })
          });
          order = await response.json();
          if (!response.ok) throw Error(order.message || 'No se pudo guardar la orden.');
          db.centralSetTable('purchase_orders', [order, ...db.getPurchaseOrders().filter(row => row.id !== order.id)]);
        } else {
          order = db.savePurchaseOrder({
            supplier_id: supplier.id, supplier_name: supplier.name, date: new Date().toISOString().slice(0, 10),
            items, total: items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
          });
        }
        dialog.close();
        this.render(container);
        const latest = container.querySelector('details');
        if (latest) latest.open = true;
        window.app.showNotification('Orden ' + numberOf(order) + ' guardada.', 'success');
      } catch (error) {
        feedback.textContent = error.message;
        supplierInput.disabled = false;
        save.disabled = false;
      }
    };
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
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
