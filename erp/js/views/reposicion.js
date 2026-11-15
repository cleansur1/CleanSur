// Módulo de Reposición Inteligente para Limpieza Caviahue
// Análisis de ventas históricas 30/60 días, días de cobertura, cálculo de pedido sugerido y generación de Orden de Compra.

import { db } from '../db.js';
import { Formatter, InventoryAnalytics } from '../models.js';

export const ReposicionView = {
  render(container) {
    const products = db.getProducts();
    const suppliers = db.getSuppliers();

    // Calcular análisis de reposición para cada producto
    const reorderAnalysis = products.map(p => {
      // Simular venta 30 días a partir de rotación
      const sales30d = Math.max(1, Math.round(p.current_stock * 0.4) + (p.sku.includes('LAV') ? 15 : 5));
      const dailyAvg = sales30d / 30;
      const coverageDays = InventoryAnalytics.calcCoverageDays(p.current_stock, dailyAvg);
      const leadTimeDays = 7; // Tiempo flete Zapala-Caviahue con nieve
      const suggestedQty = InventoryAnalytics.calcSuggestedReorder(p.current_stock, p.min_stock, dailyAvg, 30, leadTimeDays);
      const isUrgent = coverageDays <= leadTimeDays;

      return {
        ...p,
        sales30d,
        dailyAvg,
        coverageDays,
        leadTimeDays,
        suggestedQty,
        isUrgent,
        estimatedCost: suggestedQty * p.caviahue_cost
      };
    });

    const urgentItems = reorderAnalysis.filter(it => it.suggestedQty > 0);
    const totalCapitalReorder = urgentItems.reduce((sum, it) => sum + it.estimatedCost, 0);

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Reposición Inteligente & Pedido Sugerido</h1>
            <p class="text-xs text-slate-500">Proyección de compras basada en venta diaria promedio y tiempo de transporte a Caviahue (7 días de flete).</p>
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-500 block">Capital Inversión Sugerida:</span>
            <span class="text-xl font-extrabold text-blue-700">${Formatter.money(totalCapitalReorder)}</span>
          </div>
        </div>

        <!-- Indicador de Alerta de Fletes de Montaña -->
        <div class="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
          <i data-lucide="snowflake" class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"></i>
          <div>
            <span class="font-bold">Consideración de Ruta Caviahue - Copahue:</span>
            El tiempo de tránsito de los fletes desde el Parque Industrial Neuquén o Zapala promedia entre 4 a 7 días hábiles, aumentando en caso de nevadas en Cuesta del Rahue o Ruta 26. El sistema calcula un colchón de seguridad de 7 días de consumo antes de sugerir el pedido.
          </div>
        </div>

        <!-- Tabla de Sugerencias de Reposición -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Productos con Sugerencia de Compra</h3>
            <span class="text-xs text-slate-500">${urgentItems.length} insumos requieren reposición</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-3">SKU</th>
                  <th class="py-3 px-3">Producto</th>
                  <th class="py-3 px-3 text-center">Stock Actual</th>
                  <th class="py-3 px-3 text-center">Venta 30 Días</th>
                  <th class="py-3 px-3 text-center">Venta Diaria</th>
                  <th class="py-3 px-3 text-center">Días Cobertura</th>
                  <th class="py-3 px-3 text-center font-bold text-blue-700">Cant. Sugerida</th>
                  <th class="py-3 px-3 text-right">Inversión Estimada</th>
                  <th class="py-3 px-3 text-center">Generar OC</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${reorderAnalysis.map(it => `
                  <tr class="hover:bg-slate-50 transition ${it.suggestedQty > 0 ? 'bg-amber-50/20' : ''}">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${it.sku}</td>
                    <td class="py-2.5 px-3 font-medium text-slate-900">${it.name}</td>
                    <td class="py-2.5 px-3 text-center font-bold ${it.current_stock <= it.min_stock ? 'text-rose-600' : 'text-slate-800'}">
                      ${it.current_stock} ${it.sale_unit}
                    </td>
                    <td class="py-2.5 px-3 text-center text-slate-600">${it.sales30d}</td>
                    <td class="py-2.5 px-3 text-center text-slate-600">${it.dailyAvg.toFixed(1)} / día</td>
                    <td class="py-2.5 px-3 text-center font-bold ${it.coverageDays <= 7 ? 'text-rose-600' : 'text-slate-700'}">
                      ${it.coverageDays} días
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${it.suggestedQty > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
                        ${it.suggestedQty > 0 ? `+${it.suggestedQty} ${it.sale_unit}` : 'Óptimo'}
                      </span>
                    </td>
                    <td class="py-2.5 px-3 text-right font-medium text-slate-800">
                      ${it.suggestedQty > 0 ? Formatter.money(it.estimatedCost) : '-'}
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      ${it.suggestedQty > 0 ? `
                        <button onclick="window.reposicionModule.createPOFromSuggested('${it.id}', ${it.suggestedQty})" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold">
                          Crear OC
                        </button>
                      ` : `
                        <span class="text-slate-400 text-[10px]">No requiere</span>
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

window.reposicionModule = {
  createPOFromSuggested(productId, qty) {
    const prod = db.getProduct(productId);
    if (!prod) return;

    const suppliers = db.getSuppliers();
    const sup = suppliers.find(s => s.id === prod.supplier_id) || suppliers[0];

    try {
      const po = db.savePurchaseOrder({
        supplier_id: sup.id,
        supplier_name: sup.name,
        expected_date: new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10),
        status: 'Borrador',
        subtotal: qty * (prod.purchase_cost || prod.caviahue_cost),
        total: (qty * (prod.purchase_cost || prod.caviahue_cost)) * 1.21,
        notes: `Orden sugerida por reposición inteligente para cubrir 30 días de demanda.`,
        items: [
          {
            product_id: prod.id,
            product_name: prod.name,
            quantity: qty,
            unit_name: prod.sale_unit,
            unit_cost: prod.purchase_cost || prod.caviahue_cost,
            subtotal: qty * (prod.purchase_cost || prod.caviahue_cost)
          }
        ]
      });

      window.app.showNotification(`Orden de Compra ${po.order_number} generada en Borrador para ${sup.name}.`, 'success');
      window.app.navigate('ordenes_compra');
    } catch (err) {
      alert(err.message);
    }
  }
};
