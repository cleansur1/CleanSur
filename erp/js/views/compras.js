import { db } from '../db.js';
import { Formatter, PackagingEngine, LogisticsCostDistributor } from '../models.js';
import { OcrFacturasView } from './ocr_facturas.js?v=10.6';
let filterSupplierId = 'ALL';
let filterDateFrom = '';
let filterDateTo = '';
let filterSearchQuery = '';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[character]);
const attributeArgument = value => escapeHtml(JSON.stringify(String(value)));

export const ComprasView = {
  render(container, params = {}) {
    window.comprasModule = this;
    const action = params.action || 'list';
    if (params.supplier_id) {
      filterSupplierId = params.supplier_id;
    }
    const purchases = db.getPurchases();
    const suppliers = db.getSuppliers();
    const products = db.getProducts();

    if (action === 'new') {
      this.renderNewPurchase(container, suppliers, products);
    } else if (action === 'ocr') {
      this.renderUnifiedOcrTab(container, purchases, params);
    } else {
      this.renderPurchasesList(container, purchases, suppliers);
    }
  },

  renderTopNavTabs(activeTab, purchasesCount) {
    return `
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Compras, Facturas & Lector OCR</h1>
          <p class="text-xs text-slate-500">Módulo unificado: subí fotos/PDF de tus facturas para lectura exacta, o consultá tus comprobantes por fecha y proveedor.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button onclick="window.app.navigate('compras', { action: 'list' })" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition ${activeTab === 'list' ? 'bg-[#0E3A6B] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="file-Spreadsheet" class="w-4 h-4"></i>
            Ver compras
          </button>
          <button onclick="window.app.navigate('compras', { action: 'ocr' })" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition ${activeTab === 'ocr' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'}">
            <i data-lucide="camera" class="w-4 h-4"></i>
            Cargar Factura por Foto / PDF (OCR)
          </button>
          <button onclick="window.app.navigate('compras', { action: 'new' })" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'new' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            + Carga Manual
          </button>
        </div>
      </div>
    `;
  },

  renderUnifiedOcrTab(container, purchases, params = {}) {
    const activeCount = purchases.filter(p => p.status !== 'ANULADA').length;
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        ${this.renderTopNavTabs('ocr', activeCount)}
        <div id="compras-ocr-embedded-slot"></div>
      </div>
    `;
    const slot = document.getElementById('compras-ocr-embedded-slot');
    if (slot) {
      OcrFacturasView.render(slot, { ...params, embedded: true });
    }
    if (window.lucide) window.lucide.createIcons();

    // Listener explícito para todos los botones Ver / Editar
    document.querySelectorAll('.btn-open-edit-purchase').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const purId = btn.getAttribute('data-purchase-id');
        if (purId) ComprasView.openEditInvoiceModal(purId);
      };
    });
  },

  renderPurchasesList(container, purchases, suppliers = []) {
    const central = Boolean(window.app?.centralReadOnly);
    const activeSuppliers = suppliers.length ? suppliers : db.getSuppliers();
    const activePurchases = purchases.filter(p => p.status !== 'ANULADA');
    const activeCount = activePurchases.length;

    // Detectar compras con discrepancias de conciliación (|diff| > 0.05)
    const unconciliatedPurchases = activePurchases.filter(p => {
      const stated = p.invoice_stated_total != null && p.invoice_stated_total !== '' ? Number(p.invoice_stated_total) : Number(p.total_final);
      const calc = Number(p.total_final) || 0;
      const diff = Math.abs(stated - calc);
      return (p.reconciliation && p.reconciliation.status === 'DIFERENCIA') || diff > 0.05;
    });

    // Aplicar filtros de Proveedor, Fecha y Búsqueda por Código/Descripción/Factura
    const filteredPurchases = purchases.filter(p => {
      if (filterSupplierId !== 'ALL' && String(p.supplier_id) !== String(filterSupplierId)) {
        return false;
      }
      if (filterDateFrom && String(p.date || '').slice(0, 10) < filterDateFrom) {
        return false;
      }
      if (filterDateTo && String(p.date || '').slice(0, 10) > filterDateTo) {
        return false;
      }
      if (filterSearchQuery.trim() !== '') {
        const q = filterSearchQuery.trim().toUpperCase();
        const inHeader = String(p.invoice_number || '').toUpperCase().includes(q) ||
          String(p.purchase_number || '').toUpperCase().includes(q) ||
          String(p.supplier_name || '').toUpperCase().includes(q);
        const inItems = (p.items || []).some(it =>
          String(it.code || it.sku || '').toUpperCase().includes(q) ||
          String(it.product_name || it.commercial_name || '').toUpperCase().includes(q)
        );
        if (!inHeader && !inItems) return false;
      }
      return true;
    }).sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));

    const totalConfirmed = filteredPurchases
      .filter(p => p.status !== 'ANULADA')
      .reduce((acc, p) => acc + (Number(p.total_final) || 0), 0);

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        ${this.renderTopNavTabs('list', activeCount)}

        <!-- Banner de Alerta de Discrepancias de Conciliación si existen -->
        ${unconciliatedPurchases.length > 0 ? `
          <div class="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 shadow-sm space-y-3">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <i data-lucide="alert-triangle" class="w-6 h-6"></i>
              </div>
              <div class="flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="text-sm font-black text-rose-950">
                    Alerta de Conciliación: ${unconciliatedPurchases.length} factura${unconciliatedPurchases.length > 1 ? 's' : ''} con diferencias detectadas
                  </h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-200 text-rose-900 uppercase">
                    Requiere Revisión
                  </span>
                </div>
                <p class="text-xs text-rose-800 mt-1 leading-relaxed">
                  El total declarado difiere de la suma de los renglones. Abrí el comprobante para revisar la diferencia.
                </p>
                <div class="flex flex-wrap items-center gap-2 mt-3">
                  ${unconciliatedPurchases.map(p => {
                    const stated = p.invoice_stated_total != null && p.invoice_stated_total !== '' ? Number(p.invoice_stated_total) : Number(p.total_final);
                    const diff = Number((stated - (Number(p.total_final) || 0)).toFixed(2));
                    return `
                      <button onclick="window.comprasModule.${central ? 'viewCentralPurchase' : 'openEditInvoiceModal'}(${attributeArgument(p.id)})" class="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-950 rounded-xl text-xs font-bold border border-rose-300 shadow-sm flex items-center gap-2 transition">
                        <span class="font-mono font-black text-blue-900">${escapeHtml(p.invoice_number)}</span>
                        <span class="text-slate-600 truncate max-w-[140px]">${escapeHtml(p.supplier_name)}</span>
                        <span class="font-mono font-black text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px]">
                          Dif: ${diff >= 0 ? '+' : ''}${Formatter.money(diff)}
                        </span>
                        <i data-lucide="edit-3" class="w-3.5 h-3.5 text-rose-600"></i>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Filtros Rápidos por Categoría de Proveedor + Fecha + Buscador de Código/Artículo -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <!-- Pastillas de Filtro por Proveedor -->
          <div class="space-y-1.5">
            <label class="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Filtrar por Proveedor:</label>
            <div class="flex flex-wrap items-center gap-2">
              <button onclick="window.comprasModule.setSupplierFilter('ALL')" class="px-3 py-1.5 rounded-lg text-xs font-bold transition border ${filterSupplierId === 'ALL' ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}">
                Todos los Proveedores (${purchases.filter(p => p.status !== 'ANULADA').length})
              </button>
              ${activeSuppliers.map(s => {
                const count = purchases.filter(p => p.status !== 'ANULADA' && String(p.supplier_id) === String(s.id)).length;
                const active = String(filterSupplierId) === String(s.id);
                return `
                  <button onclick="window.comprasModule.setSupplierFilter(${attributeArgument(s.id)})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition border ${active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'}">
                    ${escapeHtml(s.name)} <span class="ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}">${count}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Filtros de Fecha y Búsqueda por Código/Descripción -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100 items-end">
            <div class="md:col-span-5">
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Buscar por N° Factura, Código o Descripción de Artículo</label>
              <div class="relative">
                <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
                <input type="text" id="comprasSearchInput" value="${escapeHtml(filterSearchQuery)}" placeholder="Ej: 00014989, 98459, K0274, 2000085, Lavandina..." class="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none">
              </div>
            </div>
            <div class="md:col-span-2">
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Desde</label>
              <input type="date" id="comprasDateFrom" value="${filterDateFrom}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div class="md:col-span-2">
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Hasta</label>
              <input type="date" id="comprasDateTo" value="${filterDateTo}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs">
            </div>
            <div class="md:col-span-3 flex items-center justify-between gap-2 bg-slate-50 px-3.5 py-2 rounded-lg border border-slate-200">
              <div>
                <span class="block text-[10px] font-bold text-slate-400 uppercase">Total Filtrado (${filteredPurchases.length})</span>
                <span class="text-sm font-black text-slate-900">${Formatter.money(totalConfirmed)}</span>
              </div>
              <button onclick="window.comprasModule.clearFilters()" class="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded text-[11px] font-bold transition">
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <!-- Tabla de Compras con Columna de Conciliación -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-800 text-white uppercase tracking-wider font-semibold">
                <tr>
                  <th class="py-3 px-4">Fecha</th>
                  <th class="py-3 px-4">Factura / Comprobante</th>
                  <th class="py-3 px-4">Proveedor</th>
                  <th class="py-3 px-3 text-center">Artículos</th>
                  <th class="py-3 px-3 text-right">Subtotal Neto</th>
                  <th class="py-3 px-3 text-right">Descuento</th>
                  <th class="py-3 px-3 text-right">IVA / Imp.</th>
                  <th class="py-3 px-4 text-right">Total Factura</th>
                  <th class="py-3 px-3 text-center">Conciliación</th>
                  <th class="py-3 px-3 text-center">Estado</th>
                  <th class="sticky right-0 z-10 bg-slate-800 py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${filteredPurchases.length === 0 ? `
                  <tr>
                    <td colspan="11" class="py-12 px-4 text-center text-slate-500">
                      <div class="max-w-md mx-auto space-y-2">
                        <p class="font-bold text-slate-700 text-sm">${purchases.length ? 'No hay facturas que coincidan con los filtros.' : 'Todavía no hay facturas cargadas.'}</p>
                        <p class="text-xs text-slate-400">Hacé clic en <strong>"Subir / Leer Factura (OCR / PDF)"</strong> para cargar y verificar tus facturas de compra.</p>
                      </div>
                    </td>
                  </tr>
                ` : filteredPurchases.map(p => {
                  const stated = p.invoice_stated_total != null && p.invoice_stated_total !== '' ? Number(p.invoice_stated_total) : Number(p.total_final);
                  const diff = Number((stated - (Number(p.total_final) || 0)).toFixed(2));
                  const isConciliated = (!p.reconciliation || p.reconciliation.status === 'CONCILIADA') && Math.abs(diff) <= 0.05;

                  return `
                    <tr class="group hover:bg-slate-50 transition">
                      <td class="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">${Formatter.date(p.date)}</td>
                      <td class="py-3 px-4">
                        <span class="font-mono font-black text-blue-900 block">${escapeHtml(p.invoice_number)}</span>
                        <span class="text-[10px] font-mono text-slate-400">${escapeHtml(p.purchase_number)} · ${escapeHtml(p.payment_condition || 'Contado')}</span>
                      </td>
                      <td class="py-3 px-4">
                        <span class="font-extrabold text-slate-900 block">${escapeHtml(p.supplier_name)}</span>
                        ${p.supplier_cuit ? `<span class="text-[10px] font-mono text-slate-500">CUIT: ${escapeHtml(p.supplier_cuit)}</span>` : ''}
                      </td>
                      <td class="py-3 px-3 text-center">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold bg-blue-50 text-blue-800 border border-blue-200">
                          ${(p.items || []).length} reng.
                        </span>
                      </td>
                      <td class="py-3 px-3 text-right font-mono text-slate-700">${Formatter.money(p.subtotal_products)}</td>
                      <td class="py-3 px-3 text-right font-mono ${Number(p.discount_amount) > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}">
                        ${Number(p.discount_amount) > 0 ? `- ${Formatter.money(p.discount_amount)} (${escapeHtml(p.discount_pct || 0)}%)` : '$ 0,00'}
                      </td>
                      <td class="py-3 px-3 text-right font-mono text-slate-500">
                        ${Number(p.vat_amount) > 0 ? Formatter.money(p.vat_amount) : '<span class="text-[10px] text-slate-400">Incluido</span>'}
                      </td>
                      <td class="py-3 px-4 text-right font-mono font-black text-slate-900 text-sm">${Formatter.money(p.total_final)}</td>
                      
                      <!-- Columna de Conciliación -->
                      <td class="py-3 px-3 text-center whitespace-nowrap">
                        ${isConciliated ? `
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <i data-lucide="check" class="w-3 h-3"></i> Conciliada
                          </span>
                        ` : `
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300" title="Diferencia detectada con la factura declarada">
                            <i data-lucide="alert-triangle" class="w-3 h-3"></i> Dif: ${diff >= 0 ? '+' : ''}${Formatter.money(diff)}
                          </span>
                        `}
                      </td>

                      <td class="py-3 px-3 text-center">
                        <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${p.status === 'ANULADA' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
                          ${escapeHtml(p.status)}
                        </span>
                      </td>
                      <td class="sticky right-0 border-l border-slate-200 bg-white px-3 py-3 text-center whitespace-nowrap group-hover:bg-slate-50">
                        <div class="flex items-center justify-center gap-1">
                        <button type="button" onclick="window.comprasModule.viewCentralPurchase(${attributeArgument(p.id)})" aria-label="Ver factura" title="Ver factura" class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                          <i data-lucide="eye" aria-hidden="true" class="w-4 h-4"></i>
                        </button>
                        ${p.status !== 'ANULADA' ? `
                          <button type="button" onclick="window.comprasModule.editCentralPurchase(${attributeArgument(p.id)})" aria-label="Editar factura" title="Editar factura" class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"><i data-lucide="pencil" aria-hidden="true" class="w-4 h-4"></i></button>
                          <button type="button" onclick="window.comprasModule.cancelPurchase(${attributeArgument(p.id)})" aria-label="Eliminar factura" title="Eliminar factura" class="inline-flex h-10 w-10 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50">
                            <i data-lucide="trash-2" aria-hidden="true" class="w-4 h-4"></i>
                          </button>
                        ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Completo: Ver / Editar Factura & Rectificación Controlada -->
      <div id="purchaseDetailModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-6xl w-full p-6 shadow-2xl space-y-5 max-h-[94vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <div class="flex items-center gap-2">
              <i data-lucide="file-edit" class="w-5 h-5 text-blue-600"></i>
              <h3 class="text-base font-black text-slate-800" id="purchaseDetailTitle">Detalle y Rectificación de Factura</h3>
            </div>
            <button onclick="document.getElementById('purchaseDetailModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="purchaseDetailContent" class="space-y-5 text-xs"></div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById('comprasSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterSearchQuery = e.target.value;
        this.renderPurchasesList(container, db.getPurchases(), activeSuppliers);
        const newSearch = document.getElementById('comprasSearchInput');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
        }
      });
    }

    const fromInput = document.getElementById('comprasDateFrom');
    if (fromInput) {
      fromInput.addEventListener('change', (e) => {
        filterDateFrom = e.target.value;
        this.renderPurchasesList(container, db.getPurchases(), activeSuppliers);
      });
    }

    const toInput = document.getElementById('comprasDateTo');
    if (toInput) {
      toInput.addEventListener('change', (e) => {
        filterDateTo = e.target.value;
        this.renderPurchasesList(container, db.getPurchases(), activeSuppliers);
      });
    }

    if (window.lucide) window.lucide.createIcons();
  },

  setSupplierFilter(supplierId) {
    filterSupplierId = supplierId;
    this.renderPurchasesList(document.getElementById('app-content'), db.getPurchases(), db.getSuppliers());
  },

  clearFilters() {
    filterSupplierId = 'ALL';
    filterDateFrom = '';
    filterDateTo = '';
    filterSearchQuery = '';
    this.renderPurchasesList(document.getElementById('app-content'), db.getPurchases(), db.getSuppliers());
  },

  renderNewPurchase(container, suppliers, products) {
    purchaseItems = [];
    logisticsTotal = 0;
    distributionMethod = 'VALOR';

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('compras')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div>
              <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Nueva Compra & Recepción de Mercadería</h1>
              <p class="text-xs text-slate-500">Ingreso de factura de proveedor con distribución de flete y cálculo de Costo Caviahue.</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Columna Principal: Datos y Productos (2 cols) -->
          <div class="lg:col-span-2 space-y-4">
            <!-- Datos del Comprobante -->
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Proveedor</label>
                <select id="purchaseSupplierSelect" class="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="">Seleccionar Proveedor...</option>
                  ${suppliers.map(s => `
                    <option value="${s.id}">${s.name} (${s.city})</option>
                  `).join('')}
                </select>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">N° de Factura / Remito</label>
                <input type="text" id="purchaseInvoiceNumber" placeholder="FC-A 0001-00012345" class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha de Compra</label>
                <input type="date" id="purchaseDate" value="${new Date().toISOString().substring(0, 10)}" class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none">
              </div>
            </div>

            <!-- Flete y Gastos Logísticos Puesto en Caviahue -->
            <div class="bg-blue-50/70 p-4 rounded-xl border border-blue-200 shadow-sm space-y-3">
              <div class="flex items-center gap-2 text-blue-950 font-bold text-sm">
                <i data-lucide="truck" class="w-4 h-4 text-blue-600"></i>
                Gastos Logísticos y Flete Puesto en Caviahue
              </div>
              <p class="text-xs text-blue-800">
                Ingresá el costo total del flete o transporte hasta Caviahue para prorratearlo entre los productos y calcular el <strong>Costo Real Unitario</strong>.
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-blue-900 mb-1">Total Gastos Logísticos ($ ARS)</label>
                  <input type="number" id="purchaseLogisticsTotal" min="0" value="0" placeholder="Ej: 15000" class="w-full border border-blue-300 rounded-lg px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                </div>

                <div>
                  <label class="block text-xs font-semibold text-blue-900 mb-1">Método de Distribución</label>
                  <select id="purchaseLogisticsMethod" class="w-full border border-blue-300 rounded-lg px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="VALOR">Según Valor de los Productos (Proporcional $)</option>
                    <option value="CANTIDAD">Según Cantidad de Bultos / Unidades</option>
                    <option value="MANUAL">Manual por Producto</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Selector de Productos para la Compra -->
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div class="flex items-center justify-between mb-2">
                <label class="block text-xs font-bold text-slate-700">Agregar Productos a la Factura</label>
                <button onclick="window.app.navigate('productos', { action: 'new' })" class="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                  + Crear Producto si no existe
                </button>
              </div>

              <div class="relative mb-3">
                <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3 text-slate-400"></i>
                <input type="text" id="purchaseProductSearch" placeholder="Buscar por producto para agregar a la compra..." class="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none">
              </div>

              <div id="purchaseSearchResults" class="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
                <div class="p-3 text-center text-xs text-slate-400">
                  Buscá un producto para agregarlo al detalle
                </div>
              </div>
            </div>

            <!-- Tabla de Ítems en Compra -->
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Productos en Factura</h3>
                <span id="purchaseItemsCount" class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">0 ítems</span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 bg-white">
                    <tr>
                      <th class="py-2.5 px-3">Producto</th>
                      <th class="py-2.5 px-3">Unidad Compra</th>
                      <th class="py-2.5 px-3 text-center w-20">Cant.</th>
                      <th class="py-2.5 px-3 text-right">Costo Factura</th>
                      <th class="py-2.5 px-3 text-right">Flete Asignado</th>
                      <th class="py-2.5 px-3 text-right text-blue-700">Costo Caviahue</th>
                      <th class="py-2.5 px-3 text-right">Subtotal</th>
                      <th class="py-2.5 px-3 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody id="purchaseTableBody" class="divide-y divide-slate-100">
                    <!-- Se llena dinámicamente -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Columna Derecha: Totales y Confirmación (1 col) -->
          <div class="space-y-4">
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
              <h2 class="text-sm font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-200">
                Resumen de Compra
              </h2>

              <div class="space-y-2 text-xs">
                <div class="flex justify-between text-slate-600">
                  <span>Subtotal Mercadería</span>
                  <span id="purchaseSubtotalMercaderia" class="font-semibold text-slate-800">$ 0,00</span>
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>Gastos Logísticos (Flete)</span>
                  <span id="purchaseSummaryLogistics" class="font-semibold text-blue-600">$ 0,00</span>
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>IVA (21%)</span>
                  <span id="purchaseSummaryVat" class="font-semibold text-slate-800">$ 0,00</span>
                </div>
                <div class="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                  <span class="text-sm font-bold text-slate-800">TOTAL FINAL COMPRA</span>
                  <span id="purchaseTotalFinal" class="text-xl font-extrabold text-blue-700">$ 0,00</span>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Condición de Pago</label>
                <select id="purchasePaymentCondition" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Cuenta Corriente">Cuenta Corriente Proveedor</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Observaciones</label>
                <textarea id="purchaseNotes" rows="2" placeholder="Notas sobre transporte o recepción..." class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"></textarea>
              </div>

              <div class="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800">
                <i data-lucide="info" class="w-4 h-4 inline mr-1 text-amber-600"></i>
                Al confirmar la compra, el stock aumentará automáticamente en unidad base y se actualizará el historial de costos.
              </div>

              <button id="btnConfirmPurchase" onclick="window.comprasModule.confirmPurchase()" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2">
                <i data-lucide="check-circle" class="w-5 h-5"></i>
                Confirmar e Ingresar Stock
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.attachNewPurchaseEvents(products, suppliers);
  },

  attachNewPurchaseEvents(products, suppliers) {
    const searchInput = document.getElementById('purchaseProductSearch');
    const resultsContainer = document.getElementById('purchaseSearchResults');
    const logisticsInput = document.getElementById('purchaseLogisticsTotal');
    const logisticsMethod = document.getElementById('purchaseLogisticsMethod');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length === 0) {
          resultsContainer.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Buscá un producto...</div>';
          return;
        }

        const filtered = products.filter(p => 
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
          resultsContainer.innerHTML = '<div class="p-3 text-center text-xs text-rose-500">No se encontraron productos.</div>';
          return;
        }

        resultsContainer.innerHTML = filtered.slice(0, 8).map(p => `
          <div class="p-2 flex items-center justify-between hover:bg-blue-50/60 transition cursor-pointer" onclick="window.comprasModule.addItem('${p.id}')">
            <div>
              <div class="text-xs font-bold text-slate-800">${p.name}</div>
              <div class="text-[11px] text-slate-500">${p.sku} • Unidad Compra: ${p.purchase_unit || p.sale_unit} (Factor: ${p.conversion_factor || 1})</div>
            </div>
            <button class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold">
              + Agregar
            </button>
          </div>
        `).join('');
      });
    }

    if (logisticsInput) {
      logisticsInput.addEventListener('input', (e) => {
        logisticsTotal = Number(e.target.value) || 0;
        window.comprasModule.recalc();
      });
    }

    if (logisticsMethod) {
      logisticsMethod.addEventListener('change', (e) => {
        distributionMethod = e.target.value;
        window.comprasModule.recalc();
      });
    }

    this.renderTable();
  },


  // =========================================================================
  // MÉTODOS DE FILTRO Y ACCIONES DE FACTURA
  // =========================================================================
  // =========================================================================
  // MODAL INTERACTIVO: VER / EDITAR FACTURA & RECTIFICACIÓN CONTROLADA
  // =========================================================================
  openEditInvoiceModal(purchaseId) {
    console.log('Abriendo modal de factura ID:', purchaseId);
    const purchases = db.getPurchases();
    const p = purchases.find(item => String(item.id) === String(purchaseId) || String(item.purchase_number) === String(purchaseId));
    if (!p) {
      console.warn('Factura no encontrada:', purchaseId);
      alert('Comprobante no encontrado.');
      return;
    }

    // Inicializar estado de edición local para este comprobante
    window._editingPurchase = JSON.parse(JSON.stringify(p));
    const editPur = window._editingPurchase;

    // Asegurar estructura de ítems con empaques
    editPur.items = (editPur.items || []).map(it => {
      const rawDesc = String(it.invoice_description || it.product_name || '').trim();
      const qty = Number(it.boxes_count ?? it.quantity) || 1;
      const price = Number(it.unit_price_original ?? it.unit_price ?? it.unit_invoice_cost) || 0;
      const parsed = PackagingEngine.parse(rawDesc, qty, price, it.line_total || 0);

      return {
        ...it,
        code: String(it.code || it.sku || '').trim(),
        commercial_name: it.commercial_name || it.product_name || parsed.cleanCommercialName,
        invoice_description: rawDesc,
        boxes_count: Number(it.boxes_count ?? it.quantity) || 1,
        units_per_box: Number(it.units_per_box ?? parsed.unitsPerBox) || 1,
        pricing_mode: it.pricing_mode || parsed.pricingMode || 'PER_BOX',
        inventory_unit: it.inventory_unit || parsed.inventoryUnit || 'unidad',
        unit_price: price,
        discount_pct: Number(it.discount_pct ?? editPur.discount_pct) || 0
      };
    });

    let modal = document.getElementById('purchaseDetailModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'purchaseDetailModal';
      modal.className = 'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-6xl w-full p-6 shadow-2xl space-y-5 max-h-[94vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <div class="flex items-center gap-2">
              <i data-lucide="file-edit" class="w-5 h-5 text-blue-600"></i>
              <h3 class="text-base font-black text-slate-800" id="purchaseDetailTitle">Detalle y Rectificación de Factura</h3>
            </div>
            <button onclick="window.comprasModule.closeEditModal()" class="text-slate-400 hover:text-slate-600 p-1">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="purchaseDetailContent" class="space-y-5 text-xs"></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const title = document.getElementById('purchaseDetailTitle');
    if (title) {
      title.innerHTML = `
        <div class="flex items-center gap-2">
          <span>Factura <strong class="font-mono text-blue-900">${editPur.invoice_number}</strong> — ${editPur.supplier_name}</span>
          ${editPur.rectified ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800">RECTIFICADA</span>' : ''}
        </div>
      `;
    }

    this.renderEditInvoiceContent();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
  },

  closeEditModal() {
    const modal = document.getElementById('purchaseDetailModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  },

  renderEditInvoiceContent() {
    const content = document.getElementById('purchaseDetailContent');
    const editPur = window._editingPurchase;
    if (!content || !editPur) return;

    const globalDiscPct = Number(editPur.discount_pct) || 0;
    const vatRate = editPur.vat_included === false ? (Number(editPur.vat_rate) || 21) : 0;

    let sumBruto = 0;
    let sumNetoSinIvaAdicional = 0;

    const enrichedRows = editPur.items.map((it, idx) => {
      const boxesCount = Number(it.boxes_count) || 1;
      const unitsPerBox = Number(it.units_per_box) || 1;
      const pricingMode = it.pricing_mode || 'PER_BOX';
      const rawPrice = Number(it.unit_price) || 0;
      const itemDisc = Number(it.discount_pct !== undefined ? it.discount_pct : globalDiscPct) || 0;

      const calc = PackagingEngine.calculate({
        boxesCount,
        unitsPerBox,
        pricingMode,
        rawUnitPrice: rawPrice,
        discountPct: itemDisc
      });

      it.quantity_base = calc.saleableUnits;
      it.line_total = calc.lineNetTotal;

      sumBruto += calc.lineSubtotalBruto;
      sumNetoSinIvaAdicional += calc.lineNetTotal;

      return {
        ...it,
        idx,
        calc
      };
    });

    const discountAmount = Number((sumBruto - sumNetoSinIvaAdicional).toFixed(2));
    const vatAmount = editPur.vat_included === false
      ? Number((sumNetoSinIvaAdicional * (vatRate / 100)).toFixed(2))
      : 0;
    const logisticsAmount = Number(editPur.total_logistics) || 0;
    const calculatedTotal = Number(((editPur.vat_included === false ? sumNetoSinIvaAdicional + vatAmount : sumNetoSinIvaAdicional) + logisticsAmount).toFixed(2));
    const statedTotal = Number(editPur.invoice_stated_total !== undefined ? editPur.invoice_stated_total : calculatedTotal);
    const reconciliation = PackagingEngine.reconcile({ statedTotal, calculatedTotal, tolerance: 0.05 });

    // Guardar totales temporales calculados
    editPur._tempCalculated = {
      sumBruto,
      discountAmount,
      sumNetoSinIvaAdicional,
      vatAmount,
      calculatedTotal,
      statedTotal,
      reconciliation
    };

    content.innerHTML = `
      <!-- Datos Principales del Comprobante -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div class="md:col-span-4 space-y-1">
          <span class="text-[10px] font-bold uppercase text-slate-400">Proveedor</span>
          <div class="font-extrabold text-slate-900 text-sm">${editPur.supplier_name}</div>
          <div class="text-[11px] font-mono text-slate-500">${editPur.supplier_cuit ? `CUIT: ${editPur.supplier_cuit}` : ''}</div>
          <div class="text-[10px] text-slate-400">ID Interno: ${editPur.purchase_number}</div>
        </div>

        <div class="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">N° Factura</label>
            <input type="text" id="edit-invoice-number" value="${editPur.invoice_number || ''}" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-blue-900 text-xs">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Fecha</label>
            <input type="date" id="edit-invoice-date" value="${editPur.date || ''}" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Condición Pago</label>
            <input type="text" id="edit-payment-condition" value="${editPur.payment_condition || 'Contado'}" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Descuento Global (%)</label>
            <input type="number" step="0.01" id="edit-discount-pct" value="${editPur.discount_pct || 0}" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-amber-700">
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Modo de IVA</label>
            <select id="edit-vat-mode" class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700">
              <option value="INCLUDED" ${editPur.vat_included !== false ? 'selected' : ''}>IVA Incluido (Fact. B)</option>
              <option value="ADD_21" ${editPur.vat_included === false ? 'selected' : ''}>Sumar +21% IVA al Neto</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Total Impreso Factura ($)</label>
            <input type="number" step="0.01" id="edit-stated-total" value="${statedTotal}" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-purple-900" title="Monto impreso al pie de la factura física">
          </div>
          <div class="sm:col-span-2">
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Motivo de Rectificación</label>
            <input type="text" id="edit-rect-reason" placeholder="Ej: Corrección de cantidades y conciliación de factura" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800">
          </div>
        </div>
      </div>

      <!-- Tabla Editable de Artículos de la Factura -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="package-check" class="w-4 h-4 text-blue-600"></i>
            Renglones de la Factura & Desglose de Unidades (${enrichedRows.length} ítems)
          </h4>
          <button id="btn-add-edit-row" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Agregar Renglón
          </button>
        </div>

        <div class="border border-slate-200 rounded-xl overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-800 font-extrabold text-white uppercase text-[10px] tracking-wider">
              <tr>
                <th class="py-2.5 px-2 text-center w-8">#</th>
                <th class="py-2.5 px-2 w-24">Código</th>
                <th class="py-2.5 px-3 min-w-[200px]">Nombre Comercial</th>
                <th class="py-2.5 px-2 text-center w-16" title="Cantidad de bultos/cajas facturados">Cajas</th>
                <th class="py-2.5 px-2 text-center w-16" title="Unidades por caja">Unid/Caja</th>
                <th class="py-2.5 px-2 text-center w-28" title="Stock real a ingresar por unidades individuales">Stock Vendible</th>
                <th class="py-2.5 px-2 text-center w-28">Precio Es</th>
                <th class="py-2.5 px-2 text-right w-24">Precio Fact.</th>
                <th class="py-2.5 px-2 text-right w-24" title="Costo efectivo por cada unidad de venta">Costo Unit.</th>
                <th class="py-2.5 px-2 text-center w-16">Desc %</th>
                <th class="py-2.5 px-3 text-right w-28">Total Renglón</th>
                <th class="py-2.5 px-1 text-center w-8"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${enrichedRows.map((row, idx) => `
                <tr class="hover:bg-slate-50 transition">
                  <td class="py-2 px-2 text-center text-slate-400 font-mono font-bold">${idx + 1}</td>
                  
                  <td class="py-2 px-2">
                    <input type="text" data-idx="${idx}" data-field="code" value="${row.code || ''}" class="edit-row-input w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-blue-900">
                  </td>

                  <td class="py-2 px-3">
                    <input type="text" data-idx="${idx}" data-field="commercial_name" value="${row.commercial_name || ''}" class="edit-row-input w-full px-2 py-1 bg-white border border-slate-300 rounded font-bold text-slate-900 text-xs mb-0.5">
                    <div class="text-[10px] text-slate-400 truncate max-w-xs">${row.invoice_description || ''}</div>
                  </td>

                  <td class="py-2 px-2">
                    <input type="number" min="1" step="1" data-idx="${idx}" data-field="boxes_count" value="${row.boxes_count}" class="edit-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded text-center font-bold text-slate-900 text-xs">
                  </td>

                  <td class="py-2 px-2">
                    <input type="number" min="1" step="1" data-idx="${idx}" data-field="units_per_box" value="${row.units_per_box}" class="edit-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded text-center font-bold text-blue-700 text-xs">
                  </td>

                  <td class="py-2 px-2 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black ${row.units_per_box > 1 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-800'}">
                      = ${row.calc.saleableUnits} ${row.inventory_unit || 'u.'}
                    </span>
                  </td>

                  <td class="py-2 px-2">
                    <select data-idx="${idx}" data-field="pricing_mode" class="edit-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded text-[11px] font-bold text-slate-700">
                      <option value="PER_BOX" ${row.pricing_mode === 'PER_BOX' ? 'selected' : ''}>Por Caja</option>
                      <option value="PER_UNIT" ${row.pricing_mode === 'PER_UNIT' ? 'selected' : ''}>Por Unidad</option>
                    </select>
                  </td>

                  <td class="py-2 px-2">
                    <input type="number" step="0.01" data-idx="${idx}" data-field="unit_price" value="${row.unit_price}" class="edit-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded font-mono text-right text-slate-900 font-bold text-xs">
                  </td>

                  <td class="py-2 px-2 text-right">
                    <span class="font-mono font-bold text-slate-800 text-xs block">${Formatter.money(row.calc.netCostPerUnit)}</span>
                    <span class="text-[9px] text-slate-400">/${row.inventory_unit || 'u.'}</span>
                  </td>

                  <td class="py-2 px-2">
                    <input type="number" step="0.01" data-idx="${idx}" data-field="discount_pct" value="${row.discount_pct || 0}" class="edit-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded font-mono text-center text-amber-700 font-bold text-xs">
                  </td>

                  <td class="py-2 px-3 text-right font-mono font-black text-slate-900 text-xs">
                    ${Formatter.money(row.calc.lineNetTotal)}
                  </td>

                  <td class="py-2 px-1 text-center">
                    <button data-idx="${idx}" class="btn-remove-edit-row text-slate-400 hover:text-red-600 p-1 rounded transition" title="Quitar renglón">
                      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Resumen Financiero y Conciliación -->
      <div class="bg-slate-900 text-white p-5 rounded-2xl space-y-4">
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Subtotal Bruto</span>
            <span class="text-sm font-black text-slate-100">${Formatter.money(sumBruto)}</span>
          </div>
          <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Descuento</span>
            <span class="text-sm font-black text-amber-400">- ${Formatter.money(discountAmount)}</span>
          </div>
          <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Subtotal Neto</span>
            <span class="text-sm font-black text-slate-100">${Formatter.money(sumNetoSinIvaAdicional)}</span>
          </div>
          <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">${editPur.vat_included === false ? 'IVA (+21%)' : 'IVA Incluido'}</span>
            <span class="text-sm font-black text-cyan-300">
              ${Formatter.money(editPur.vat_included === false ? vatAmount : (editPur.vat_content_ley27743 || 0))}
            </span>
          </div>
          <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Factura Leído</span>
            <span class="text-sm font-black text-purple-300 font-mono">${Formatter.money(statedTotal)}</span>
          </div>
          <div class="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Calculado</span>
            <span class="text-sm font-black text-emerald-400 font-mono">${Formatter.money(calculatedTotal)}</span>
          </div>
          <div class="p-2.5 rounded-xl border ${Math.abs(reconciliation.diff) <= 0.05 ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-red-950/60 border-red-500/40 text-red-300'}">
            <span class="block text-[10px] font-black uppercase tracking-wider">Diferencia</span>
            <span class="text-sm font-black font-mono">${reconciliation.diff >= 0 ? '+' : ''}${Formatter.money(reconciliation.diff)}</span>
          </div>
        </div>

        ${reconciliation.status === 'DIFERENCIA' ? `
          <div class="bg-amber-500/20 border border-amber-500/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200">
            <div class="flex items-center gap-2">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-400 shrink-0"></i>
              <span class="text-xs">
                <strong>Aviso de Conciliación:</strong> La factura declara <strong>${Formatter.money(statedTotal)}</strong> pero los renglones suman <strong>${Formatter.money(calculatedTotal)}</strong> (Diferencia: <strong>${Formatter.money(reconciliation.diff)}</strong>).
                <span class="block text-[11px] text-amber-300 mt-0.5">Podés conciliarla aceptando el total calculado o guardarla directamente asumiendo esta diferencia.</span>
              </span>
            </div>
            <button id="btn-modal-force-reconcile" class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 transition" title="Ajusta el total declarado al calculado para conciliar a $0,00">
              Aceptar Total Calculado
            </button>
          </div>
        ` : `
          <div class="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-2.5 flex items-center gap-2 text-emerald-200 text-xs">
            <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 shrink-0"></i>
            <span>Factura conciliada con los renglones cargados.</span>
          </div>
        `}
      </div>

      <!-- Historial de Rectificaciones Previas si existen -->
      ${editPur.rectification_history && editPur.rectification_history.length > 0 ? `
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <span class="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">Historial de Rectificaciones (${editPur.rectification_history.length})</span>
          <div class="space-y-1 max-h-32 overflow-y-auto">
            ${editPur.rectification_history.map((hist, hIdx) => `
              <div class="text-[11px] text-slate-600 flex items-center justify-between border-b border-slate-100 py-1">
                <span><strong>#${hIdx + 1}</strong> ${Formatter.date(hist.rectified_at)} — ${hist.reason} (${hist.rectified_by})</span>
                <span class="font-mono text-slate-800">Total anterior: ${Formatter.money(hist.total_final)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Barra de Acciones del Modal -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
        <div>
          ${editPur.status !== 'ANULADA' ? `
            <button onclick="window.comprasModule.cancelPurchase('${editPur.id}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
              <i data-lucide="trash-2" class="w-4 h-4"></i> Anular Factura
            </button>
          ` : '<span class="text-rose-600 font-bold text-xs">Factura Anulada</span>'}
        </div>

        <div class="flex items-center gap-2">
          <button onclick="window.comprasModule.closeEditModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition">
            Cerrar
          </button>
          <button id="btn-save-rectification" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition flex items-center gap-2">
            <i data-lucide="save" class="w-4 h-4"></i> Guardar Cambios en Factura
          </button>
        </div>
      </div>
    `;

    this.bindEditModalEvents();
  },

  bindEditModalEvents() {
    const editPur = window._editingPurchase;
    if (!editPur) return;

    // Inputs de renglón
    document.querySelectorAll('.edit-row-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.getAttribute('data-idx'));
        const field = inp.getAttribute('data-field');
        if (!editPur.items[idx]) return;

        if (field === 'boxes_count' || field === 'units_per_box' || field === 'unit_price' || field === 'discount_pct') {
          editPur.items[idx][field] = Number(inp.value) || 0;
        } else {
          editPur.items[idx][field] = inp.value;
        }

        this.renderEditInvoiceContent();
      });
    });

    // Inputs del encabezado
    ['edit-invoice-number', 'edit-invoice-date', 'edit-payment-condition', 'edit-discount-pct', 'edit-vat-mode', 'edit-stated-total'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          if (id === 'edit-invoice-number') editPur.invoice_number = el.value;
          if (id === 'edit-invoice-date') editPur.date = el.value;
          if (id === 'edit-payment-condition') editPur.payment_condition = el.value;
          if (id === 'edit-discount-pct') {
            editPur.discount_pct = Number(el.value) || 0;
            editPur.items.forEach(it => { it.discount_pct = editPur.discount_pct; });
          }
          if (id === 'edit-vat-mode') editPur.vat_included = el.value !== 'ADD_21';
          if (id === 'edit-stated-total') editPur.invoice_stated_total = Number(el.value) || 0;
          this.renderEditInvoiceContent();
        });
      }
    });

    // Quitar renglón
    document.querySelectorAll('.btn-remove-edit-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        if (editPur.items.length > 1) {
          editPur.items.splice(idx, 1);
          this.renderEditInvoiceContent();
        }
      });
    });

    // Agregar renglón
    const btnAdd = document.getElementById('btn-add-edit-row');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        editPur.items.push({
          code: '',
          commercial_name: '',
          invoice_description: '',
          boxes_count: 1,
          units_per_box: 1,
          pricing_mode: 'PER_BOX',
          inventory_unit: 'unidad',
          unit_price: 0,
          discount_pct: Number(editPur.discount_pct) || 0
        });
        this.renderEditInvoiceContent();
      });
    }

    // Aceptar total calculado
    const btnForce = document.getElementById('btn-modal-force-reconcile');
    if (btnForce) {
      btnForce.addEventListener('click', () => {
        if (editPur._tempCalculated) {
          editPur.invoice_stated_total = editPur._tempCalculated.calculatedTotal;
          this.renderEditInvoiceContent();
        }
      });
    }

    // Guardar rectificación controlada
    const btnSave = document.getElementById('btn-save-rectification');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveRectification());
    }

    if (window.lucide) window.lucide.createIcons();
  },

  saveRectification() {
    const editPur = window._editingPurchase;
    if (!editPur) return;

    const reason = document.getElementById('edit-rect-reason')?.value.trim() || 'Modificación y conciliación de factura';
    const temp = editPur._tempCalculated || {};

    const stated = editPur.invoice_stated_total !== undefined ? Number(editPur.invoice_stated_total) : temp.calculatedTotal;
    const calc = temp.calculatedTotal || 0;
    const diff = Number((stated - calc).toFixed(2));
    const isExact = Math.abs(diff) <= 0.05;

    const rectData = {
      invoice_number: editPur.invoice_number,
      date: editPur.date,
      payment_condition: editPur.payment_condition,
      discount_pct: editPur.discount_pct,
      vat_included: editPur.vat_included,
      vat_rate: editPur.vat_included === false ? 21 : 0,
      subtotal_bruto: temp.sumBruto,
      discount_amount: temp.discountAmount,
      subtotal_products: temp.sumNetoSinIvaAdicional,
      vat_amount: temp.vatAmount,
      total_final: temp.calculatedTotal,
      invoice_stated_total: stated,
      reconciliation: {
        status: isExact ? 'CONCILIADA' : 'DIFERENCIA_ACEPTADA',
        diff,
        isExact,
        user_acknowledged: true,
        message: isExact ? 'Factura conciliada exacta' : `Diferencia de $${Math.abs(diff).toFixed(2)} aceptada por el usuario`
      },
      items: editPur.items.map(it => ({
        product_id: it.product_id,
        code: it.code,
        product_name: it.commercial_name || it.product_name,
        commercial_name: it.commercial_name || it.product_name,
        invoice_description: it.invoice_description,
        boxes_count: Number(it.boxes_count) || 1,
        units_per_box: Number(it.units_per_box) || 1,
        pricing_mode: it.pricing_mode || 'PER_BOX',
        inventory_unit: it.inventory_unit || 'unidad',
        quantity: Number(it.boxes_count) || 1,
        quantity_base: (Number(it.boxes_count) || 1) * (Number(it.units_per_box) || 1),
        unit_price_bruto: Number(it.unit_price) || 0,
        unit_price: Number(it.unit_price) || 0,
        discount_pct: Number(it.discount_pct) || 0,
        subtotal: it.line_total || 0,
        line_total: it.line_total || 0
      }))
    };

    try {
      db.rectifyPurchase(editPur.id, rectData, reason);
      this.closeEditModal();
      alert(`¡Factura ${editPur.invoice_number} guardada con éxito! Stock y costos actualizados.`);
      ComprasView.render(document.getElementById('app-content'));
    } catch (err) {
      console.error(err);
      alert(`Error al guardar cambios de factura: ${err.message}`);
    }
  },

  showPurchaseDetail(purchaseId) {
    this.openEditInvoiceModal(purchaseId);
  },

  // =========================================================================
  // MÉTODOS DE NUEVA COMPRA MANUAL
  // =========================================================================
  addItem(productId) {
    const prod = db.getProduct(productId);
    if (!prod) return;

    const existing = purchaseItems.find(it => it.product_id === productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      purchaseItems.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        unit_name: prod.purchase_unit || prod.sale_unit,
        factor_to_base: prod.conversion_factor || 1,
        quantity: 1,
        unit_invoice_cost: prod.purchase_cost || prod.caviahue_cost || 0,
        allocated_logistics: 0,
        unit_caviahue_cost: prod.caviahue_cost || 0
      });
    }

    this.renderTable();
  },

  updateQty(index, qty) {
    const q = Number(qty);
    if (q > 0 && purchaseItems[index]) {
      purchaseItems[index].quantity = q;
      this.recalc();
      this.renderTable();
    }
  },

  updateCost(index, cost) {
    const c = Number(cost);
    if (c >= 0 && purchaseItems[index]) {
      purchaseItems[index].unit_invoice_cost = c;
      this.recalc();
      this.renderTable();
    }
  },

  removeItem(index) {
    purchaseItems.splice(index, 1);
    this.recalc();
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('purchaseItemsTable');
    if (!tbody) return;

    if (purchaseItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">No hay productos agregados a la orden.</td></tr>`;
      this.updateSummary();
      return;
    }

    tbody.innerHTML = purchaseItems.map((item, idx) => {
      const subtotal = item.quantity * item.unit_invoice_cost;
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-3 font-mono font-bold text-slate-700">${item.sku || '-'}</td>
          <td class="py-3 px-3">
            <span class="font-bold text-slate-900 block">${item.product_name}</span>
            <span class="text-[10px] text-slate-400">Unidad de compra: ${item.unit_name} (x${item.factor_to_base} base)</span>
          </td>
          <td class="py-3 px-3 text-center">
            <input type="number" min="1" value="${item.quantity}" onchange="window.comprasModule.updateQty(${idx}, this.value)" class="w-16 px-2 py-1 border border-slate-300 rounded text-center text-xs font-bold">
          </td>
          <td class="py-3 px-3 text-right">
            <input type="number" min="0" value="${item.unit_invoice_cost}" onchange="window.comprasModule.updateCost(${idx}, this.value)" class="w-24 px-2 py-1 border border-slate-300 rounded text-right text-xs font-medium">
          </td>
          <td class="py-3 px-3 text-right font-mono font-semibold text-slate-900">${Formatter.money(subtotal)}</td>
          <td class="py-3 px-3 text-right font-mono text-blue-700">${Formatter.money(item.allocated_logistics || 0)}</td>
          <td class="py-3 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/50">${Formatter.money(item.unit_caviahue_cost || 0)}</td>
          <td class="py-3 px-2 text-center">
            <button onclick="window.comprasModule.removeItem(${idx})" class="text-rose-500 hover:text-rose-700 p-1">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    this.updateSummary();
  },

  recalc() {
    purchaseItems = LogisticsCostDistributor.distribute(purchaseItems, logisticsTotal, distributionMethod);
    this.updateSummary();
  },

  updateSummary() {
    const subtotal = purchaseItems.reduce((acc, it) => acc + (it.quantity * it.unit_invoice_cost), 0);
    const total = subtotal + logisticsTotal;

    const elSub = document.getElementById('summarySubtotal');
    const elLog = document.getElementById('summaryLogistics');
    const elTot = document.getElementById('summaryTotal');

    if (elSub) elSub.textContent = Formatter.money(subtotal);
    if (elLog) elLog.textContent = Formatter.money(logisticsTotal);
    if (elTot) elTot.textContent = Formatter.money(total);
  },

  confirmPurchase() {
    if (purchaseItems.length === 0) {
      alert('Debés agregar al menos un producto a la compra.');
      return;
    }
    if (!selectedSupplier) {
      alert('Seleccioná el proveedor de la compra.');
      return;
    }
    const invNum = document.getElementById('inputInvoiceNumber')?.value.trim();
    if (!invNum) {
      alert('Ingresá el número de factura o remito.');
      return;
    }

    try {
      const pur = db.createPurchase({
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.name,
        invoice_number: invNum,
        date: document.getElementById('inputInvoiceDate')?.value || new Date().toISOString().substring(0, 10),
        payment_condition: document.getElementById('inputPaymentCondition')?.value || 'Contado',
        total_logistics: logisticsTotal,
        logistics_distribution_method: distributionMethod,
        items: purchaseItems.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          code: it.sku,
          quantity: it.quantity,
          boxes_count: it.quantity,
          units_per_box: it.factor_to_base || 1,
          pricing_mode: 'PER_BOX',
          unit_price: it.unit_invoice_cost,
          allocated_logistics: it.allocated_logistics,
          unit_caviahue_cost: it.unit_caviahue_cost
        }))
      });

      alert(`¡Compra ${pur.purchase_number} registrada correctamente! El stock fue actualizado.`);
      window.app.navigate('compras');
    } catch (e) {
      alert(`Error al registrar compra: ${e.message}`);
    }
  },

  async centralPurchaseRpc(action,id,changes={}) {
    return this.callPurchaseRpc('stayclean_staff_manage_purchase',{p_purchase_id:id,p_action:action,p_changes:changes});
  },

  async callPurchaseRpc(name, args) {
    const {getAdminSession}=await import('../supabase_admin.js');
    const {STAYCLEAN_SUPABASE_URL:base,STAYCLEAN_PUBLISHABLE_KEY:key}=await import('../supabase_public.js');
    const token=getAdminSession()?.access_token;
    if(!token)throw Error('Iniciá sesión nuevamente en CleanSur');
    const response=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.message||'No se pudo guardar en Supabase');
    return result;
  },

  async refreshCentralPurchases() {
    const {readCentral}=await import('../supabase_erp_adapter.js');
    const [purchases,products,movements]=await Promise.all(['purchases','products','inventory_movements'].map(t=>readCentral(t,{order:'id.asc',limit:10000})));
    db.centralSetTable('purchases',purchases);db.centralSetTable('products',products);db.centralSetTable('inventory_movements',movements);
    if (window.app?.currentRoute === 'compras') window.app.navigate('compras', {action:'list'});
  },

  async reloadAfterPurchaseChange() {
    try {
      await this.refreshCentralPurchases();
    } catch (error) {
      console.error('Cambio guardado. No se pudo actualizar la vista.', error);
      alert('El cambio quedó guardado en Supabase. Volvé a ingresar para actualizar la vista.');
    }
  },

  editPurchaseAromas(purchase, index, container, button) {
    const line = purchase.items[index];
    const previous = Array.isArray(line.aromas) ? line.aromas : [];
    const quantity = Number(line.quantity_base);
    const form = document.createElement('form');
    form.className = 'mt-4 space-y-3 rounded-lg border border-slate-200 p-3';
    form.innerHTML = `
      <h3 class="font-bold">${escapeHtml(line.product_name || 'Desinfectante SYS')}</h3>
      <div data-aromas class="space-y-2"></div>
      <p data-balance class="text-sm" aria-live="polite"></p>
      <p data-error class="text-sm text-rose-700" role="alert"></p>
      <div class="flex flex-wrap gap-3">
        <button type="button" data-add class="text-blue-700 font-semibold">+ Agregar aroma</button>
        <button type="submit" class="rounded bg-blue-700 px-3 py-1.5 text-white">Guardar aromas</button>
        <button type="button" data-cancel>Cancelar</button>
      </div>`;
    container.replaceChildren(form);
    const list = form.querySelector('[data-aromas]');
    const balance = form.querySelector('[data-balance]');
    const error = form.querySelector('[data-error]');
    const submit = form.querySelector('[type="submit"]');
    const read = () => Array.from(list.children, row => ({
      name: row.querySelector('input[type="text"]').value.trim(),
      quantity: Number(row.querySelector('input[type="number"]').value)
    }));
    const updateBalance = () => {
      const assigned = read().reduce((total, entry) => total + entry.quantity, 0);
      balance.textContent = assigned > quantity
        ? `El reparto supera lo recibido por ${assigned - quantity} unidades.`
        : `${quantity - assigned} de ${quantity} unidades sin identificar.`;
      return assigned;
    };
    const addRow = ({name = '', quantity: count = 1} = {}) => {
      const row = document.createElement('div');
      row.className = 'flex flex-wrap items-center gap-2';
      row.innerHTML = `
        <input type="text" aria-label="Aroma" placeholder="Aroma" required maxlength="80" class="rounded border border-slate-300 px-2 py-1">
        <input type="number" aria-label="Unidades" required min="1" step="1" class="w-24 rounded border border-slate-300 px-2 py-1">
        <button type="button" class="text-rose-700">Quitar</button>`;
      const [input, units] = row.querySelectorAll('input');
      input.value = name;
      units.value = count;
      row.querySelector('button').onclick = () => { row.remove(); updateBalance(); };
      list.append(row);
      return input;
    };
    previous.forEach(addRow);
    updateBalance();
    form.oninput = updateBalance;
    form.querySelector('[data-add]').onclick = () => { addRow().focus(); updateBalance(); };
    form.querySelector('[data-cancel]').onclick = () => { form.remove(); button.focus(); };
    form.onsubmit = async event => {
      event.preventDefault();
      error.textContent = '';
      if (updateBalance() > quantity) {
        error.textContent = 'Revisá las cantidades antes de guardar.';
        return;
      }
      const aromas = read();
      const controls = Array.from(form.elements);
      controls.forEach(control => { control.disabled = true; });
      container.closest('#centralPurchaseDetailModal').querySelectorAll('[data-edit-aromas]')
        .forEach(control => { control.disabled = true; });
      try {
        line.aromas = await this.callPurchaseRpc('stayclean_staff_set_purchase_aromas', {
          p_purchase_id: purchase.id, p_line_index: index, p_product_id: line.product_id,
          p_quantity: quantity, p_previous: previous, p_aromas: aromas
        });
        container.closest('#centralPurchaseDetailModal').remove();
        await this.reloadAfterPurchaseChange();
        this.viewCentralPurchase(purchase.id);
      } catch (failure) {
        error.textContent = failure.message;
      } finally {
        controls.forEach(control => { control.disabled = false; });
        container.closest('#centralPurchaseDetailModal')?.querySelectorAll('[data-edit-aromas]')
          .forEach(control => { control.disabled = false; });
      }
    };
    if (previous.length) submit.focus();
    else form.querySelector('[data-add]').focus();
  },

  viewCentralPurchase(id) {
    const p=db.getPurchases().find(p=>String(p.id)===String(id));
    if(!p)return alert('Comprobante no encontrado');
    const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const modal=document.createElement('div');
    modal.id='centralPurchaseDetailModal';
    modal.className='fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-4';
    const sysIds = new Set(db.getProducts()
      .filter(product => ['2000107', '2000086'].includes(String(product.sku)))
      .map(product => product.id));
    const aromaCell = (item, index) => {
      if (!sysIds.has(item.product_id) || !Number.isInteger(Number(item.quantity_base))) return '';
      const aromas = Array.isArray(item.aromas) ? item.aromas : [];
      const detail = aromas.map(entry => `${entry.name} × ${entry.quantity}`).join(' · ');
      return `<div class="text-xs text-slate-600">${escapeHtml(detail || 'Aromas sin identificar')}</div>
        ${['RECIBIDA', 'CONFIRMADA'].includes(p.status) ? `<button type="button" data-edit-aromas="${index}" class="font-semibold text-blue-700">Editar aromas</button>` : ''}`;
    };
    modal.innerHTML=`<div class="bg-white rounded-xl shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-auto">
      <div class="flex justify-between items-center mb-4"><h2 class="font-bold text-xl">Comprobante ${esc(p.invoice_number)}</h2><button class="close-purchase-detail text-xl" aria-label="Cerrar">✕</button></div>
      <p><b>Proveedor:</b> ${esc(p.supplier_name)} · <b>Fecha:</b> ${esc(p.date)} · <b>Estado:</b> ${esc(p.status)}</p>
      <p class="mt-2"><b>Total:</b> ${Formatter.money(p.total_final)}</p>
      <div class="overflow-x-auto mt-4"><table class="w-full text-xs"><thead><tr class="bg-slate-100"><th class="p-2 text-left">SKU</th><th class="p-2 text-left">Producto</th><th class="p-2 text-right">Unidades</th><th class="p-2 text-right">Importe</th></tr></thead>
      <tbody>${(p.items||[]).map((it,index)=>`<tr class="border-b"><td class="p-2">${esc(it.code||it.sku)}</td><td class="p-2">${esc(it.product_name||it.commercial_name||it.description)}${aromaCell(it,index)}</td><td class="p-2 text-right">${esc(it.quantity_base??it.quantity??'')}</td><td class="p-2 text-right">${Formatter.money(it.line_total??it.subtotal??0)}</td></tr>`).join('')}</tbody></table></div>
      <div data-aroma-editor></div>
      <p class="text-xs text-slate-500 mt-4">Detalle registrado en Supabase. El archivo original solo puede visualizarse cuando esté adjuntado al comprobante.</p></div>`;
    modal.querySelectorAll('[data-edit-aromas]').forEach(button => {
      button.onclick = () => this.editPurchaseAromas(p, Number(button.dataset.editAromas), modal.querySelector('[data-aroma-editor]'), button);
    });
    modal.querySelector('.close-purchase-detail').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
    document.body.append(modal);
  },

  async editCentralPurchase(id) {
    if(!window.app?.centralReadOnly)return this.openEditInvoiceModal(id);
    const p=db.getPurchases().find(p=>String(p.id)===String(id));
    if(!p)return alert('Comprobante no encontrado');
    window.app.navigate('compras', {action:'ocr', editingPurchase:p});
  },

  async cancelPurchase(purchaseId) {
    if(!window.app?.centralReadOnly) {
      alert('La anulación requiere conexión a Supabase para preservar el inventario.');return;
    }
    const p=db.getPurchases().find(p=>String(p.id)===String(purchaseId));
    if(!p)return alert('Compra no encontrada');
    if(!confirm('¿Eliminar/anular '+p.invoice_number+'? Se intentará revertir su stock y conservar el historial.'))return;
    const reason=prompt('Motivo de eliminación/anulación:');
    if(reason===null)return;
    if(reason.trim().length<8)return alert('Ingresá un motivo de al menos 8 caracteres');
    try{await this.centralPurchaseRpc('ANULAR',purchaseId,{reason});await this.reloadAfterPurchaseChange();alert('Compra anulada en Supabase y stock revertido.');}
    catch(err){alert('No se pudo anular: '+err.message);}
  }
};

// Exponer siempre ComprasView en window.comprasModule
window.comprasModule = ComprasView;
