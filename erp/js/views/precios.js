// Módulo de Precios & Rentabilidad para Limpieza Caviahue
// Diferencia clara entre Margen y Markup, simulador de margen objetivo y redondeo argentino inteligente.

import { db } from '../db.js';
import { Formatter, PricingCalculator } from '../models.js';

export const PreciosView = {
  render(container) {
    const products = db.getProducts();
    const categories = db.getCategories();
    const priceLists = db.getPriceLists();

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Estrategia de Precios & Rentabilidad</h1>
            <p class="text-xs text-slate-500">Gestión de márgenes objetivos, control estricto de Markup vs Margen y redondeo inteligente.</p>
          </div>
        </div>

        <!-- Banner Explicativo: Margen vs Markup -->
        <div class="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-xl shadow-md grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="border-r border-slate-700/60 pr-4">
            <div class="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <i data-lucide="check-circle" class="w-4 h-4"></i>
              MARGEN BRUTO (%)
            </div>
            <p class="text-xs text-slate-300 mt-1">
              Porcentaje del precio final que representa ganancia.<br>
              <code class="text-emerald-300 font-mono text-[11px] bg-slate-800/80 px-2 py-0.5 rounded inline-block mt-1">Margen % = ((Precio - Costo) / Precio) × 100</code>
            </p>
          </div>
          <div>
            <div class="flex items-center gap-2 text-blue-400 font-bold text-sm">
              <i data-lucide="percent" class="w-4 h-4"></i>
              MARKUP O RECARGO (%)
            </div>
            <p class="text-xs text-slate-300 mt-1">
              Porcentaje que se le suma al costo para formar el precio.<br>
              <code class="text-blue-300 font-mono text-[11px] bg-slate-800/80 px-2 py-0.5 rounded inline-block mt-1">Markup % = ((Precio - Costo) / Costo) × 100</code>
            </p>
          </div>
        </div>

        <!-- Simulador Masivo por Categoría -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Simulador y Ajuste de Margen Objetivo</h2>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Filtrar Categoría</label>
              <select id="simCategorySelect" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="TODAS">Todas las Categorías</option>
                ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Margen Objetivo Sugerido (%)</label>
              <input type="number" id="simTargetMargin" min="10" max="90" value="40" class="w-full border border-slate-300 rounded-lg p-2 text-right font-bold">
            </div>
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Fórmula Aplicada</label>
              <div class="p-2 bg-slate-50 border rounded-lg text-slate-500 font-mono text-[11px]">
                Costo / (1 - Margen%)
              </div>
            </div>
            <div class="flex items-end">
              <button onclick="window.preciosModule.applyCategorySimulation()" class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-sm">
                Recalcular Precios Sugeridos
              </button>
            </div>
          </div>
        </div>

        <!-- Tabla Comparativa de Precios y Márgenes -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Precios de Venta vs Costo Puesto Caviahue</h3>
            <span class="text-xs text-slate-500">${products.length} productos</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-3">SKU</th>
                  <th class="py-3 px-3">Producto</th>
                  <th class="py-3 px-3 text-right">Costo Caviahue</th>
                  <th class="py-3 px-3 text-right">Precio Actual</th>
                  <th class="py-3 px-3 text-right text-indigo-700">Precio Sugerido</th>
                  <th class="py-3 px-3 text-right">Ganancia ($)</th>
                  <th class="py-3 px-3 text-right">Margen Real %</th>
                  <th class="py-3 px-3 text-right">Markup %</th>
                  <th class="py-3 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100" id="preciosTableBody">
                ${products.map(p => {
                  const targetMargin = p.target_margin || 40;
                  const suggested = PricingCalculator.calcSuggestedPrice(p.caviahue_cost, targetMargin);
                  const isBelowTarget = p.margin_pct < targetMargin;

                  return `
                    <tr class="hover:bg-slate-50 transition" data-cat="${p.category_id}">
                      <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${p.sku}</td>
                      <td class="py-2.5 px-3">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        <div class="text-[10px] text-slate-400">Objetivo: ${targetMargin}%</div>
                      </td>
                      <td class="py-2.5 px-3 text-right text-slate-600 font-medium">${Formatter.money(p.caviahue_cost)}</td>
                      <td class="py-2.5 px-3 text-right font-bold text-slate-900">${Formatter.money(p.sale_price)}</td>
                      <td class="py-2.5 px-3 text-right font-bold text-indigo-700 bg-indigo-50/30">
                        ${Formatter.money(suggested)}
                      </td>
                      <td class="py-2.5 px-3 text-right font-semibold text-emerald-600">${Formatter.money(p.margin_amount)}</td>
                      <td class="py-2.5 px-3 text-right font-bold ${isBelowTarget ? 'text-rose-600' : 'text-emerald-700'}">
                        ${Formatter.percent(p.margin_pct)}
                        ${isBelowTarget ? '<i data-lucide="alert-circle" class="w-3.5 h-3.5 inline text-rose-500 ml-1"></i>' : ''}
                      </td>
                      <td class="py-2.5 px-3 text-right text-slate-500">${Formatter.percent(p.markup_pct)}</td>
                      <td class="py-2.5 px-3 text-center">
                        <button onclick="window.preciosModule.applySuggestedPrice('${p.id}', ${suggested})" title="Adoptar Precio Sugerido Redondeado" class="px-2 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded text-[11px] font-bold text-slate-700">
                          Aplicar ${Formatter.money(suggested)}
                        </button>
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

window.preciosModule = {
  applySuggestedPrice(productId, newPrice) {
    const prod = db.getProduct(productId);
    if (!prod) return;

    prod.sale_price = newPrice;
    db.saveProduct(prod);
    window.app.showNotification(`Precio de ${prod.name} actualizado a ${Formatter.money(newPrice)}.`, 'success');
    window.app.navigate('precios');
  },

  applyCategorySimulation() {
    const catId = document.getElementById('simCategorySelect')?.value;
    const target = Number(document.getElementById('simTargetMargin')?.value) || 40;

    const products = db.getProducts();
    let count = 0;

    products.forEach(p => {
      if (catId === 'TODAS' || p.category_id === catId) {
        p.target_margin = target;
        p.sale_price = PricingCalculator.calcSuggestedPrice(p.caviahue_cost, target);
        db.saveProduct(p);
        count++;
      }
    });

    window.app.showNotification(`Precios sugeridos aplicados a ${count} productos con margen del ${target}%.`, 'success');
    window.app.navigate('precios');
  }
};
