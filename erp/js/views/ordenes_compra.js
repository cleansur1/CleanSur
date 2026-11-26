import { staffPresentations, presentationOptions } from '../presentations.js?v=1';
import { bindArchive, isCancelled } from './archive.js?v=2';
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
  return '<a class="rounded border p-2 text-green-700" target="_blank" rel="noopener" aria-label="Compartir por WhatsApp" title="Compartir por WhatsApp" href="' + escape(whatsapp) + '">' +
    '<i data-lucide="message-circle" class="h-4 w-4"></i></a>';
}


const canManage = order => /^(borrador|enviada|confirmada)$/i.test(order.status || '');

async function orderRpc(name, payload) {
  const token = getAdminSession()?.access_token;
  if (!token) throw Error('Volvé a iniciar sesión para guardar la orden.');
  const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const order = await response.json();
  if (!response.ok) throw Error(order.message || 'No se pudo guardar la orden.');
  db.centralSetTable('purchase_orders', [order, ...db.getPurchaseOrders().filter(row => row.id !== order.id)]);
  return order;
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
                  <tr data-archive-row ${isCancelled(po.status) ? `data-archive-id="${escape(po.id)}"` : ''} class="hover:bg-slate-50 transition">
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
                      <div class="flex justify-center gap-2 whitespace-nowrap" data-order-id="${escape(po.id)}" data-archive-actions>
                        <button type="button" data-purchase-order-control data-view-order aria-label="Ver orden" title="Ver" class="rounded border p-2"><i data-lucide="eye" class="h-4 w-4"></i></button>
                        ${canManage(po) ? `
                          <button type="button" data-purchase-order-control data-edit-order aria-label="Editar orden" title="Editar" class="rounded border p-2 text-blue-700"><i data-lucide="pencil" class="h-4 w-4"></i></button>
                          <button type="button" data-purchase-order-control data-delete-order aria-label="Eliminar orden" title="Eliminar" class="rounded border p-2 text-rose-700"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
                          ${contactLinks(po)}
                        ` : ''}
                      </div>
                      ${canManage(po) ? `
                        <button type="button" data-purchase-order-control onclick="window.ordenesCompraModule.receivePO('${po.id}', this)" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold">
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

    bindArchive(container, 'purchase-orders');
    container.querySelector('#newPurchaseOrder').onclick = () => this.openNewOrder(container);
    for (const actions of container.querySelectorAll('[data-order-id]')) {
      const order = pos.find(row => String(row.id) === actions.dataset.orderId);
      actions.querySelector('[data-view-order]').onclick = () => this.viewOrder(order);
      const edit = actions.querySelector('[data-edit-order]');
      const remove = actions.querySelector('[data-delete-order]');
      if (edit) edit.onclick = () => this.openNewOrder(container, order);
      if (remove) remove.onclick = async () => {
        if (!confirm('¿Cancelar la orden ' + numberOf(order) + '?')) return;
        remove.disabled = true;
        try {
          if (window.app.centralReadOnly) {
            await orderRpc('stayclean_staff_manage_purchase_order', { p_id: order.id, p_expected: order.items, p_items: null });
          } else {
            db.saveTable('purchase_orders', db.getPurchaseOrders().map(row => row.id === order.id ? { ...row, status: 'Cancelada' } : row));
          }
          if (window.app.currentRoute === 'ordenes_compra') this.render(container);
          window.app.showNotification('Orden cancelada.', 'success');
        } catch (error) {
          window.app.showNotification(error.message, 'error');
        } finally {
          remove.disabled = false;
        }
      };
    }
    if (window.lucide) window.lucide.createIcons();
  },

  viewOrder(order) {
    const dialog = document.createElement('dialog');
    dialog.id = 'purchaseOrderDialog';
    dialog.className = 'w-[calc(100%-2rem)] max-w-2xl rounded-xl p-6 shadow-xl backdrop:bg-slate-900/50';
    dialog.innerHTML = `<h2 class="text-xl font-bold">Orden ${escape(numberOf(order))}</h2>
      <p class="mt-1 text-sm">${escape(order.supplier_name)} · ${escape(order.status)}</p>
      <pre class="my-4 max-h-[55vh] overflow-auto whitespace-pre-wrap font-sans text-sm">${escape(order.items?.length ? orderMessage(order) : 'Sin productos registrados.')}</pre>
      <button type="button" class="rounded border px-4 py-2">Cerrar</button>`;
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  },

  async openNewOrder(container, existing = null) {
    let presentations=[];
    try { if (window.app.centralReadOnly) presentations=await staffPresentations(); }
    catch(error) { window.app.showNotification(error.message,'error'); return; }
    if(window.app.currentRoute!=='ordenes_compra') return;
    const suppliers = db.getSuppliers().filter(supplier => supplier.active !== false)
      .sort((left, right) => left.name.localeCompare(right.name, 'es'));
    const dialog = document.createElement('dialog');
    dialog.id = 'purchaseOrderDialog';
    dialog.setAttribute('aria-labelledby', 'purchaseOrderTitle');
    dialog.className = 'w-[calc(100%-2rem)] max-w-3xl rounded-xl p-6 shadow-xl backdrop:bg-slate-900/50';
    dialog.innerHTML = `<form class="space-y-4">
      <h2 id="purchaseOrderTitle" class="text-xl font-bold">${existing ? 'Editar orden ' + escape(numberOf(existing)) : 'Nueva orden de compra'}</h2>
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
    const requestId = crypto.randomUUID();
    const existingItems = new Map((existing?.items || []).map(item => [String(item.product_id), item]));

    supplierInput.onchange = () => {
      const supplierId = supplierInput.value;
      const supplierProductIds = new Set(db.getPurchases()
        .filter(purchase => purchase.supplier_id === supplierId && !/^anulad|^cancelad/i.test(purchase.status || ''))
        .flatMap(purchase => Array.isArray(purchase.items) ? purchase.items.map(item => item.product_id) : []));
      products = supplierId ? db.getProducts().filter(product => product.active !== false && (
        product.preferred_supplier_id === supplierId || product.supplier_id === supplierId || supplierProductIds.has(product.id)
      )).sort((left, right) => left.name.localeCompare(right.name, 'es')) : [];
      if (existing) {
        const listed = new Set(products.map(product => String(product.id)));
        for (const [id, item] of existingItems) {
          if (!listed.has(id)) products.push({ id, name: item.product_name || item.name || id, sku: item.sku, purchase_unit: item.unit });
        }
      }
      productsBox.innerHTML = products.length ? products.map((product, index) => `
        <label class="flex flex-wrap items-center justify-between gap-3 border-b py-2 text-sm">
          <span>${escape(product.name)} <small>${escape(product.sku)} · ${escape(product.purchase_unit || 'unidad')}</small></span>
          <select data-order-presentation="${index}" aria-label="Presentación" class="max-w-40 rounded border p-2">${presentationOptions(presentations,product.id,existingItems.get(String(product.id))?.presentation_id)}</select>
          <input type="number" min="0" max="100000" step="any" inputmode="decimal" data-quantity="${index}" value="${escape(existingItems.get(String(product.id))?.quantity ?? '')}" placeholder="0" class="w-24 rounded border p-2">
        </label>`).join('') : (supplierId ? '<p>Este proveedor no tiene productos vinculados.</p>' : '');
      save.disabled = !products.length;
      feedback.textContent = '';
    };
    if (existing) {
      supplierInput.value = existing.supplier_id;
      supplierInput.onchange();
      supplierInput.disabled = true;
    }
    let saving = false;
    form.querySelector('[data-close]').onclick = () => { if (!saving) dialog.close(); };
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving) return;
      const supplier = db.getSupplier(supplierInput.value);
      if (!supplier) return;
      const items = products.flatMap((product, index) => {
        const quantity = Number(productsBox.querySelector('[data-quantity="' + index + '"]').value);
        const previous = existingItems.get(String(product.id));
        const presentationId=productsBox.querySelector('[data-order-presentation="'+index+'"]').value;
        const presentation=presentations.find(row=>row.id===presentationId);
        const unitCost=previous && (previous.presentation_id || '')===presentationId ? previous.unit_cost :
          Number(product.purchase_cost || 0)*(presentation ? presentation.factor/Number(product.conversion_factor || 1) : 1);
        return quantity>0 ? [{
          product_id:product.id,product_name:product.name,sku:presentation?.code || product.sku || '',
          presentation_id:presentationId || null,unit:presentation?.name || product.purchase_unit || 'unidad',
          quantity,unit_cost:Math.round(unitCost*100)/100
        }] : [];
      });
      if (!items.length) { feedback.textContent = 'Ingresá una cantidad para al menos un producto.'; return; }
      saving = true;
      save.disabled = true;
      supplierInput.disabled = true;
      feedback.textContent = '';
      try {
        let order;
        if (window.app.centralReadOnly) {
          order = existing
            ? await orderRpc('stayclean_staff_manage_purchase_order', { p_id: existing.id, p_expected: existing.items, p_items: items })
            : await orderRpc('stayclean_staff_create_purchase_order', { p_id: requestId, p_supplier: supplier.id, p_items: items });
        } else {
          if (existing) {
            order = { ...existing, items, estimated_total: items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0) };
            db.saveTable('purchase_orders', db.getPurchaseOrders().map(row => row.id === existing.id ? order : row));
          } else order = db.savePurchaseOrder({
            supplier_id: supplier.id, supplier_name: supplier.name, date: new Date().toISOString().slice(0, 10),
            items, total: items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
          });
        }
        dialog.close();
        if (window.app.currentRoute === 'ordenes_compra') this.render(container);
        window.app.showNotification('Orden ' + numberOf(order) + ' guardada.', 'success');
      } catch (error) {
        feedback.textContent = error.message;
        saving = false;
        supplierInput.disabled = Boolean(existing);
        save.disabled = false;
      }
    };
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }
};

window.ordenesCompraModule = {
  async receivePO(poId, button) {
    const pos = db.getPurchaseOrders();
    const po = pos.find(p => p.id === poId);
    if (!po) return;
    if (window.app.centralReadOnly) {
      const invoice=prompt('Número de factura o remito para recibir ' + numberOf(po));
      if (!invoice?.trim()) return;
      button.disabled=true;
      try {
        await orderRpc('stayclean_staff_receive_purchase_order',{p_id:poId,p_invoice:invoice.trim()});
        await window.comprasModule.refreshCentralPurchases();
        window.app.showNotification('Orden recibida e inventario actualizado.','success');
        window.app.navigate('ordenes_compra');
      } catch(error) { window.app.showNotification(error.message,'error'); }
      finally { button.disabled=false; }
      return;
    }

    if (confirm(`¿Marcar la orden ${po.order_number} como recibida e ingresar al módulo de Compras para cargar el flete Caviahue?`)) {
      po.status = 'Recibida';
      db.saveTable('purchase_orders', pos);
      window.app.showNotification(`Orden ${po.order_number} marcada como recibida.`, 'success');
      window.app.navigate('compras', { action: 'new' });
    }
  }
};
