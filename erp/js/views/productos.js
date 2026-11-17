// Módulo de Productos & Catálogo para Limpieza Caviahue
// CRUD completo, conversiones de unidades, costos Caviahue, márgenes vs markup e historial.

import { db } from '../db.js';
import { updateCentralSalePrice, readCentral } from '../supabase_erp_adapter.js';
import { Formatter, PricingCalculator } from '../models.js';

let productChart = null;

export const ProductosView = {
  async changeCentralPrice(productId) {
    if (!window.app?.centralReadOnly) return;
    const product=db.getProduct(productId);
    if (!product) { alert('No se encontró el producto'); return; }
    const raw=prompt('Nuevo precio de venta para '+product.name+' (ARS):',String(product.sale_price||''));
    if (raw===null) return;
    const price=Number(String(raw).trim().replace(',','.'));
    if (!Number.isFinite(price) || price<=0) { alert('Ingresá un precio válido mayor que cero'); return; }
    if (price===Number(product.sale_price)) return;
    if (!confirm('Confirmar precio de '+product.name+': '+Formatter.money(product.sale_price)+' → '+Formatter.money(price)+'?')) return;
    try {
      await updateCentralSalePrice(productId,price);
      const products=await readCentral('products',{order:'id.asc',limit:10000});
      db.centralSetTable('products',products);
      window.app.showNotification('Precio guardado en Supabase','success');
      window.app.navigate('productos');
    } catch(error) {
      alert('No se pudo actualizar el precio: '+(error.message||error));
    }
  },

  render(container, params = {}) {
    const isNew = params.action === 'new';
    const editId = params.editId;
    const viewId = params.viewId;

    const products = db.getProducts();
    const categories = db.getCategories();
    const suppliers = db.getSuppliers();

    if (isNew || editId) {
      this.renderProductForm(container, categories, suppliers, editId ? db.getProduct(editId) : null);
    } else if (viewId) {
      this.renderProductDetail(container, db.getProduct(viewId));
    } else {
      this.renderProductsList(container, products, categories);
    }
  },

  renderProductsList(container, products, categories) {
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Catálogo de Productos & Precios</h1>
            <p class="text-xs text-slate-500">Gestión de insumos descartables, químicos, hotelería y control de márgenes.</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.productosModule.exportCSV()" class="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold shadow-sm transition">
              <i data-lucide="download" class="w-4 h-4"></i> Exportar CSV
            </button>
            <button onclick="window.app.navigate('productos', { action: 'new' })" class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
              <i data-lucide="plus-circle" class="w-4 h-4"></i> + Nuevo Producto
            </button>
          </div>
        </div>

        <!-- Filtros y Buscador -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div class="relative w-full md:w-80">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3 text-slate-400"></i>
            <input type="text" id="searchProdInput" placeholder="Buscar por SKU, nombre, marca..." class="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          </div>

          <div class="flex items-center gap-3 w-full md:w-auto text-xs">
            <select id="filterCategory" class="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700">
              <option value="TODAS">Todas las Categorías</option>
              ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>

            <select id="filterStockStatus" class="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700">
              <option value="TODOS">Todos los Stocks</option>
              <option value="BAJO">Stock Bajo / Crítico</option>
              <option value="SIN_STOCK">Sin Stock</option>
              <option value="ACTIVO">Activos</option>
            </select>
          </div>
        </div>

        <!-- Tabla de Productos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-3">SKU</th>
                  <th class="py-3 px-3">Producto / Presentación</th>
                  <th class="py-3 px-3">Categoría</th>
                  <th class="py-3 px-3 text-right">Costo Caviahue</th>
                  <th class="py-3 px-3 text-right">Precio Venta</th>
                  <th class="py-3 px-3 text-right">Margen %</th>
                  <th class="py-3 px-3 text-right">Markup %</th>
                  <th class="py-3 px-3 text-center">Stock Actual</th>
                  <th class="py-3 px-3">Ubicación</th>
                  <th class="py-3 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100" id="productsTableBody">
                ${products.map(p => {
                  const cat = categories.find(c => c.id === p.category_id);
                  const isLow = p.current_stock > 0 && p.current_stock <= (p.min_stock || 5);
                  const isOut = p.current_stock <= 0;
                  const isLowMargin = p.margin_pct < (p.target_margin || 35);
                  return `
                    <tr class="hover:bg-slate-50 transition" data-cat="${p.category_id}" data-low="${isLow}" data-out="${isOut}">
                      <td class="py-3 px-3 font-mono font-bold text-slate-700">${p.sku}</td>
                      <td class="py-3 px-3">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        <div class="text-[11px] text-slate-500">${p.brand || 'Genérico'} • ${p.presentation || p.sale_unit}</div>
                      </td>
                      <td class="py-3 px-3">
                        <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          ${cat ? cat.name : 'Varios'}
                        </span>
                      </td>
                      <td class="py-3 px-3 text-right text-slate-600 font-medium">${Formatter.money(p.caviahue_cost)}</td>
                      <td class="py-3 px-3 text-right font-bold text-slate-900">${Formatter.money(p.sale_price)}</td>
                      <td class="py-3 px-3 text-right font-bold ${isLowMargin ? 'text-amber-600' : 'text-emerald-700'}">
                        ${Formatter.percent(p.margin_pct)}
                      </td>
                      <td class="py-3 px-3 text-right text-slate-500">${Formatter.percent(p.markup_pct)}</td>
                      <td class="py-3 px-3 text-center">
                        <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${isOut ? 'bg-rose-100 text-rose-800' : isLow ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                          ${p.current_stock} ${p.sale_unit}
                        </span>
                      </td>
                      <td class="py-3 px-3 text-slate-500 text-[11px]">${p.warehouse_location || '-'}</td>
                      <td class="py-3 px-3 text-center space-x-1 whitespace-nowrap">
                        <button onclick="window.app.navigate('productos', { viewId: '${p.id}' })" title="Ver Ficha y Gráficos" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                          <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                        ${window.app?.centralReadOnly ? `<button onclick="window.productosModule.changeCentralPrice('${p.id}')" title="Modificar precio de venta en Supabase" class="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"><i data-lucide="badge-dollar-sign" class="w-4 h-4"></i></button>` : ''}
                        <button onclick="window.app.navigate('productos', { editId: '${p.id}' })" title="Editar Producto" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded">
                          <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button onclick="window.productosModule.deleteProd('${p.id}')" title="Eliminar" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded">
                          <i data-lucide="trash-2" class="w-4 h-4"></i>
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
    this.attachListFilters();
  },

  renderProductForm(container, categories, suppliers, product = null) {
    const isEdit = !!product;
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-4xl mx-auto">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('productos')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div>
              <h1 class="text-2xl font-bold text-slate-800 tracking-tight">
                ${isEdit ? `Editar Producto: ${product.name}` : 'Nuevo Producto / Insumo'}
              </h1>
              <p class="text-xs text-slate-500">Definición de costos, márgenes, factor de conversión y stock.</p>
            </div>
          </div>
        </div>

        <form id="productForm" onsubmit="window.productosModule.saveProductForm(event, '${product ? product.id : ''}')" class="space-y-5">
          <!-- 1. Datos Generales -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">1. Identificación y Clasificación</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Código / SKU *</label>
                <input type="text" name="sku" required value="${product ? product.sku : ''}" placeholder="Ej: QUIM-LAV-5L" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Código de Barras (Opcional)</label>
                <input type="text" name="barcode" value="${product ? product.barcode || '' : ''}" placeholder="7791234567890" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Marca</label>
                <input type="text" name="brand" value="${product ? product.brand || '' : ''}" placeholder="Ej: Químicos del Comahue" class="w-full border border-slate-300 rounded-lg p-2">
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div class="md:col-span-2">
                <label class="block font-bold text-slate-700 mb-1">Nombre Completo del Producto *</label>
                <input type="text" name="name" required value="${product ? product.name : ''}" placeholder="Ej: Lavandina Concentrada 55g x 5 Litros" class="w-full border border-slate-300 rounded-lg p-2 font-medium">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Categoría *</label>
                <select name="category_id" required class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                  ${categories.map(c => `
                    <option value="${c.id}" ${product && product.category_id === c.id ? 'selected' : ''}>${c.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Subcategoría</label>
                <input type="text" name="subcategory" value="${product ? product.subcategory || '' : ''}" placeholder="Ej: Lavandina, Vasos, Cajas..." class="w-full border border-slate-300 rounded-lg p-2">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Proveedor Principal</label>
                <select name="supplier_id" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                  <option value="">Sin proveedor asignado</option>
                  ${suppliers.map(s => `
                    <option value="${s.id}" ${product && product.supplier_id === s.id ? 'selected' : ''}>${s.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <div class="text-xs">
              <label class="block font-bold text-slate-700 mb-1">Descripción</label>
              <textarea name="description" rows="2" placeholder="Detalles de uso o recomendaciones..." class="w-full border border-slate-300 rounded-lg p-2">${product ? product.description || '' : ''}</textarea>
            </div>
          </div>

          <!-- 2. Unidades y Conversión -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div class="flex items-center justify-between border-b pb-2">
              <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider">2. Unidades de Medida & Conversión de Stock</h2>
              <span class="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">El stock se controla en Unidad de Venta (Base)</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Unidad de Compra</label>
                <input type="text" name="purchase_unit" value="${product ? product.purchase_unit || '' : 'Caja x 4'}" placeholder="Ej: Caja x 4, Bulto x 1000..." class="w-full border border-slate-300 rounded-lg p-2">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Unidad de Venta (Unidad Base) *</label>
                <input type="text" name="sale_unit" required value="${product ? product.sale_unit || '' : 'Bidón 5L'}" placeholder="Ej: Bidón 5L, Unidad, Pack..." class="w-full border border-slate-300 rounded-lg p-2">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Factor de Conversión *</label>
                <input type="number" min="1" step="0.01" name="conversion_factor" required value="${product ? product.conversion_factor || 1 : 1}" class="w-full border border-slate-300 rounded-lg p-2">
                <span class="text-[10px] text-slate-400">1 Unidad Compra = X Unidades de Venta</span>
              </div>
            </div>
          </div>

          <!-- 3. Costos Caviahue, Precios y Márgenes -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">3. Costo Puesto en Caviahue, Precios y Márgenes</h2>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Costo Compra Proveedor (Factura) *</label>
                <input type="number" step="0.01" id="prodPurchaseCost" name="purchase_cost" required value="${product ? product.purchase_cost || 0 : 0}" class="w-full border border-slate-300 rounded-lg p-2 text-right">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Flete / Gasto Logístico Asignado</label>
                <input type="number" step="0.01" id="prodLogisticsCost" name="logistics_cost" value="${product ? product.logistics_cost || 0 : 0}" class="w-full border border-slate-300 rounded-lg p-2 text-right">
              </div>
              <div>
                <label class="block font-bold text-blue-900 mb-1">Costo Real Puesto en Caviahue *</label>
                <input type="number" step="0.01" id="prodCaviahueCost" name="caviahue_cost" required value="${product ? product.caviahue_cost || 0 : 0}" class="w-full border border-blue-300 bg-blue-50/50 rounded-lg p-2 text-right font-bold text-blue-900">
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Margen Objetivo (%)</label>
                <div class="flex gap-2">
                  <input type="number" step="0.1" id="prodTargetMargin" name="target_margin" value="${product ? product.target_margin || 40 : 40}" class="w-full border border-slate-300 rounded-lg p-2 text-right">
                  <button type="button" onclick="window.productosModule.calcSuggested()" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold">
                    Sugerir
                  </button>
                </div>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Precio Venta Minorista (PVP) *</label>
                <input type="number" step="0.01" id="prodSalePrice" name="sale_price" required value="${product ? product.sale_price || 0 : 0}" class="w-full border border-emerald-300 bg-emerald-50/30 rounded-lg p-2 text-right font-bold text-emerald-800">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Precio Mayorista (Opcional)</label>
                <input type="number" step="0.01" name="wholesale_price" value="${product ? product.wholesale_price || 0 : 0}" class="w-full border border-slate-300 rounded-lg p-2 text-right">
              </div>
            </div>

            <!-- Previsualización en Vivo de Márgenes -->
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between text-xs gap-3">
              <div>
                <span class="text-slate-500">Ganancia en Pesos:</span>
                <span id="previewMarginAmount" class="font-bold text-slate-800 ml-1">$ 0,00</span>
              </div>
              <div>
                <span class="text-slate-500">Margen Real (%):</span>
                <span id="previewMarginPct" class="font-bold text-emerald-700 ml-1">0,00 %</span>
              </div>
              <div>
                <span class="text-slate-500">Markup (%):</span>
                <span id="previewMarkupPct" class="font-bold text-blue-700 ml-1">0,00 %</span>
              </div>
            </div>
          </div>

          <!-- 4. Inventario y Almacenamiento -->
          <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">4. Stock y Parámetros de Almacén</h2>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Stock Actual</label>
                <input type="number" name="current_stock" value="${product ? product.current_stock : 0}" class="w-full border border-slate-300 rounded-lg p-2 text-center font-bold">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Stock Mínimo (Alerta)</label>
                <input type="number" name="min_stock" value="${product ? product.min_stock || 10 : 10}" class="w-full border border-slate-300 rounded-lg p-2 text-center">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Stock Máximo</label>
                <input type="number" name="max_stock" value="${product ? product.max_stock || 50 : 50}" class="w-full border border-slate-300 rounded-lg p-2 text-center">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Ubicación en Depósito</label>
                <input type="text" name="warehouse_location" value="${product ? product.warehouse_location || '' : 'Depósito A'}" placeholder="Ej: Estante 3 - Fila B" class="w-full border border-slate-300 rounded-lg p-2">
              </div>
            </div>
          </div>

          <!-- Botones de Acción -->
          <div class="flex items-center justify-end gap-3 pt-2">
            <button type="button" onclick="window.app.navigate('productos')" class="px-5 py-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition">
              ${isEdit ? 'Guardar Cambios' : 'Registrar Producto'}
            </button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.attachFormListeners();
  },

  renderProductDetail(container, product) {
    if (!product) {
      container.innerHTML = '<div class="p-8 text-center text-xs text-rose-500">Producto no encontrado</div>';
      return;
    }

    const categories = db.getCategories();
    const cat = categories.find(c => c.id === product.category_id);
    const costHist = db.getCostHistory(product.id);

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('productos')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">${product.sku}</span>
                <span class="text-xs text-slate-500">${cat ? cat.name : ''}</span>
              </div>
              <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-0.5">${product.name}</h1>
            </div>
          </div>
          <button onclick="window.app.navigate('productos', { editId: '${product.id}' })" class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5">
            <i data-lucide="edit-3" class="w-4 h-4"></i> Editar Producto
          </button>
        </div>

        <!-- Indicadores Clave del Producto -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Costo Puesto Caviahue</div>
            <div class="text-lg font-bold text-blue-900 mt-1">${Formatter.money(product.caviahue_cost)}</div>
            <div class="text-[11px] text-slate-400">Por ${product.sale_unit}</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Precio de Venta (PVP)</div>
            <div class="text-lg font-bold text-emerald-800 mt-1">${Formatter.money(product.sale_price)}</div>
            <div class="text-[11px] text-emerald-600 font-semibold">Margen: ${Formatter.percent(product.margin_pct)}</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Stock Actual</div>
            <div class="text-lg font-bold text-slate-800 mt-1">${product.current_stock} ${product.sale_unit}</div>
            <div class="text-[11px] text-slate-500">Mín: ${product.min_stock} | Máx: ${product.max_stock}</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Capital Invertido</div>
            <div class="text-lg font-bold text-slate-800 mt-1">
              ${Formatter.money((product.current_stock || 0) * (product.caviahue_cost || 0))}
            </div>
            <div class="text-[11px] text-slate-500">Stock valorizado a costo</div>
          </div>
        </div>

        <!-- Gráfico de Evolución Histórica de Costos y Precios -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 class="text-sm font-bold text-slate-800 mb-1">Evolución Histórica de Costos y Precios</h3>
          <p class="text-xs text-slate-500 mb-4">Trazabilidad del impacto del flete de montaña y variaciones de lista</p>
          <div class="h-64">
            <canvas id="productDetailChart"></canvas>
          </div>
        </div>

        <!-- Historial de Costos Registrados -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Historial de Costos & Fletes</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-2.5 px-4">Fecha</th>
                  <th class="py-2.5 px-4">Motivo / Operación</th>
                  <th class="py-2.5 px-4 text-right">Costo Factura</th>
                  <th class="py-2.5 px-4 text-right">Flete Caviahue</th>
                  <th class="py-2.5 px-4 text-right font-bold text-blue-700">Costo Puesto Caviahue</th>
                  <th class="py-2.5 px-4">Registrado Por</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${costHist.length > 0 ? costHist.map(h => `
                  <tr>
                    <td class="py-2.5 px-4">${Formatter.date(h.date)}</td>
                    <td class="py-2.5 px-4 font-medium text-slate-800">${h.reason || 'Compra'}</td>
                    <td class="py-2.5 px-4 text-right text-slate-600">${Formatter.money(h.invoice_cost)}</td>
                    <td class="py-2.5 px-4 text-right text-blue-600">${Formatter.money(h.logistics_cost)}</td>
                    <td class="py-2.5 px-4 text-right font-bold text-blue-900">${Formatter.money(h.caviahue_cost)}</td>
                    <td class="py-2.5 px-4 text-slate-500">${h.user_name}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" class="py-4 text-center text-slate-400">Sin historial adicional de costos</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Iniciar gráfico de estructura de precios del producto
    const ctx = document.getElementById('productDetailChart');
    if (ctx && window.Chart) {
      if (productChart) productChart.destroy();
      const baseCost = (product.purchase_cost || 0) / (product.conversion_factor || 1);
      productChart = new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Costo Factura', 'Costo Caviahue', 'Mayorista', 'Venta Minorista'],
          datasets: [
            {
              label: 'Valores ($)',
              data: [baseCost, product.caviahue_cost, product.wholesale_price || (product.sale_price * 0.85), product.sale_price],
              backgroundColor: ['#94a3b8', '#0E3A6B', '#4EA1DD', '#10b981'],
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.label}: ${Formatter.money(ctx.raw)}`
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
  },

  attachListFilters() {
    const searchInput = document.getElementById('searchProdInput');
    const catSelect = document.getElementById('filterCategory');
    const stockSelect = document.getElementById('filterStockStatus');

    const filterRows = () => {
      const q = (searchInput?.value || '').toLowerCase().trim();
      const cat = catSelect?.value || 'TODAS';
      const st = stockSelect?.value || 'TODOS';
      const rows = document.querySelectorAll('#productsTableBody tr');

      rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        const matchesQ = text.includes(q);
        const matchesCat = cat === 'TODAS' || r.getAttribute('data-cat') === cat;
        let matchesStock = true;
        if (st === 'BAJO') matchesStock = r.getAttribute('data-low') === 'true';
        if (st === 'SIN_STOCK') matchesStock = r.getAttribute('data-out') === 'true';

        r.style.display = matchesQ && matchesCat && matchesStock ? '' : 'none';
      });
    };

    if (searchInput) searchInput.addEventListener('input', filterRows);
    if (catSelect) catSelect.addEventListener('change', filterRows);
    if (stockSelect) stockSelect.addEventListener('change', filterRows);
  },

  attachFormListeners() {
    const costInput = document.getElementById('prodCaviahueCost');
    const priceInput = document.getElementById('prodSalePrice');

    const updatePreview = () => {
      const cost = Number(costInput?.value) || 0;
      const price = Number(priceInput?.value) || 0;
      const marginAmt = price - cost;
      const marginPct = PricingCalculator.calcMarginPct(cost, price);
      const markupPct = PricingCalculator.calcMarkupPct(cost, price);

      const elAmt = document.getElementById('previewMarginAmount');
      const elPct = document.getElementById('previewMarginPct');
      const elMark = document.getElementById('previewMarkupPct');

      if (elAmt) elAmt.textContent = Formatter.money(marginAmt);
      if (elPct) elPct.textContent = Formatter.percent(marginPct);
      if (elMark) elMark.textContent = Formatter.percent(markupPct);
    };

    if (costInput) costInput.addEventListener('input', updatePreview);
    if (priceInput) priceInput.addEventListener('input', updatePreview);
    updatePreview();
  }
};

window.productosModule = {
  calcSuggested() {
    const costInput = document.getElementById('prodCaviahueCost');
    const targetInput = document.getElementById('prodTargetMargin');
    const priceInput = document.getElementById('prodSalePrice');

    const cost = Number(costInput?.value) || 0;
    const target = Number(targetInput?.value) || 40;

    if (cost <= 0) {
      alert('Ingresá primero el Costo Caviahue.');
      return;
    }

    const suggested = PricingCalculator.calcSuggestedPrice(cost, target);
    if (priceInput) {
      priceInput.value = suggested;
      // Disparar evento
      priceInput.dispatchEvent(new Event('input'));
    }
  },

  saveProductForm(e, editId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const data = {
      sku: formData.get('sku').trim(),
      barcode: formData.get('barcode').trim(),
      brand: formData.get('brand').trim(),
      name: formData.get('name').trim(),
      category_id: formData.get('category_id'),
      subcategory: formData.get('subcategory').trim(),
      supplier_id: formData.get('supplier_id'),
      description: formData.get('description').trim(),
      purchase_unit: formData.get('purchase_unit').trim(),
      sale_unit: formData.get('sale_unit').trim(),
      conversion_factor: Number(formData.get('conversion_factor')) || 1,
      purchase_cost: Number(formData.get('purchase_cost')) || 0,
      logistics_cost: Number(formData.get('logistics_cost')) || 0,
      caviahue_cost: Number(formData.get('caviahue_cost')) || 0,
      target_margin: Number(formData.get('target_margin')) || 40,
      sale_price: Number(formData.get('sale_price')) || 0,
      wholesale_price: Number(formData.get('wholesale_price')) || 0,
      current_stock: Number(formData.get('current_stock')) || 0,
      min_stock: Number(formData.get('min_stock')) || 10,
      max_stock: Number(formData.get('max_stock')) || 50,
      warehouse_location: formData.get('warehouse_location').trim()
    };

    if (editId) data.id = editId;

    try {
      db.saveProduct(data);
      window.app.showNotification(`Producto "${data.name}" guardado exitosamente.`, 'success');
      window.app.navigate('productos');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  deleteProd(id) {
    const prod = db.getProduct(id);
    if (!prod) return;
    if (confirm(`¿Estás seguro de eliminar el producto ${prod.name}?`)) {
      db.deleteProduct(id);
      window.app.showNotification(`Producto eliminado.`, 'info');
      window.app.navigate('productos');
    }
  },

  exportCSV() {
    const products = db.getProducts();
    let csv = 'SKU;Nombre;Categoria;CostoCaviahue;PrecioVenta;MargenPct;MarkupPct;StockActual;Unidad\n';
    products.forEach(p => {
      csv += `${p.sku};"${p.name}";${p.category_id};${p.caviahue_cost};${p.sale_price};${p.margin_pct};${p.markup_pct};${p.current_stock};${p.sale_unit}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `catalogo_productos_caviahue_${new Date().toISOString().substring(0,10)}.csv`);
    link.click();
  }
};
