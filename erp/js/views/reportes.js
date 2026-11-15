// Módulo de Reportes Avanzados, Filtros Multivariables & Top Artículos Vendidos
// Limpieza Caviahue ERP
import { db } from '../db.js';
import { Formatter } from '../models.js';

let filterState = {
  productId: 'ALL',
  supplierId: 'ALL',
  customerId: 'ALL',
  dateFrom: '',
  dateTo: ''
};

export const ReportesView = {
  render(container) {
    const products = db.getProducts();
    const suppliers = db.getSuppliers();
    const customers = db.getCustomers();
    const allSales = db.getSales().filter(s => s.status === 'COMPLETADA');

    // Filtrar ventas por las variables seleccionadas
    const filteredSales = allSales.filter(s => {
      // Filtro fecha
      if (filterState.dateFrom && s.date < filterState.dateFrom) return false;
      if (filterState.dateTo && s.date > filterState.dateTo) return false;

      // Filtro cliente
      if (filterState.customerId !== 'ALL' && s.customer_id !== filterState.customerId) return false;

      // Filtro producto (si la venta contiene el producto seleccionado)
      if (filterState.productId !== 'ALL') {
        const hasProd = (s.items || []).some(it => it.product_id === filterState.productId);
        if (!hasProd) return false;
      }

      // Filtro proveedor (si alguno de los productos de la venta pertenece a ese proveedor)
      if (filterState.supplierId !== 'ALL') {
        const hasSupplierProd = (s.items || []).some(it => {
          const prod = products.find(p => p.id === it.product_id);
          return prod && prod.supplier_id === filterState.supplierId;
        });
        if (!hasSupplierProd) return false;
      }

      return true;
    });

    // Calcular "Top Artículos Vendidos" sobre las ventas filtradas
    const productSalesMap = {};
    filteredSales.forEach(s => {
      (s.items || []).forEach(it => {
        if (filterState.productId !== 'ALL' && it.product_id !== filterState.productId) return;
        
        const prod = products.find(p => p.id === it.product_id);
        if (filterState.supplierId !== 'ALL' && prod && prod.supplier_id !== filterState.supplierId) return;

        if (!productSalesMap[it.product_id]) {
          productSalesMap[it.product_id] = {
            id: it.product_id,
            name: it.product_name,
            sku: prod?.sku || 'S/N',
            category: prod?.category_name || 'General',
            unitsSold: 0,
            revenueTotal: 0,
            costTotal: 0
          };
        }
        const qty = it.quantity || 1;
        const subtotal = it.subtotal || (qty * (it.unit_price || 0));
        const cost = qty * (it.unit_cost || prod?.caviahue_cost || 0);

        productSalesMap[it.product_id].unitsSold += qty;
        productSalesMap[it.product_id].revenueTotal += subtotal;
        productSalesMap[it.product_id].costTotal += cost;
      });
    });

    const topProducts = Object.values(productSalesMap).map(p => {
      const profit = p.revenueTotal - p.costTotal;
      const marginPct = p.revenueTotal > 0 ? (profit / p.revenueTotal) * 100 : 0;
      return {
        ...p,
        profit,
        marginPct
      };
    }).sort((a, b) => b.unitsSold - a.unitsSold);

    // Métricas del filtro actual
    const totalRevenueFiltered = filteredSales.reduce((s, it) => s + (it.total || 0), 0);
    const totalCostFiltered = filteredSales.reduce((s, it) => s + (it.total_cost || 0), 0);
    const totalProfitFiltered = totalRevenueFiltered - totalCostFiltered;
    const avgMarginFiltered = totalRevenueFiltered > 0 ? (totalProfitFiltered / totalRevenueFiltered) * 100 : 0;

    // Métricas globales de capital
    const stockValuedCost = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.caviahue_cost || 0)), 0);
    const stockValuedSale = products.reduce((sum, p) => sum + ((p.current_stock || 0) * (p.sale_price || 0)), 0);
    const potentialGain = stockValuedSale - stockValuedCost;

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-7xl mx-auto">
        <!-- Encabezado -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                <i data-lucide="bar-chart-3" class="w-3.5 h-3.5 mr-1 inline"></i> Inteligencia Comercial
              </span>
            </div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-1">Reportes & Análisis Multivariable</h1>
            <p class="text-xs text-slate-500">Filtrá ventas, rentabilidad y ranking de artículos según productos, proveedores, clientes y fechas.</p>
          </div>
          <div class="flex gap-2">
            <button onclick="window.reportesModule.resetFilters()" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition">
              Limpiar Filtros
            </button>
            <button onclick="window.reportesModule.exportFullReport()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5">
              <i data-lucide="download" class="w-4 h-4"></i> Exportar CSV
            </button>
          </div>
        </div>

        <!-- Panel de Filtros Multivariables -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <i data-lucide="filter" class="w-4 h-4 text-indigo-600"></i> Filtrar Métricas por Variables
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <!-- Filtro Producto -->
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Producto Específico</label>
              <select id="filter-prod" onchange="window.reportesModule.setFilter('productId', this.value)" class="w-full p-2 border border-slate-300 rounded-lg bg-white">
                <option value="ALL">Todos los Productos</option>
                ${products.map(p => `
                  <option value="${p.id}" ${filterState.productId === p.id ? 'selected' : ''}>${p.name}</option>
                `).join('')}
              </select>
            </div>

            <!-- Filtro Proveedor -->
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Proveedor</label>
              <select id="filter-supp" onchange="window.reportesModule.setFilter('supplierId', this.value)" class="w-full p-2 border border-slate-300 rounded-lg bg-white">
                <option value="ALL">Todos los Proveedores</option>
                ${suppliers.map(sp => `
                  <option value="${sp.id}" ${filterState.supplierId === sp.id ? 'selected' : ''}>${sp.name}</option>
                `).join('')}
              </select>
            </div>

            <!-- Filtro Cliente -->
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Cliente / Cuenta</label>
              <select id="filter-cust" onchange="window.reportesModule.setFilter('customerId', this.value)" class="w-full p-2 border border-slate-300 rounded-lg bg-white">
                <option value="ALL">Todos los Clientes</option>
                ${customers.map(c => `
                  <option value="${c.id}" ${filterState.customerId === c.id ? 'selected' : ''}>${c.name} (${c.type})</option>
                `).join('')}
              </select>
            </div>

            <!-- Filtro Fecha Desde -->
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Desde</label>
              <input type="date" id="filter-date-from" value="${filterState.dateFrom}" onchange="window.reportesModule.setFilter('dateFrom', this.value)" class="w-full p-2 border border-slate-300 rounded-lg">
            </div>

            <!-- Filtro Fecha Hasta -->
            <div>
              <label class="block font-semibold text-slate-600 mb-1">Hasta</label>
              <input type="date" id="filter-date-to" value="${filterState.dateTo}" onchange="window.reportesModule.setFilter('dateTo', this.value)" class="w-full p-2 border border-slate-300 rounded-lg">
            </div>
          </div>
        </div>

        <!-- Tarjetas de Resultados Filtrados -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Facturación Filtrada</span>
            <div class="text-2xl font-bold text-slate-900 mt-1">${Formatter.money(totalRevenueFiltered)}</div>
            <span class="text-[11px] text-slate-400 font-mono">${filteredSales.length} ventas computadas</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Costo de Mercadería (CMV)</span>
            <div class="text-2xl font-bold text-slate-700 mt-1">${Formatter.money(totalCostFiltered)}</div>
            <span class="text-[11px] text-slate-400">A costo puesto Caviahue</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Margen Bruto Obtenido</span>
            <div class="text-2xl font-bold text-emerald-700 mt-1">${Formatter.money(totalProfitFiltered)}</div>
            <span class="text-[11px] text-emerald-600 font-semibold">${Formatter.percent(avgMarginFiltered)} margen s/ venta</span>
          </div>

          <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-200 shadow-sm">
            <span class="text-xs font-semibold text-indigo-900 block">Stock Inmovilizado Global</span>
            <div class="text-2xl font-bold text-indigo-700 mt-1">${Formatter.money(stockValuedCost)}</div>
            <span class="text-[11px] text-indigo-600 font-medium">Ganancia potencial: ${Formatter.money(potentialGain)}</span>
          </div>
        </div>

        <!-- SECCIÓN: TOP ARTÍCULOS MÁS VENDIDOS -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-slate-50/70">
            <div>
              <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                <i data-lucide="flame" class="w-4 h-4 text-amber-500"></i> TOP ARTÍCULOS MÁS VENDIDOS
              </h3>
              <p class="text-xs text-slate-500">Ranking ordenado por volumen de unidades y facturación generada según los filtros aplicados.</p>
            </div>
            <span class="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
              ${topProducts.length} artículos en ranking
            </span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-700 uppercase font-semibold text-[11px]">
                <tr>
                  <th class="py-3 px-3 text-center"># Posición</th>
                  <th class="py-3 px-3">Código</th>
                  <th class="py-3 px-3">Artículo / Producto</th>
                  <th class="py-3 px-3">Categoría</th>
                  <th class="py-3 px-3 text-center font-bold text-slate-900">Unidades Vendidas</th>
                  <th class="py-3 px-3 text-right">Facturación Total</th>
                  <th class="py-3 px-3 text-right font-bold text-emerald-700">Ganancia Bruta</th>
                  <th class="py-3 px-3 text-center">Margen %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${topProducts.length === 0 ? `
                  <tr><td colspan="8" class="text-center p-8 text-slate-400">No hay ventas registradas que coincidan con los filtros seleccionados.</td></tr>
                ` : topProducts.map((p, idx) => {
                  let medalColor = 'bg-slate-100 text-slate-700';
                  if (idx === 0) medalColor = 'bg-amber-100 text-amber-800 border border-amber-300 font-extrabold';
                  if (idx === 1) medalColor = 'bg-slate-200 text-slate-800 border border-slate-300 font-extrabold';
                  if (idx === 2) medalColor = 'bg-amber-600/20 text-amber-900 border border-amber-600/30 font-extrabold';

                  return `
                    <tr class="hover:bg-slate-50 transition ${idx < 3 ? 'bg-amber-50/20 font-medium' : ''}">
                      <td class="py-3 px-3 text-center">
                        <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${medalColor}">
                          ${idx + 1}
                        </span>
                      </td>
                      <td class="py-3 px-3 font-mono text-slate-500">${p.sku}</td>
                      <td class="py-3 px-3">
                        <span class="font-bold text-slate-900 block">${p.name}</span>
                      </td>
                      <td class="py-3 px-3 text-slate-500">${p.category}</td>
                      <td class="py-3 px-3 text-center font-extrabold text-indigo-700 text-sm">
                        ${p.unitsSold}
                      </td>
                      <td class="py-3 px-3 text-right font-bold text-slate-900">${Formatter.money(p.revenueTotal)}</td>
                      <td class="py-3 px-3 text-right font-bold text-emerald-700">${Formatter.money(p.profit)}</td>
                      <td class="py-3 px-3 text-center">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold ${p.marginPct >= 35 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                          ${Formatter.percent(p.marginPct)}
                        </span>
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
    this.initHandlers();
  },

  initHandlers() {
    window.reportesModule = {
      setFilter: (key, value) => {
        filterState[key] = value;
        ReportesView.render(document.getElementById('app-content'));
      },

      resetFilters: () => {
        filterState = {
          productId: 'ALL',
          supplierId: 'ALL',
          customerId: 'ALL',
          dateFrom: '',
          dateTo: ''
        };
        ReportesView.render(document.getElementById('app-content'));
      },

      exportFullReport: () => {
        const products = db.getProducts();
        let content = "REPORTE COMERCIAL Y ARTICULOS VENDIDOS - LIMPIEZA CAVIAHUE\n\n";
        content += `Fecha de Generacion: ${new Date().toLocaleDateString('es-AR')}\n\n`;
        content += "SKU;Producto;StockActual;CostoCaviahue;PrecioVenta;MargenPct\n";

        products.forEach(p => {
          content += `${p.sku};"${p.name}";${p.current_stock};${p.caviahue_cost};${p.sale_price};${p.margin_pct}\n`;
        });

        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte_articulos_caviahue_${new Date().toISOString().substring(0, 10)}.csv`;
        link.click();
      }
    };
  }
};
