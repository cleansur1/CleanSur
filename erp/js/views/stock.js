import { setCentralStock, readCentral } from '../supabase_erp_adapter.js';
// Módulo de Inventario & Stock para Limpieza Caviahue
// Stock valorizado, cálculo de días de stock/cobertura, ajuste manual obligatorio con trazabilidad y filtros.

import { db } from '../db.js';
import { Formatter, InventoryAnalytics } from '../models.js';

export const StockView = {
  render(container) {
    const products = db.getProducts();
    const movements = db.getInventoryMovements();

    // Métricas globales de stock
    const stockValuedCost = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.caviahue_cost || 0)), 0);
    const stockValuedSale = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.sale_price || 0)), 0);
    const lowStockCount = products.filter(p => p.current_stock > 0 && p.current_stock <= (p.min_stock || 5)).length;
    const outOfStockCount = products.filter(p => p.current_stock <= 0).length;

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Control de Stock & Movimientos</h1>
            <p class="text-xs text-slate-500">Supervisión física de depósito, valorización de inventario, rotación y ajustes auditados.</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.stockModule.openAdjustModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
              <i data-lucide="sliders" class="w-4 h-4"></i>
              Ajuste Manual de Inventario
            </button>
          </div>
        </div>

        <!-- Tarjetas Resumen de Inventario -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Stock Valorizado (Costo)</div>
            <div class="text-lg font-bold text-slate-800 mt-1">${Formatter.money(stockValuedCost)}</div>
            <div class="text-[11px] text-slate-500">Inversión actual en depósito</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Stock a Precio de Venta</div>
            <div class="text-lg font-bold text-emerald-700 mt-1">${Formatter.money(stockValuedSale)}</div>
            <div class="text-[11px] text-emerald-600 font-medium">Ganancia est: ${Formatter.money(stockValuedSale - stockValuedCost)}</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Productos Stock Bajo</div>
            <div class="text-lg font-bold text-amber-600 mt-1">${lowStockCount} insumos</div>
            <div class="text-[11px] text-amber-700">Por debajo del mínimo</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Productos Sin Stock</div>
            <div class="text-lg font-bold text-rose-600 mt-1">${outOfStockCount} insumos</div>
            <div class="text-[11px] text-rose-700">Quiebre inmediato</div>
          </div>
        </div>

        <!-- Pestañas: Inventario Actual / Historial de Movimientos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="border-b border-slate-200 bg-slate-50 px-4 flex items-center gap-4 text-xs font-bold">
            <button id="tabStockCurrent" onclick="window.stockModule.switchTab('current')" class="py-3 border-b-2 border-emerald-600 text-emerald-700 font-bold">
              Inventario & Días de Stock
            </button>
            <button id="tabStockMovements" onclick="window.stockModule.switchTab('movements')" class="py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 font-medium">
              Historial de Movimientos Trazables (${movements.length})
            </button>
          </div>

          <!-- Vista 1: Inventario Actual & Cobertura -->
          <div id="sectionStockCurrent" class="p-4 space-y-4">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 font-semibold text-slate-600">
                  <tr>
                    <th class="py-2.5 px-3">SKU</th>
                    <th class="py-2.5 px-3">Producto</th>
                    <th class="py-2.5 px-3 text-center">Stock Actual</th>
                    <th class="py-2.5 px-3 text-center">Mínimo</th>
                    <th class="py-2.5 px-3 text-center">Máximo</th>
                    <th class="py-2.5 px-3 text-right">Costo Caviahue</th>
                    <th class="py-2.5 px-3 text-right">Valor Total ($)</th>
                    <th class="py-2.5 px-3 text-center">Días de Stock (Cobertura)</th>
                    <th class="py-2.5 px-3">Ubicación</th>
                    <th class="py-2.5 px-3 text-center">Ajustar</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${products.map(p => {
                    // Estimación venta diaria (ej. basado en stock y ventas mensuales)
                    const dailyAvg = Math.max(0.2, (p.current_stock > 0 ? p.current_stock / 25 : 0.5));
                    const daysCoverage = InventoryAnalytics.calcCoverageDays(p.current_stock, dailyAvg);
                    const isRisk = daysCoverage <= 7; // Alerta si menos de 7 días (flete tarda 4-7 días en Caviahue)

                    return `
                      <tr class="hover:bg-slate-50 transition">
                        <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${p.sku}</td>
                        <td class="py-2.5 px-3 font-medium text-slate-900">${p.name}</td>
                        <td class="py-2.5 px-3 text-center font-bold ${p.current_stock <= 0 ? 'text-rose-600' : p.current_stock <= p.min_stock ? 'text-amber-600' : 'text-emerald-700'}">
                          ${p.current_stock} ${p.sale_unit}
                        </td>
                        <td class="py-2.5 px-3 text-center text-slate-500">${p.min_stock}</td>
                        <td class="py-2.5 px-3 text-center text-slate-500">${p.max_stock}</td>
                        <td class="py-2.5 px-3 text-right text-slate-600">${Formatter.money(p.caviahue_cost)}</td>
                        <td class="py-2.5 px-3 text-right font-bold text-slate-800">${Formatter.money((p.current_stock || 0) * (p.caviahue_cost || 0))}</td>
                        <td class="py-2.5 px-3 text-center">
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${isRisk ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}">
                            ${daysCoverage > 180 ? '> 6 meses' : `${daysCoverage} días`}
                            ${isRisk ? '<i data-lucide="alert-triangle" class="w-3 h-3 ml-1 inline text-rose-600"></i>' : ''}
                          </span>
                        </td>
                        <td class="py-2.5 px-3 text-slate-500 text-[11px]">${p.warehouse_location || '-'}</td>
                        <td class="py-2.5 px-3 text-center">
                          <button onclick="window.stockModule.openAdjustModal('${p.id}')" class="p-1 text-amber-600 hover:bg-amber-50 rounded">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Vista 2: Historial de Movimientos -->
          <div id="sectionStockMovements" class="p-4 space-y-4 hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-100 font-semibold text-slate-600">
                  <tr>
                    <th class="py-2.5 px-3">Fecha</th>
                    <th class="py-2.5 px-3">Tipo Movimiento</th>
                    <th class="py-2.5 px-3">Producto</th>
                    <th class="py-2.5 px-3 text-center">Cantidad</th>
                    <th class="py-2.5 px-3 text-center">Stock Ant.</th>
                    <th class="py-2.5 px-3 text-center">Nuevo Stock</th>
                    <th class="py-2.5 px-3">Referencia</th>
                    <th class="py-2.5 px-3">Motivo / Notas</th>
                    <th class="py-2.5 px-3">Usuario</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${movements.map(m => {
                    let badgeClass = 'bg-slate-100 text-slate-800';
                    if (m.movement_type === 'COMPRA') badgeClass = 'bg-blue-100 text-blue-800';
                    if (m.movement_type === 'VENTA') badgeClass = 'bg-emerald-100 text-emerald-800';
                    if (m.movement_type === 'ANULACION') badgeClass = 'bg-purple-100 text-purple-800';
                    if (m.movement_type === 'MERMA' || m.movement_type === 'ROTURA') badgeClass = 'bg-rose-100 text-rose-800';
                    if (m.movement_type === 'AJUSTE') badgeClass = 'bg-amber-100 text-amber-800';

                    return `
                      <tr class="hover:bg-slate-50 transition">
                        <td class="py-2.5 px-3 text-slate-600">${Formatter.dateTime(m.created_at || m.date)}</td>
                        <td class="py-2.5 px-3">
                          <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">
                            ${m.movement_type}
                          </span>
                        </td>
                        <td class="py-2.5 px-3 font-medium text-slate-900">${m.product_name}</td>
                        <td class="py-2.5 px-3 text-center font-bold ${m.quantity_base >= 0 ? 'text-blue-700' : 'text-slate-800'}">
                          ${m.quantity_base >= 0 ? `+${m.quantity_base}` : m.quantity_base}
                        </td>
                        <td class="py-2.5 px-3 text-center text-slate-500">${m.previous_stock}</td>
                        <td class="py-2.5 px-3 text-center font-semibold text-slate-800">${m.new_stock}</td>
                        <td class="py-2.5 px-3 font-mono text-slate-600">${m.reference_id || '-'}</td>
                        <td class="py-2.5 px-3 text-slate-600 max-w-xs truncate">${m.notes || '-'}</td>
                        <td class="py-2.5 px-3 text-slate-500">${m.user_name || 'Admin'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal de Ajuste Manual de Stock -->
      <div id="adjustStockModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 class="text-base font-bold text-slate-800">Ajuste Manual de Stock Trazable</h3>
            <button onclick="document.getElementById('adjustStockModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="window.stockModule.submitAdjust(event)" class="space-y-4 text-xs">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Producto</label>
              <select id="adjustProductId" required onchange="window.stockModule.onAdjustProductChange(this.value)" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="">Seleccionar Producto...</option>
                ${products.map(p => `
                  <option value="${p.id}">${p.name} (Stock Actual: ${p.current_stock} ${p.sale_unit})</option>
                `).join('')}
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Stock Actual</label>
                <input type="text" id="adjustCurrentStock" disabled class="w-full border border-slate-200 bg-slate-100 rounded-lg p-2 font-bold text-slate-700 text-center">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Nuevo Stock Real *</label>
                <input type="number" id="adjustNewStock" required min="0" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-center">
              </div>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Motivo del Ajuste *</label>
              <select id="adjustReason" required class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="AJUSTE">Ajuste por Conteo Físico / Inventario</option>
                <option value="ROTURA">Rotura o Daño de Mercadería</option>
                <option value="MERMA">Merma o Vencimiento</option>
                <option value="DEVOLUCION">Devolución de Cliente / Mercadería recuperada</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Observaciones / Justificación *</label>
              <textarea id="adjustNotes" required rows="2" placeholder="Explicación detallada para la auditoría..." class="w-full border border-slate-300 rounded-lg p-2"></textarea>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onclick="document.getElementById('adjustStockModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg">Cancelar</button>
              <button type="submit" class="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold">Registrar Ajuste Trazable</button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.stockModule = {
  switchTab(tab) {
    const tabCur = document.getElementById('tabStockCurrent');
    const tabMov = document.getElementById('tabStockMovements');
    const secCur = document.getElementById('sectionStockCurrent');
    const secMov = document.getElementById('sectionStockMovements');

    if (tab === 'current') {
      tabCur.className = 'py-3 border-b-2 border-emerald-600 text-emerald-700 font-bold';
      tabMov.className = 'py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 font-medium';
      secCur.classList.remove('hidden');
      secMov.classList.add('hidden');
    } else {
      tabMov.className = 'py-3 border-b-2 border-emerald-600 text-emerald-700 font-bold';
      tabCur.className = 'py-3 border-b-2 border-transparent text-slate-500 hover:text-slate-800 font-medium';
      secMov.classList.remove('hidden');
      secCur.classList.add('hidden');
    }
  },

  openAdjustModal(productId = null) {
    const modal = document.getElementById('adjustStockModal');
    const select = document.getElementById('adjustProductId');
    if (!modal) return;

    if (productId && select) {
      select.value = productId;
      this.onAdjustProductChange(productId);
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  onAdjustProductChange(productId) {
    const prod = db.getProduct(productId);
    const currInput = document.getElementById('adjustCurrentStock');
    const newInput = document.getElementById('adjustNewStock');

    if (prod && currInput) {
      currInput.value = `${prod.current_stock} ${prod.sale_unit}`;
      if (newInput) newInput.value = prod.current_stock;
    }
  },

  async submitAdjust(e) {
    e.preventDefault();
    const prodId = document.getElementById('adjustProductId')?.value;
    const newStock = document.getElementById('adjustNewStock')?.value;
    const reason = document.getElementById('adjustReason')?.value;
    const notes = document.getElementById('adjustNotes')?.value;

    if (!prodId || newStock === '') {
      alert('Completá todos los campos.');
      return;
    }

    try {
      if (window.app?.centralReadOnly) {
        const product=db.getProduct(prodId);
        if (!product) throw new Error('Producto inexistente');
        const expected=Number(product.current_stock), target=Number(newStock);
        if (!Number.isInteger(target) || target<0) throw new Error('Cantidad inválida');
        if (target===expected) throw new Error('El stock no cambió');
        if (!confirm(`Registrar conteo central de ${product.name}: ${expected} → ${target} unidades?`)) return;
        await setCentralStock(prodId,expected,target,`${reason}: ${notes}`);
        const [products,movements]=await Promise.all([
          readCentral('products',{order:'id.asc',limit:10000}),
          readCentral('inventory_movements',{order:'id.asc',limit:10000})
        ]);
        db.centralSetTable('products',products);
        db.centralSetTable('inventory_movements',movements);
      } else {
        db.adjustStock(prodId, Number(newStock), reason, notes);
      }
      document.getElementById('adjustStockModal').classList.add('hidden');
      window.app.showNotification(`Ajuste de inventario registrado con trazabilidad.`, 'success');
      window.app.navigate('stock');
    } catch (err) {
      alert(`Error al ajustar stock: ${err.message}`);
    }
  }
};
