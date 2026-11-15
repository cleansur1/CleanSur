// Módulo de Dashboard para Limpieza Caviahue
// KPIs, gráficos interactivos Chart.js, alertas en tiempo real y selector de períodos.

import { db } from '../db.js';
import { Formatter } from '../models.js';

let chartVentasDia = null;
let chartCategorias = null;
let chartClientes = null;
let chartRentabilidad = null;

export const DashboardView = {
  render(container) {
    const metrics = db.getDashboardMetrics() || {};
    const products = db.getProducts() || [];
    const sales = (db.getSales() || []).filter(s => s.status === 'COMPLETADA');
    const customers = db.getCustomers() || [];

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <!-- Encabezado con Selector de Período y Botones Rápidos -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-[#8FD0F4]/40 shadow-xs">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E9F4FB] text-[#0E3A6B] border border-[#8FD0F4]">
                <i data-lucide="mountain-snow" class="w-3.5 h-3.5 mr-1 inline text-[#4EA1DD]"></i> StayClean • Caviahue, Neuquén
              </span>
              <span class="text-xs text-slate-500 font-medium">Temporada Invierno Activa</span>
            </div>
            <h1 class="text-2xl font-black text-[#0E3A6B] tracking-tight mt-1">Panel de Control & Indicadores</h1>
            <p class="text-xs text-slate-500">Distribuidora StayClean — Insumos de limpieza, químicos, papel y descartables gastronómicos.</p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div class="inline-flex rounded-lg border border-slate-300 p-1 bg-slate-50 text-xs font-semibold">
              <button class="px-3 py-1.5 rounded-md bg-[#0E3A6B] text-white shadow-xs">Mes Actual</button>
              <button class="px-3 py-1.5 text-slate-600 hover:text-slate-900">Esta Semana</button>
              <button class="px-3 py-1.5 text-slate-600 hover:text-slate-900">Hoy</button>
              <button class="px-3 py-1.5 text-slate-600 hover:text-slate-900">Año</button>
            </div>
            
            <button onclick="window.app.navigate('ventas', { action: 'new' })" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0E3A6B] hover:bg-[#4EA1DD] text-white rounded-lg text-xs font-bold shadow-sm transition">
              <i data-lucide="shopping-cart" class="w-4 h-4 text-[#8FD0F4]"></i>
              + Nueva Venta
            </button>
            <button onclick="window.app.navigate('compras', { action: 'new' })" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#4EA1DD] hover:bg-[#0E3A6B] text-white rounded-lg text-xs font-bold shadow-sm transition">
              <i data-lucide="truck" class="w-4 h-4"></i>
              + Nueva Compra
            </button>
          </div>
        </div>

        <!-- Tarjetas KPI Principales (Fila 1) -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <!-- Ventas Mes -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium uppercase tracking-wider">Ventas del Mes</span>
              <div class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <i data-lucide="trending-up" class="w-4 h-4"></i>
              </div>
            </div>
            <div class="text-xl font-bold text-slate-800">${Formatter.money(metrics.totalSales)}</div>
            <div class="text-[11px] text-emerald-600 font-medium mt-1">
              ${metrics.orderCount} ventas registradas
            </div>
          </div>

          <!-- CMV (Costo Mercadería) -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium uppercase tracking-wider">Costo Mercadería (CMV)</span>
              <div class="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <i data-lucide="boxes" class="w-4 h-4"></i>
              </div>
            </div>
            <div class="text-xl font-bold text-slate-800">${Formatter.money(metrics.totalCMV)}</div>
            <div class="text-[11px] text-slate-500 mt-1">Costo puesto Caviahue</div>
          </div>

          <!-- Margen Bruto -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium uppercase tracking-wider">Margen Bruto</span>
              <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <i data-lucide="pie-chart" class="w-4 h-4"></i>
              </div>
            </div>
            <div class="text-xl font-bold text-indigo-700">${Formatter.money(metrics.grossMargin)}</div>
            <div class="text-[11px] font-semibold text-indigo-600 mt-1">
              Margen ${Formatter.percent(metrics.grossMarginPct)}
            </div>
          </div>

          <!-- Gastos Operativos -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium uppercase tracking-wider">Gastos Operativos</span>
              <div class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <i data-lucide="receipt" class="w-4 h-4"></i>
              </div>
            </div>
            <div class="text-xl font-bold text-rose-600">${Formatter.money(metrics.totalExpenses)}</div>
            <div class="text-[11px] text-slate-500 mt-1">Alquiler, sueldos, gas, fletes</div>
          </div>

          <!-- Resultado Estimado -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium uppercase tracking-wider">Resultado Neto Est.</span>
              <div class="w-8 h-8 rounded-lg ${metrics.estimatedResult >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} flex items-center justify-center">
                <i data-lucide="badge-dollar-sign" class="w-4 h-4"></i>
              </div>
            </div>
            <div class="text-xl font-bold ${metrics.estimatedResult >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
              ${Formatter.money(metrics.estimatedResult)}
            </div>
            <div class="text-[11px] text-slate-500 mt-1">Margen Bruto - Gastos</div>
          </div>

          <!-- Stock Valorizado -->
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium uppercase tracking-wider">Stock Valorizado (Costo)</span>
              <div class="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
                <i data-lucide="warehouse" class="w-4 h-4"></i>
              </div>
            </div>
            <div class="text-xl font-bold text-slate-800">${Formatter.money(metrics.stockValuedCost)}</div>
            <div class="text-[11px] text-cyan-700 font-medium mt-1">
              A venta: ${Formatter.money(metrics.stockValuedSale)}
            </div>
          </div>
        </div>

        <!-- Tarjetas KPI Secundarias (Fila 2) -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <!-- Compras del Mes -->
          <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <i data-lucide="package-check" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="text-xs text-slate-500 font-medium">Compras del Mes</div>
              <div class="text-base font-bold text-slate-800">${Formatter.money(metrics.totalPurchases)}</div>
            </div>
          </div>

          <!-- Cuentas por Cobrar -->
          <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <i data-lucide="users" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="text-xs text-slate-500 font-medium">Cuentas por Cobrar</div>
              <div class="text-base font-bold text-amber-700">${Formatter.money(metrics.accountsReceivable)}</div>
            </div>
          </div>

          <!-- Ticket Promedio -->
          <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <i data-lucide="receipt-text" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="text-xs text-slate-500 font-medium">Ticket Promedio</div>
              <div class="text-base font-bold text-slate-800">${Formatter.money(metrics.avgTicket)}</div>
            </div>
          </div>

          <!-- Ganancia Potencial Inventario -->
          <div class="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
              <i data-lucide="sparkles" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="text-xs text-slate-500 font-medium">Ganancia Potencial Stock</div>
              <div class="text-base font-bold text-teal-700">${Formatter.money(metrics.potentialGain)}</div>
            </div>
          </div>
        </div>

        <!-- Panel de Alertas en Tiempo Real -->
        <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <i data-lucide="bell-ring" class="w-5 h-5 text-amber-600"></i>
              <h2 class="text-base font-bold text-slate-800">Panel de Alertas y Atención Inmediata</h2>
            </div>
            <span class="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 font-semibold rounded-full border border-amber-200">
              ${metrics.lowStockProducts.length + metrics.outOfStockProducts.length + metrics.lowMarginProducts.length + metrics.overdueReceivables.length} Alertas activas
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <!-- Stock Bajo -->
            <div class="p-3.5 rounded-lg border border-amber-200 bg-amber-50/50">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-amber-900">Stock Bajo / Crítico</span>
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">${metrics.lowStockProducts.length}</span>
              </div>
              <p class="text-xs text-slate-600 mt-1">Productos cerca o por debajo del mínimo de seguridad.</p>
              <div class="mt-2.5 space-y-1 max-h-24 overflow-y-auto text-[11px]">
                ${metrics.lowStockProducts.map(p => `
                  <div class="flex items-center justify-between text-slate-700 hover:text-slate-900">
                    <span class="truncate max-w-[150px] font-medium">${p.name}</span>
                    <span class="text-rose-600 font-bold">${p.current_stock} ${p.sale_unit}</span>
                  </div>
                `).join('') || '<span class="text-slate-400 italic">Sin alertas de stock bajo</span>'}
              </div>
            </div>

            <!-- Sin Stock -->
            <div class="p-3.5 rounded-lg border border-rose-200 bg-rose-50/50">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-rose-900">Quiebre / Sin Stock</span>
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-900">${metrics.outOfStockProducts.length}</span>
              </div>
              <p class="text-xs text-slate-600 mt-1">Productos agotados que requieren reposición urgente.</p>
              <div class="mt-2.5 space-y-1 max-h-24 overflow-y-auto text-[11px]">
                ${metrics.outOfStockProducts.length > 0 ? metrics.outOfStockProducts.map(p => `
                  <div class="text-rose-700 font-medium truncate">${p.name}</div>
                `).join('') : '<span class="text-emerald-600 font-medium">✓ Todos los productos tienen stock</span>'}
              </div>
            </div>

            <!-- Cuentas Corrientes con Saldo -->
            <div class="p-3.5 rounded-lg border border-indigo-200 bg-indigo-50/50">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-indigo-900">Cuentas por Cobrar</span>
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-indigo-200 text-indigo-900">${metrics.overdueReceivables.length}</span>
              </div>
              <p class="text-xs text-slate-600 mt-1">Clientes comerciales con saldos pendientes.</p>
              <div class="mt-2.5 space-y-1 max-h-24 overflow-y-auto text-[11px]">
                ${metrics.overdueReceivables.map(c => `
                  <div class="flex items-center justify-between text-slate-700">
                    <span class="truncate max-w-[140px]">${c.name}</span>
                    <span class="font-bold text-indigo-700">${Formatter.money(c.current_balance)}</span>
                  </div>
                `).join('') || '<span class="text-slate-400 italic">No hay cuentas pendientes</span>'}
              </div>
            </div>

            <!-- Margen Bajo -->
            <div class="p-3.5 rounded-lg border border-blue-200 bg-blue-50/50">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-blue-900">Margen Menor al Objetivo</span>
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-blue-200 text-blue-900">${metrics.lowMarginProducts.length}</span>
              </div>
              <p class="text-xs text-slate-600 mt-1">Productos con rentabilidad menor al objetivo sugerido.</p>
              <div class="mt-2.5 space-y-1 max-h-24 overflow-y-auto text-[11px]">
                ${metrics.lowMarginProducts.map(p => `
                  <div class="flex items-center justify-between text-slate-700">
                    <span class="truncate max-w-[140px]">${p.name}</span>
                    <span class="text-amber-600 font-bold">${Formatter.percent(p.margin_pct)}</span>
                  </div>
                `).join('') || '<span class="text-slate-400 italic">Márgenes óptimos</span>'}
              </div>
            </div>
          </div>
        </div>

        <!-- Gráficos Principales -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Gráfico 1: Ventas y CMV por Día -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-sm font-bold text-slate-800">Evolución de Ventas vs Costo (CMV)</h3>
                <p class="text-xs text-slate-500">Comportamiento diario de ingresos y costo de mercadería vendida</p>
              </div>
              <span class="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">Septiembre 2026</span>
            </div>
            <div class="h-64">
              <canvas id="chartVentasDia"></canvas>
            </div>
          </div>

          <!-- Gráfico 2: Ventas por Categoría -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-sm font-bold text-slate-800">Distribución de Ventas por Categoría</h3>
                <p class="text-xs text-slate-500">Participación en la facturación total del negocio</p>
              </div>
            </div>
            <div class="h-64">
              <canvas id="chartCategorias"></canvas>
            </div>
          </div>

          <!-- Gráfico 3: Ventas por Tipo de Cliente -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-sm font-bold text-slate-800">Ventas según Tipo de Cliente</h3>
                <p class="text-xs text-slate-500">Alojamientos, Gastronomía, Administradores, Comercios y Particulares</p>
              </div>
            </div>
            <div class="h-64">
              <canvas id="chartClientes"></canvas>
            </div>
          </div>

          <!-- Gráfico 4: Margen y Resultado Operativo -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="text-sm font-bold text-slate-800">Evolución de Rentabilidad y Compras</h3>
                <p class="text-xs text-slate-500">Comparativa mensual de compras, ventas y margen bruto</p>
              </div>
            </div>
            <div class="h-64">
              <canvas id="chartRentabilidad"></canvas>
            </div>
          </div>
        </div>

        <!-- Tabla Rápida: Últimas Ventas y Movimientos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i data-lucide="history" class="w-4 h-4 text-slate-500"></i>
              <h3 class="text-sm font-bold text-slate-800">Últimas Ventas Registradas</h3>
            </div>
            <button onclick="window.app.navigate('ventas')" class="text-xs text-blue-600 hover:text-blue-800 font-semibold">
              Ver todas las ventas →
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-4">Comprobante</th>
                  <th class="py-2.5 px-4">Fecha</th>
                  <th class="py-2.5 px-4">Cliente</th>
                  <th class="py-2.5 px-4">Medio de Pago</th>
                  <th class="py-2.5 px-4 text-right">Total</th>
                  <th class="py-2.5 px-4 text-right">Margen $</th>
                  <th class="py-2.5 px-4 text-right">Margen %</th>
                  <th class="py-2.5 px-4 text-center">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${sales.slice(0, 5).map(s => `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="py-2.5 px-4 font-mono font-bold text-slate-800">${s.sale_number}</td>
                    <td class="py-2.5 px-4 text-slate-600">${Formatter.date(s.date)}</td>
                    <td class="py-2.5 px-4 font-medium text-slate-800">${s.customer_name}</td>
                    <td class="py-2.5 px-4 text-slate-600">${s.payment_method}</td>
                    <td class="py-2.5 px-4 text-right font-bold text-slate-800">${Formatter.money(s.total)}</td>
                    <td class="py-2.5 px-4 text-right font-semibold text-emerald-600">${Formatter.money(s.gross_margin)}</td>
                    <td class="py-2.5 px-4 text-right font-medium text-emerald-700">${Formatter.percent(s.gross_margin_pct)}</td>
                    <td class="py-2.5 px-4 text-center">
                      <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${s.status === 'COMPLETADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                        ${s.status}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Renderizar iconos de Lucide
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Inicializar gráficos Chart.js
    this.initCharts(sales, db.getCategories(), products);
  },

  initCharts(sales, categories, products) {
    if (!window.Chart) return;

    try {
      // Destruir gráficos anteriores si existen
      if (chartVentasDia) chartVentasDia.destroy();
      if (chartCategorias) chartCategorias.destroy();
      if (chartClientes) chartClientes.destroy();
      if (chartRentabilidad) chartRentabilidad.destroy();

      const completedSales = (sales || []).filter(s => s.status === 'COMPLETADA');

      // 1. Gráfico Ventas por Día (Dinámico - Real)
      const ctxVentas = document.getElementById('chartVentasDia');
      if (ctxVentas) {
        let dates = [];
        let salesAmounts = [];
        let costsAmounts = [];

        if (completedSales.length === 0) {
          dates = ['Sin ventas registradas'];
          salesAmounts = [0];
          costsAmounts = [0];
        } else {
          const byDate = {};
          completedSales.forEach(s => {
            const d = (s.date || '').substring(5);
            if (!byDate[d]) byDate[d] = { sales: 0, cost: 0 };
            byDate[d].sales += (s.total || 0);
            byDate[d].cost += (s.total_cost || 0);
          });
          dates = Object.keys(byDate).sort();
          salesAmounts = dates.map(d => byDate[d].sales);
          costsAmounts = dates.map(d => byDate[d].cost);
        }

        chartVentasDia = new window.Chart(ctxVentas, {
          type: 'bar',
          data: {
            labels: dates,
            datasets: [
              {
                label: 'Ventas ($)',
                data: salesAmounts,
                backgroundColor: '#0E3A6B',
                borderRadius: 6
              },
              {
                label: 'Costo CMV ($)',
                data: costsAmounts,
                backgroundColor: '#cbd5e1',
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${Formatter.money(ctx.raw)}`
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (val) => '$' + (val / 1000) + 'k'
                }
              }
            }
          }
        });
      }

      // 2. Gráfico Categorías (Dinámico - Real)
      const ctxCat = document.getElementById('chartCategorias');
      if (ctxCat) {
        let catLabels = [];
        let catData = [];

        if (completedSales.length === 0) {
          catLabels = ['Sin ventas registradas'];
          catData = [0];
        } else {
          const byCat = {};
          completedSales.forEach(s => {
            (s.items || []).forEach(it => {
              const prod = (products || []).find(p => p.id === it.product_id);
              const cat = (categories || []).find(c => c.id === prod?.category_id);
              const catName = cat ? cat.name : 'Varios';
              byCat[catName] = (byCat[catName] || 0) + (it.subtotal || 0);
            });
          });
          catLabels = Object.keys(byCat);
          catData = catLabels.map(c => byCat[c]);
          if (catLabels.length === 0) {
            catLabels = ['Sin ventas registradas'];
            catData = [0];
          }
        }

        chartCategorias = new window.Chart(ctxCat, {
          type: 'doughnut',
          data: {
            labels: catLabels,
            datasets: [{
              data: catData,
              backgroundColor: ['#0E3A6B', '#4EA1DD', '#8FD0F4', '#f59e0b', '#06b6d4', '#10b981'],
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.label}: ${Formatter.money(ctx.raw)}`
                }
              }
            }
          }
        });
      }

      // 3. Gráfico Ventas por Tipo de Cliente (Dinámico - Real)
      const ctxCli = document.getElementById('chartClientes');
      if (ctxCli) {
        let cliLabels = [];
        let cliData = [];

        if (completedSales.length === 0) {
          cliLabels = ['Sin ventas registradas'];
          cliData = [0];
        } else {
          const customers = db.getCustomers() || [];
          const byType = {};
          completedSales.forEach(s => {
            const cust = customers.find(c => c.id === s.customer_id);
            const type = cust ? cust.customer_type : (s.customer_name || 'Venta Mostrador');
            byType[type] = (byType[type] || 0) + (s.total || 0);
          });
          cliLabels = Object.keys(byType);
          cliData = cliLabels.map(t => byType[t]);
          if (cliLabels.length === 0) {
            cliLabels = ['Sin ventas registradas'];
            cliData = [0];
          }
        }

        chartClientes = new window.Chart(ctxCli, {
          type: 'pie',
          data: {
            labels: cliLabels,
            datasets: [{
              data: cliData,
              backgroundColor: ['#0E3A6B', '#4EA1DD', '#10b981', '#6366f1', '#f59e0b']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.label}: ${Formatter.money(ctx.raw)}`
                }
              }
            }
          }
        });
      }

      // 4. Gráfico Rentabilidad Mensual (Dinámico - Real)
      const ctxRent = document.getElementById('chartRentabilidad');
      if (ctxRent) {
        let rentLabels = [];
        let rentVentas = [];
        let rentMargen = [];
        let rentGastos = [];

        if (completedSales.length === 0) {
          rentLabels = ['Sin operaciones'];
          rentVentas = [0];
          rentMargen = [0];
          rentGastos = [0];
        } else {
          const expenses = db.getExpenses() || [];
          const byMonth = {};
          completedSales.forEach(s => {
            const m = (s.date || '').substring(0, 7);
            if (!byMonth[m]) byMonth[m] = { sales: 0, margin: 0, expenses: 0 };
            byMonth[m].sales += (s.total || 0);
            byMonth[m].margin += (s.gross_margin || (s.total - s.total_cost) || 0);
          });
          expenses.forEach(e => {
            const m = (e.date || '').substring(0, 7);
            if (!byMonth[m]) byMonth[m] = { sales: 0, margin: 0, expenses: 0 };
            byMonth[m].expenses += (e.amount || 0);
          });
          rentLabels = Object.keys(byMonth).sort();
          rentVentas = rentLabels.map(m => byMonth[m].sales);
          rentMargen = rentLabels.map(m => byMonth[m].margin);
          rentGastos = rentLabels.map(m => byMonth[m].expenses);
        }

        chartRentabilidad = new window.Chart(ctxRent, {
          type: 'line',
          data: {
            labels: rentLabels,
            datasets: [
              {
                label: 'Ventas',
                data: rentVentas,
                borderColor: '#0E3A6B',
                backgroundColor: 'rgba(14, 58, 107, 0.1)',
                fill: true,
                tension: 0.3
              },
              {
                label: 'Margen Bruto',
                data: rentMargen,
                borderColor: '#4EA1DD',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                tension: 0.3
              },
              {
                label: 'Gastos Operativos',
                data: rentGastos,
                borderColor: '#f43f5e',
                backgroundColor: 'transparent',
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${Formatter.money(ctx.raw)}`
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: (val) => '$' + (val / 1000) + 'k'
                }
              }
            }
          }
        });
      }
    } catch (chartErr) {
      console.warn('Advertencia inicializando gráficos Chart.js:', chartErr);
    }
  }
};
