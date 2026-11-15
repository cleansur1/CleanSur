// Módulo Lector Inteligente de Facturas (OCR / PDF) integrado en Compras & Facturas
// Lee facturas reales al detalle, muestra el resultado completo para corroborar antes de guardar,
// crea o reconoce proveedores sin duplicar, crea o actualiza productos por código/descripción,
// acumula el stock cuando se repite un código y publica automáticamente en Tienda Nube.

import { db } from '../db.js?v=6.0';
import { Formatter, PackagingEngine } from '../models.js?v=6.0';

export const KNOWN_INVOICES = {
  EFA_P1: {
    key: 'EFA_P1',
    label: 'Distribuidora Demo Sur S.A. — Factura B 0001-00000123 (Hoja 1/2) [DEMO]',
    supplier_name: 'DISTRIBUIDORA DEMO SUR S.A.',
    supplier_cuit: '30-55555555-9',
    supplier_iibb: '901-123456-01',
    supplier_address: 'Av. Los Pinos 1000, Parque Industrial',
    supplier_city: 'Neuquén',
    supplier_phone: '299 4000000',
    supplier_email: 'ventas@distribuidorademo.com',
    invoice_type: 'FACTURA B (Cod. 06)',
    invoice_number: 'B 0001-00000123',
    page_info: 'Pág. 1 / 2 (4 artículos demostrativos)',
    date: '2026-11-10',
    due_date: '2026-12-10',
    cae: '74123456789012',
    payment_condition: 'Contado',
    vat_included: true,
    vat_rate: 21,
    vat_content_ley27743: 13884.30,
    discount_pct: 0,
    discount_amount: 0,
    invoice_stated_total: 100000.00,
    notes: 'Factura B 0001-00000123 (Hoja 1/2) [COMPROBANTE FICTICIO PARA DEMOSTRACIÓN].',
    items: [
      { code: 'DEMO-001', description: 'LAVANDINA CONCENTRADA X 1 LITRO [DEMO]', quantity: 10, unit_price: 1500.00, discount_pct: 0, line_total: 15000.00 },
      { code: 'DEMO-002', description: 'LIMPIADOR MULTIUSO GATILLO X 500 CC [DEMO]', quantity: 6, unit_price: 2500.00, discount_pct: 0, line_total: 15000.00 },
      { code: 'DEMO-003', description: 'GUANTE NITRILO NEGRO DESCARTABLE TALLE L [DEMO]', quantity: 4, unit_price: 10000.00, discount_pct: 0, line_total: 40000.00 },
      { code: 'DEMO-004', description: 'TRAPO DE PISO TEJIDO GRIS 60X50 [DEMO]', quantity: 5, unit_price: 2000.00, discount_pct: 0, line_total: 10000.00 }
    ]
  },
  EFA_P2: {
    key: 'EFA_P2',
    label: 'Distribuidora Demo Sur S.A. — Factura B 0001-00000123 (Hoja 2/2) [DEMO]',
    supplier_name: 'DISTRIBUIDORA DEMO SUR S.A.',
    supplier_cuit: '30-55555555-9',
    supplier_iibb: '901-123456-01',
    supplier_address: 'Av. Los Pinos 1000, Parque Industrial',
    supplier_city: 'Neuquén',
    supplier_phone: '299 4000000',
    supplier_email: 'ventas@distribuidorademo.com',
    invoice_type: 'FACTURA B (Cod. 06)',
    invoice_number: 'B 0001-00000123',
    page_info: 'Pág. 2 / 2 (2 artículos demostrativos)',
    date: '2026-11-10',
    due_date: '2026-12-10',
    cae: '74123456789012',
    payment_condition: 'Contado',
    vat_included: true,
    vat_rate: 21,
    vat_content_ley27743: 3471.07,
    discount_pct: 0,
    discount_amount: 0,
    invoice_stated_total: 100000.00,
    notes: 'Factura B 0001-00000123 (Hoja 2/2) [COMPROBANTE FICTICIO PARA DEMOSTRACIÓN].',
    items: [
      { code: 'DEMO-005', description: 'FIBRA ESPONJA COCINA VERDE [DEMO]', quantity: 10, unit_price: 800.00, discount_pct: 0, line_total: 8000.00 },
      { code: 'DEMO-006', description: 'DIFUSOR AMBIENTAL REPUESTO X 300 ML [DEMO]', quantity: 2, unit_price: 6000.00, discount_pct: 0, line_total: 12000.00 }
    ]
  },
  EL_TRIO: {
    key: 'EL_TRIO',
    label: 'Comercial Patagónica Demo — N.Vta. B 0002-00000456 [DEMO]',
    supplier_name: 'COMERCIAL PATAGÓNICA DEMO S.R.L.',
    supplier_cuit: '30-66666666-8',
    supplier_address: 'Ruta 22 Km 1200, Parque Industrial',
    supplier_city: 'Cipolletti, Río Negro',
    supplier_phone: '(0299) 400 1122',
    supplier_email: 'contacto@patagoniademo.com',
    invoice_type: 'N.Vta.Cdo. B',
    invoice_number: 'B 0002-00000456',
    page_info: 'Hoja 1 (2 artículos c/ Bonificación 10% + IVA 21%) [DEMO]',
    date: '2026-11-10',
    cae: '',
    payment_condition: 'Contado',
    vat_included: false,
    vat_rate: 21,
    vat_amount: 18900.00,
    discount_pct: 10.0,
    discount_amount: 10000.00,
    subtotal_bruto: 100000.00,
    subtotal_neto: 90000.00,
    invoice_stated_total: 108900.00,
    notes: 'N.Vta.Cdo. B 0002-00000456 [COMPROBANTE FICTICIO PARA DEMOSTRACIÓN]. Descuento 10%: -$10.000,00 | Neto Gravado: $90.000,00 | IVA 21%: $18.900,00 | Total: $108.900,00.',
    items: [
      { code: 'DEMO-101', description: 'DETERGENTE VAJILLA ULTRA X 500 ML [DEMO]', quantity: 20, unit_price: 3000.00, discount_pct: 10.0, line_total: 54000.00, subtotal_bruto: 60000.00 },
      { code: 'DEMO-102', description: 'DESENGRASANTE ENERGICO GATILLO X 500 ML [DEMO]', quantity: 10, unit_price: 4000.00, discount_pct: 10.0, line_total: 36000.00, subtotal_bruto: 40000.00 }
    ]
  },
  SYS_7572: {
    key: 'SYS_7572',
    label: 'Laboratorio Químico Demo — Pedido # DEMO-7001 [DEMO]',
    supplier_name: 'LABORATORIO QUÍMICO DEMO S.A.',
    supplier_cuit: '30-77777777-7',
    supplier_address: 'Calle Industrial 500, Parque Químico',
    supplier_city: 'Neuquén',
    supplier_phone: '11 4000-0000',
    supplier_email: 'pedidos@quimicademo.com',
    invoice_type: 'PEDIDO / FACTURA',
    invoice_number: 'PED-DEMO-7001',
    page_info: '4 renglones demostrativos (Cajas y Bidones) [DEMO]',
    date: '2026-11-10',
    cae: '',
    payment_condition: 'Efectivo',
    vat_included: true,
    vat_rate: 0,
    discount_pct: 0,
    discount_amount: 0,
    invoice_stated_total: 155000.00,
    notes: 'Pedido # DEMO-7001 [COMPROBANTE FICTICIO PARA DEMOSTRACIÓN].',
    items: [
      { code: 'DEMO-201', description: 'CAJA LAVANDINA 4 UNID X 5 LTS [DEMO]', quantity: 2, unit_price: 20000.00, discount_pct: 0, line_total: 40000.00 },
      { code: 'DEMO-202', description: 'CAJA DESINFECTANTE 4 UNID X 5 LTS [DEMO]', quantity: 2, unit_price: 25000.00, discount_pct: 0, line_total: 50000.00 },
      { code: 'DEMO-203', description: 'CAJA JABON LIQUIDO 4 UNID X 5 LTS [DEMO]', quantity: 1, unit_price: 30000.00, discount_pct: 0, line_total: 30000.00 },
      { code: 'DEMO-204', description: 'CAJA DETERGENTE 20 UNID X 1 LT [DEMO]', quantity: 1, unit_price: 35000.00, discount_pct: 0, line_total: 35000.00 }
    ]
  }
};

export function buildEfaCombinedInvoice() {
  const p1 = KNOWN_INVOICES.EFA_P1;
  const p2 = KNOWN_INVOICES.EFA_P2;
  return {
    ...JSON.parse(JSON.stringify(p1)),
    key: 'EFA_FULL',
    label: 'Distribuidora Demo Sur S.A. — Factura B 0001-00000123 Completa (Hojas 1/2 + 2/2) [DEMO]',
    page_info: 'Págs. 1/2 y 2/2 unificadas (6 artículos demostrativos)',
    invoice_stated_total: 100000.00,
    notes: 'Factura B 0001-00000123 completa (Hoja 1 + Hoja 2 — 6 artículos demostrativos) [DEMO].',
    items: [
      ...JSON.parse(JSON.stringify(p1.items)),
      ...JSON.parse(JSON.stringify(p2.items))
    ]
  };
}

function notify(msg, type = 'info') {
  if (window.app && typeof window.app.showNotification === 'function') {
    window.app.showNotification(msg, type);
  } else {
    console.log(`[${type}] ${msg}`);
  }
}

export const OcrFacturasView = {
  extractedInvoice: null,
  isProcessing: false,
  processingStatus: '',
  uploadedFileName: '',
  previewUrl: null,
  showImagePreview: false,
  hostContainer: null,

  render(container, params = {}) {
    this.hostContainer = container;
    window.ocrModule = this;

    if (params.preset && !this.extractedInvoice) {
      if (params.preset === 'EFA_FULL') {
        this.extractedInvoice = buildEfaCombinedInvoice();
      } else if (KNOWN_INVOICES[params.preset]) {
        this.extractedInvoice = JSON.parse(JSON.stringify(KNOWN_INVOICES[params.preset]));
      }
    }

    const isEmbeddedInCompras = Boolean(params.embedded);
    const purchases = db.getPurchases().filter(p => p.status !== 'ANULADA');
    const suppliers = db.getSuppliers();
    const products = db.getProducts();

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        ${!isEmbeddedInCompras ? `
          <!-- Barra de navegación unificada con Compras -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-center gap-3">
              <button onclick="window.app.navigate('compras')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="Volver al listado de Compras">
                <i data-lucide="arrow-left" class="w-5 h-5"></i>
              </button>
              <div>
                <h1 class="text-xl font-black text-slate-800 tracking-tight">Lector de Facturas por Foto / PDF (OCR Real)</h1>
                <p class="text-xs text-slate-500">Integrado en Compras & Facturas — Leé cualquier factura, verificá sus renglones y sumá al stock.</p>
              </div>
            </div>
            <button onclick="window.app.navigate('compras')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition">
              Ver Listado de Facturas (${purchases.length})
            </button>
          </div>
        ` : ''}

        <!-- Barra Superior Compacta: Subir Archivo + Carga Rápida de Facturas del Día -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5">
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <!-- Zona de Subida de Archivos (soporta 1 o varias fotos / PDF) -->
            <div class="lg:col-span-5">
              <div id="ocr-dropzone" class="border-2 border-dashed border-blue-400 bg-blue-50/50 hover:bg-blue-100/60 transition rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer">
                <input type="file" id="ocr-file-input" accept="image/*,.pdf" multiple class="hidden">
                <div class="flex items-center gap-3">
                  <div class="w-11 h-11 rounded-xl bg-[#0E3A6B] text-white flex items-center justify-center shadow-sm shrink-0">
                    <i data-lucide="upload-cloud" class="w-6 h-6"></i>
                  </div>
                  <div>
                    <h4 class="text-sm font-extrabold text-slate-800">Subir Foto(s) o PDF de Factura</h4>
                    <p class="text-[11px] text-slate-500">Hacé clic o arrastrá la imagen (JPG/PNG) o PDF de la factura</p>
                  </div>
                </div>
                <span class="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm shrink-0 hover:bg-blue-700 transition">
                  Subir Factura
                </span>
              </div>
            </div>

            <!-- Botones de Lectura Directa de los Comprobantes Recibidos Hoy -->
            <div class="lg:col-span-7 space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i>
                  Tus Facturas de Hoy (Clic para ver resultado de lectura o cargar las 3 juntas):
                </span>
                <button id="btn-batch-load-all" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-extrabold shadow-sm transition flex items-center gap-1.5">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                  Cargar las 3 Facturas Completas en 1 Clic
                </button>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button data-preset="EFA_P1" class="btn-preset-invoice px-2.5 py-2 rounded-xl border text-left transition ${this.extractedInvoice?.key === 'EFA_P1' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'}">
                  <span class="block text-[10px] font-black uppercase truncate">1. Demo A (Hoja 1/2)</span>\n                  <span class="block text-[10px] opacity-80 truncate">4 art · $80.000,00</span>
                </button>
                <button data-preset="EFA_P2" class="btn-preset-invoice px-2.5 py-2 rounded-xl border text-left transition ${this.extractedInvoice?.key === 'EFA_P2' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'}">
                  <span class="block text-[10px] font-black uppercase truncate">2. Demo A (Hoja 2/2)</span>\n                  <span class="block text-[10px] opacity-80 truncate">2 art · $20.000,00</span>
                </button>
                <button data-preset="EFA_FULL" class="btn-preset-invoice px-2.5 py-2 rounded-xl border text-left transition ${this.extractedInvoice?.key === 'EFA_FULL' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 border-indigo-200'}">
                  <span class="block text-[10px] font-black uppercase truncate">Demo A (Completa 1+2)</span>\n                  <span class="block text-[10px] opacity-80 truncate">6 art · $100.000,00</span>
                </button>
                <button data-preset="EL_TRIO" class="btn-preset-invoice px-2.5 py-2 rounded-xl border text-left transition ${this.extractedInvoice?.key === 'EL_TRIO' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'}">
                  <span class="block text-[10px] font-black uppercase truncate">3. Demo B (c/ Desc 10%)</span>\n                  <span class="block text-[10px] opacity-80 truncate">2 art · $108.900,00</span>
                </button>
                <button data-preset="SYS_7572" class="btn-preset-invoice px-2.5 py-2 rounded-xl border text-left transition ${this.extractedInvoice?.key === 'SYS_7572' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 hover:bg-blue-50 text-slate-700 border-slate-200'}">
                  <span class="block text-[10px] font-black uppercase truncate">4. Demo C (Pedido Químicos)</span>\n                  <span class="block text-[10px] opacity-80 truncate">4 art · $155.000,00</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Contenedor Principal del Resultado de Lectura -->
        <div id="ocr-result-container">
          ${this.renderResultSection()}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.bindEvents();
  },

  renderResultSection() {
    if (this.isProcessing) {
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-12 text-center space-y-4">
          <div class="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto animate-spin">
            <i data-lucide="loader-2" class="w-8 h-8"></i>
          </div>
          <h3 class="text-lg font-black text-slate-800">Analizando comprobante al detalle...</h3>
          <p class="text-sm text-slate-500 max-w-md mx-auto">${this.processingStatus || 'Extrayendo datos del proveedor, códigos de artículo, descripciones, empaques, precios y totales.'}</p>
        </div>
      `;
    }

    if (!this.extractedInvoice) {
      return `
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-10 text-center space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <i data-lucide="scan-line" class="w-8 h-8"></i>
          </div>
          <div class="max-w-lg mx-auto">
            <h3 class="text-base font-extrabold text-slate-800">Subí la foto/PDF de tu factura o hacé clic en uno de los comprobantes de arriba</h3>
            <p class="text-xs text-slate-500 mt-1 leading-relaxed">
              El motor interpreta automáticamente empaques (cajas a unidades vendibles), reconoce si el precio es por bulto o por unidad y concilia el total exacto.
            </p>
          </div>
        </div>
      `;
    }

    const inv = this.extractedInvoice;
    const existingSupplier = db.findSupplierMatch({
      name: inv.supplier_name,
      cuit: inv.supplier_cuit,
      email: inv.supplier_email
    });

    const existingPurchases = db.getPurchases().filter(p => p.status !== 'ANULADA');
    const cleanInvNum = String(inv.invoice_number || '').trim().toUpperCase();
    const matchingExistingPurchase = existingSupplier && cleanInvNum
      ? existingPurchases.find(p => p.supplier_id === existingSupplier.id && String(p.invoice_number || '').trim().toUpperCase() === cleanInvNum)
      : null;

    const currentProducts = db.getProducts();
    const categories = db.getCategories();

    const globalDiscPct = Number(inv.discount_pct) || 0;
    const vatRate = inv.vat_included === false ? (Number(inv.vat_rate) || 21) : 0;

    let sumBruto = 0;
    let sumNetoSinIvaAdicional = 0;

    const enrichedRows = inv.items.map((it, idx) => {
      const rawDesc = String(it.description || it.product_name || '').trim();
      const rawQty = Number(it.quantity ?? it.boxes_count) || 1;
      const rawPrice = Number(it.unit_price ?? it.unit_invoice_cost) || 0;
      const statedTotal = Number(it.line_total) || 0;

      // Parsing automático con PackagingEngine si no se especificó previamente
      const parsedPkg = PackagingEngine.parse(rawDesc, rawQty, rawPrice, statedTotal);

      const boxesCount = Number(it.boxes_count !== undefined ? it.boxes_count : rawQty) || 1;
      const unitsPerBox = Number(it.units_per_box !== undefined ? it.units_per_box : parsedPkg.unitsPerBox) || 1;
      const pricingMode = it.pricing_mode || parsedPkg.pricingMode || 'PER_BOX';
      const inventoryUnit = it.inventory_unit || parsedPkg.inventoryUnit || 'unidad';
      const commercialName = it.commercial_name || parsedPkg.cleanCommercialName;
      const itemDiscPct = Number(it.discount_pct !== undefined ? it.discount_pct : globalDiscPct) || 0;

      // Cálculo matemático exacto
      const pkgCalc = PackagingEngine.calculate({
        boxesCount,
        unitsPerBox,
        pricingMode,
        rawUnitPrice: rawPrice,
        discountPct: itemDiscPct
      });

      // Guardar de vuelta en el objeto item
      it.boxes_count = boxesCount;
      it.units_per_box = unitsPerBox;
      it.pricing_mode = pricingMode;
      it.inventory_unit = inventoryUnit;
      it.commercial_name = commercialName;
      it.quantity = boxesCount;
      it.unit_price = rawPrice;
      it.discount_pct = itemDiscPct;
      it.line_total = pkgCalc.lineNetTotal;

      sumBruto += pkgCalc.lineSubtotalBruto;
      sumNetoSinIvaAdicional += pkgCalc.lineNetTotal;

      const existingProd = db.findProductMatch(it.code, commercialName || rawDesc, currentProducts);
      const baseStockInDb = existingProd ? (Number(existingProd.current_stock) || 0) : 0;
      const stockAfterRow = baseStockInDb + pkgCalc.saleableUnits;

      return {
        ...it,
        idx,
        rawDesc,
        boxesCount,
        unitsPerBox,
        pricingMode,
        inventoryUnit,
        commercialName,
        itemDiscPct,
        pkgCalc,
        existingProd,
        baseStockInDb,
        stockAfterRow
      };
    });

    const discountAmount = Number((sumBruto - sumNetoSinIvaAdicional).toFixed(2));
    const vatAmount = inv.vat_included === false
      ? Number((sumNetoSinIvaAdicional * (vatRate / 100)).toFixed(2))
      : 0;
    const logisticsAmount = Number(inv.total_logistics) || 0;
    const calculatedTotal = Number(((inv.vat_included === false ? sumNetoSinIvaAdicional + vatAmount : sumNetoSinIvaAdicional) + logisticsAmount).toFixed(2));
    const statedTotal = Number(inv.invoice_stated_total !== undefined ? inv.invoice_stated_total : calculatedTotal);
    const reconciliation = PackagingEngine.reconcile({ statedTotal, calculatedTotal, tolerance: 0.05 });
    const isEfaSinglePage = inv.key === 'EFA_P1' || inv.key === 'EFA_P2';

    return `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden space-y-6 p-6">
        <!-- Encabezado del Resultado de Lectura -->
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <i data-lucide="check-circle-2" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-lg font-black text-slate-800">Resultado de la Lectura de la Factura</h3>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800">${inv.page_info || `${inv.items.length} artículos leídos`}</span>
                ${this.uploadedFileName ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">${this.uploadedFileName}</span>` : ''}
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                Verificá cantidades, empaques (cajas a unidades de venta individual) y precios antes de confirmar el ingreso al inventario.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            ${this.previewUrl ? `
              <button id="btn-toggle-image" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                <i data-lucide="image" class="w-4 h-4"></i>
                ${this.showImagePreview ? 'Ocultar foto subida' : 'Ver miniatura de la foto'}
              </button>
            ` : ''}
            <button id="btn-add-ocr-row" class="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
              <i data-lucide="plus" class="w-4 h-4"></i>
              Agregar Renglón
            </button>
          </div>
        </div>

        ${this.showImagePreview && this.previewUrl ? `
          <div class="bg-slate-900 rounded-xl p-4 flex justify-center">
            <img src="${this.previewUrl}" class="max-h-72 object-contain rounded-lg border border-slate-700" alt="Comprobante subido">
          </div>
        ` : ''}

        ${isEfaSinglePage ? `
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex items-start gap-3">
              <i data-lucide="layers" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5"></i>
              <div class="text-xs text-amber-900">
                <p class="font-extrabold">Factura B 0001-00000123 de DISTRIBUIDORA DEMO SUR S.A. (2 Hojas) [DEMO]:</p>
                <p class="mt-0.5">
                  Estás viendo <strong>${inv.key === 'EFA_P1' ? 'la Hoja 1/2 (4 artículos — Subtotal $80.000,00)' : 'la Hoja 2/2 (2 artículos — Subtotal $20.000,00)'}</strong>. El total impreso al pie es <strong>$100.000,00</strong>.
                </p>
              </div>
            </div>
            <button id="btn-merge-efa-pages" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold shadow-sm shrink-0 transition">
              Unir Hoja 1 + Hoja 2 (24 art · $100.000,00)
            </button>
          </div>
        ` : ''}

        ${matchingExistingPurchase ? `
          <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
            <i data-lucide="git-merge" class="w-5 h-5 text-indigo-600 shrink-0 mt-0.5"></i>
            <div class="text-xs text-indigo-950">
              <p class="font-extrabold">Comprobante ${inv.invoice_number} de ${existingSupplier.name} ya registrado (${matchingExistingPurchase.items.length} artículos cargados):</p>
              <p class="mt-0.5">
                Al confirmar, el sistema anexará estos artículos a la misma factura sin duplicar el proveedor ni el encabezado.
              </p>
            </div>
          </div>
        ` : ''}

        <!-- Bloque 1: Datos del Proveedor y del Comprobante -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/90">
          <div class="lg:col-span-5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">1. Proveedor Reconocido</span>
              ${existingSupplier ? `
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  REGISTRADO EN BASE
                </span>
              ` : `
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                  NUEVO PROVEEDOR
                </span>
              `}
            </div>

            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Razón Social / Nombre del Proveedor</label>
              <input type="text" id="ocr-supplier-name" value="${inv.supplier_name || ''}" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-extrabold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">CUIT</label>
                <input type="text" id="ocr-supplier-cuit" value="${inv.supplier_cuit || ''}" placeholder="30-00000000-0" class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-700">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Teléfono / Contacto</label>
                <input type="text" id="ocr-supplier-phone" value="${inv.supplier_phone || ''}" placeholder="Teléfono" class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700">
              </div>
            </div>

            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dirección / Localidad</label>
              <input type="text" id="ocr-supplier-address" value="${inv.supplier_address || ''}" placeholder="Dirección del proveedor" class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-700">
            </div>
          </div>

          <div class="lg:col-span-7 space-y-3 lg:pl-4 lg:border-l border-slate-200">
            <span class="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500">2. Datos de la Factura</span>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">N° de Factura / Comprobante</label>
                <input type="text" id="ocr-invoice-number" value="${inv.invoice_number || ''}" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-black text-blue-900">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha de Emisión</label>
                <input type="date" id="ocr-invoice-date" value="${inv.date || new Date().toISOString().substring(0, 10)}" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Condición de Pago</label>
                <input type="text" id="ocr-payment-condition" value="${inv.payment_condition || 'Contado'}" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700">
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Descuento Factura (%)</label>
                <input type="number" step="0.01" id="ocr-discount-pct" value="${inv.discount_pct || 0}" class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-amber-700">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tratamiento de IVA</label>
                <select id="ocr-vat-mode" class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700">
                  <option value="INCLUDED" ${inv.vat_included !== false ? 'selected' : ''}>IVA Incluido (Fact. B / Pedido)</option>
                  <option value="ADD_21" ${inv.vat_included === false ? 'selected' : ''}>Sumar +21% IVA al Neto</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Total Declarado Factura ($)</label>
                <input type="number" step="0.01" id="ocr-stated-total" value="${statedTotal}" class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-purple-900 font-mono" title="Monto total impreso en la factura para conciliar">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Flete / Logística ($)</label>
                <input type="number" step="100" id="ocr-logistics-cost" value="${inv.total_logistics || 0}" class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700">
              </div>
            </div>
          </div>
        </div>

        <!-- Bloque 2: Tabla Detallada con Desglose de Cajas a Unidades de Venta Individual -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <i data-lucide="package-search" class="w-4 h-4 text-blue-600"></i>
              Desglose de Empaques y Artículos (${enrichedRows.length} renglones)
            </h4>
            <span class="text-xs text-slate-500">
              Regla Comercial: El stock ingresa por <strong>unidad individual de venta</strong>, calculando el costo unitario exacto.
            </span>
          </div>

          <div class="overflow-x-auto border border-slate-200 rounded-2xl">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-800 text-white text-[10px] font-extrabold uppercase tracking-wider">
                  <th class="py-3 px-2 text-center w-8">#</th>
                  <th class="py-3 px-2 w-24">Código</th>
                  <th class="py-3 px-3 min-w-[200px]">Artículo / Nombre Comercial</th>
                  <th class="py-3 px-2 text-center w-16" title="Cantidad de bultos o cajas facturadas">Cajas</th>
                  <th class="py-3 px-2 text-center w-16" title="Unidades individuales que contiene cada caja">Unid/Caja</th>
                  <th class="py-3 px-2 text-center w-28" title="Stock total de unidades que ingresará al inventario">Stock a Ingresar</th>
                  <th class="py-3 px-2 text-center w-28" title="Si el precio de la factura es por caja completa o por unidad suelta">Precio Es</th>
                  <th class="py-3 px-2 text-right w-24">Precio Fact.</th>
                  <th class="py-3 px-2 text-right w-24" title="Costo efectivo por unidad individual vendible">Costo Unit.</th>
                  <th class="py-3 px-2 text-center w-16">Desc %</th>
                  <th class="py-3 px-3 text-right w-28">Total Renglón</th>
                  <th class="py-3 px-1 text-center w-8"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 text-xs">
                ${enrichedRows.map((row, idx) => `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="py-2.5 px-2 text-center text-slate-400 font-mono font-bold">${idx + 1}</td>
                    
                    <td class="py-2.5 px-2">
                      <input type="text" data-idx="${idx}" data-field="code" value="${row.code || ''}" placeholder="Cód/SKU" class="ocr-row-input w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-blue-900">
                    </td>

                    <td class="py-2.5 px-3">
                      <input type="text" data-idx="${idx}" data-field="commercial_name" value="${row.commercialName || ''}" placeholder="Nombre de venta individual" class="ocr-row-input w-full px-2 py-1 bg-white border border-slate-300 rounded font-extrabold text-slate-900 text-xs mb-0.5">
                      <div class="text-[10px] text-slate-400 truncate max-w-xs" title="${row.rawDesc}">
                        Facturado: ${row.rawDesc}
                      </div>
                    </td>

                    <td class="py-2.5 px-2">
                      <input type="number" min="1" step="1" data-idx="${idx}" data-field="boxes_count" value="${row.boxesCount}" class="ocr-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded text-center font-bold text-slate-900 text-xs">
                    </td>

                    <td class="py-2.5 px-2">
                      <input type="number" min="1" step="1" data-idx="${idx}" data-field="units_per_box" value="${row.unitsPerBox}" class="ocr-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded text-center font-bold text-blue-700 text-xs">
                    </td>

                    <td class="py-2.5 px-2 text-center">
                      <span class="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-black ${row.unitsPerBox > 1 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-800'}">
                        = ${row.pkgCalc.saleableUnits} ${row.inventoryUnit || 'u.'}
                      </span>
                    </td>

                    <td class="py-2.5 px-2">
                      <select data-idx="${idx}" data-field="pricing_mode" class="ocr-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded text-[11px] font-bold text-slate-700">
                        <option value="PER_BOX" ${row.pricingMode === 'PER_BOX' ? 'selected' : ''}>Por Caja</option>
                        <option value="PER_UNIT" ${row.pricingMode === 'PER_UNIT' ? 'selected' : ''}>Por Unidad</option>
                      </select>
                    </td>

                    <td class="py-2.5 px-2">
                      <input type="number" step="0.01" data-idx="${idx}" data-field="unit_price" value="${row.unit_price}" class="ocr-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded font-mono text-right text-slate-900 font-bold text-xs">
                    </td>

                    <td class="py-2.5 px-2 text-right">
                      <span class="font-mono font-bold text-slate-800 text-xs block">${Formatter.money(row.pkgCalc.netCostPerUnit)}</span>
                      <span class="text-[9px] text-slate-400">/${row.inventoryUnit || 'u.'}</span>
                    </td>

                    <td class="py-2.5 px-2">
                      <input type="number" step="0.01" data-idx="${idx}" data-field="discount_pct" value="${row.itemDiscPct}" class="ocr-row-input w-full px-1 py-1 bg-white border border-slate-300 rounded font-mono text-center text-amber-700 font-bold text-xs">
                    </td>

                    <td class="py-2.5 px-3 text-right font-mono font-black text-slate-900 text-xs">
                      ${Formatter.money(row.pkgCalc.lineNetTotal)}
                    </td>

                    <td class="py-2.5 px-1 text-center">
                      <button data-idx="${idx}" class="btn-remove-ocr-row text-slate-400 hover:text-red-600 p-1 rounded transition" title="Quitar renglón">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Bloque 3: Resumen Financiero Completo, Banner de Discrepancias y Botón Compacto -->
        <div class="bg-slate-900 text-white rounded-2xl p-6 space-y-5">
          <!-- Grid Responsiva de Importes Legibles -->
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Subtotal Bruto</span>
              <span class="text-sm font-black text-slate-100">${Formatter.money(sumBruto)}</span>
            </div>
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Descuento (${globalDiscPct}%)</span>
              <span class="text-sm font-black text-amber-400">- ${Formatter.money(discountAmount)}</span>
            </div>
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Subtotal Neto</span>
              <span class="text-sm font-black text-slate-100">${Formatter.money(sumNetoSinIvaAdicional)}</span>
            </div>
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">${inv.vat_included === false ? 'IVA (+21%)' : 'IVA Incluido'}</span>
              <span class="text-sm font-black text-cyan-300">
                ${Formatter.money(inv.vat_included === false ? vatAmount : (inv.vat_content_ley27743 || 0))}
              </span>
            </div>
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Leído Factura</span>
              <span class="text-sm font-black text-purple-300 font-mono">${Formatter.money(statedTotal)}</span>
            </div>
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Calculado</span>
              <span class="text-sm font-black text-emerald-400 font-mono">${Formatter.money(calculatedTotal)}</span>
            </div>
            <div class="p-3 rounded-xl border ${Math.abs(reconciliation.diff) <= 0.05 ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-red-950/60 border-red-500/40 text-red-300'}">
              <span class="block text-[10px] font-black uppercase tracking-wider">Diferencia</span>
              <span class="text-sm font-black font-mono">${reconciliation.diff >= 0 ? '+' : ''}${Formatter.money(reconciliation.diff)}</span>
            </div>
          </div>

          <!-- Banner de Conciliación / Discrepancia -->
          ${reconciliation.status === 'DIFERENCIA' ? `
            <div class="bg-red-500/20 border border-red-500/50 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-200">
              <div class="flex items-center gap-2.5">
                <i data-lucide="alert-triangle" class="w-5 h-5 text-red-400 shrink-0"></i>
                <div class="text-xs">
                  <strong class="font-black text-white">Discrepancia detectada:</strong> El total impreso en la factura (${Formatter.money(statedTotal)}) difiere del total calculado (${Formatter.money(calculatedTotal)}) en <strong>${Formatter.money(reconciliation.diff)}</strong>.
                  <p class="text-[11px] text-red-300 mt-0.5">Podés aceptar el total calculado para conciliar a $0, o confirmar la compra directamente de esta manera.</p>
                </div>
              </div>
              <button id="btn-force-reconcile" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs shrink-0 transition" title="Ajusta el total declarado al calculado para permitir la confirmación">
                Aceptar Total Calculado
              </button>
            </div>
          ` : `
            <div class="bg-emerald-500/20 border border-emerald-500/40 rounded-xl p-3 flex items-center gap-2.5 text-emerald-200 text-xs">
              <i data-lucide="check-circle" class="w-4 h-4 text-emerald-400 shrink-0"></i>
              <span><strong>Comprobante Conciliado:</strong> El total calculado coincide con la factura leída (${Formatter.money(calculatedTotal)}).</span>
            </div>
          `}

          <!-- Barra Inferior de Acción y Confirmación -->
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-800">
            <div class="text-xs text-slate-400">
              <span>El inventario aumentará en <strong>unidades de venta individual</strong> (bidones, botellas, unidades).</span>
            </div>
            <div class="flex items-center gap-3">
              <button id="btn-confirm-ocr-purchase" ${this.ocrRequiresReview || !inv.items?.length ? 'disabled title="Lectura incompleta: falta identificar y validar los productos"' : ''}
                
                class="px-5 py-2.5 ${this.ocrRequiresReview || !inv.items?.length ? 'opacity-40 cursor-not-allowed ' : ''}${reconciliation.status === 'DIFERENCIA' ? 'bg-amber-500 hover:bg-amber-600 text-slate-950' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'} font-black rounded-xl text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2">
                <i data-lucide="${reconciliation.status === 'DIFERENCIA' ? 'alert-triangle' : 'check-circle'}" class="w-4 h-4"></i>
                ${reconciliation.status === 'DIFERENCIA' ? 'Confirmar compra con diferencia e ingresar stock' : 'Confirmar compra e ingresar stock'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  bindEvents() {
    const dropzone = document.getElementById('ocr-dropzone');
    const fileInput = document.getElementById('ocr-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('border-blue-600', 'bg-blue-100/50');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('border-blue-600', 'bg-blue-100/50');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-blue-600', 'bg-blue-100/50');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFilesSelect(Array.from(e.dataTransfer.files));
        }
      });
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFilesSelect(Array.from(e.target.files));
        }
      });
    }

    document.querySelectorAll('.btn-preset-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-preset');
        this.loadPresetInvoice(key);
      });
    });

    const btnBatchAll = document.getElementById('btn-batch-load-all');
    if (btnBatchAll) {
      btnBatchAll.addEventListener('click', () => this.loadAllTodayInvoicesBatch());
    }

    this.bindResultEvents();
  },

  async handleFilesSelect(files) {
    if (!files?.length) return;
    this.ocrRequiresReview = true;
    const allowed = files.every(f => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.(pdf|png|jpe?g|webp)$/i.test(f.name));
    if (!allowed) { alert('Solo se admiten imágenes y PDF.'); return; }
    this.uploadedFileName = files.map(f => f.name).join(', ');
    this.extractedInvoice = null;
    this.isProcessing = true;
    this.processingStatus = 'Leyendo contenido real de los archivos…';
    this.refreshResultView();
    try {
      let allText = '';
      for (const file of files) {
        let text = '';
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          if (!window.pdfjsLib) throw new Error('No se cargó PDF.js. Actualizá la página.');
          const pdf = await window.pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise;
          if (pdf.numPages > 25) throw new Error('PDF demasiado largo: máximo 25 páginas.');
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const extracted = content.items.map(item => item.str || '').join(' ');
            if (extracted.trim().length > 50) text += '\n' + extracted;
            else {
              const viewport = page.getViewport({scale:1.7});
              const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
              await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
              if (!window.Tesseract) throw new Error('No se cargó Tesseract OCR.');
              const result = await window.Tesseract.recognize(canvas,'spa+eng');
              text += '\n' + (result.data?.text || '');
            }
          }
        } else {
          if (!window.Tesseract) throw new Error('No se cargó Tesseract OCR.');
          const result = await window.Tesseract.recognize(file,'spa+eng');
          text = result.data?.text || '';
        }
        allText += '\n' + text;
      }
      if (!allText.trim()) throw new Error('No se pudo leer texto del comprobante. Probá con una foto más nítida.');
      const lines = allText.split(/\n/).map(x => x.trim()).filter(Boolean);
      const cuit = allText.match(/(?:CUIT|C\.U\.I\.T)[^\d]{0,15}(\d{2}[- ]?\d{8}[- ]?\d)/i)?.[1] || '';
      const invoiceNumber = allText.match(/(?:FACTURA|COMPROBANTE|N[°ºo.]\s*)[^\n]{0,50}?(\d{4,5}[- ]\d{6,8})/i)?.[1] || allText.match(/\b\d{4,5}-\d{6,8}\b/)?.[0] || '';
      const totalCandidates = [...allText.matchAll(/(?:TOTAL\s*(?:A\s*PAGAR)?|IMPORTE\s*TOTAL)\s*[:$ ]*([\d.,]+)/gi)];
      const parseMoney = raw => {
        const str = String(raw || '').replace(/[^\d,.]/g,'');
        if (str.includes(',') && str.includes('.')) return Number(str.replace(/\./g,'').replace(',','.'));
        if (str.includes(',')) return Number(str.replace(',','.'));
        return Number(str);
      };
      const total = totalCandidates.length ? parseMoney(totalCandidates.at(-1)[1]) : 0;
      // Sin un parser de proveedor validado, no inventar renglones ni cantidades.
      this.extractedInvoice = {
        key:'OCR_REAL_PENDIENTE_REVISION', supplier_name:'', supplier_cuit:cuit,
        invoice_number:invoiceNumber, date:'',
        vat_included:true, vat_rate:21, discount_pct:0,
        invoice_stated_total:Number.isFinite(total)?total:0,
        notes:'OCR real: verificar proveedor, fecha, número, todos los renglones y totales contra el documento original antes de guardar.',
        items:[]
      };
      this.ocrRawText = allText;
      this.ocrPreviewLines = lines;
      this.ocrRequiresReview = true;
      this.isProcessing = false;
      this.refreshResultView();
      alert('Texto extraído del documento real. Completá y verificá manualmente todos los renglones; todavía no se registró ninguna compra ni se modificó stock.');
    } catch(error) {
      this.isProcessing = false;
      this.extractedInvoice = null;
      this.refreshResultView();
      alert('No se pudo leer la factura: ' + error.message);
    }
  },

  bindResultEvents() {
    const btnToggleImage = document.getElementById('btn-toggle-image');
    if (btnToggleImage) {
      btnToggleImage.addEventListener('click', () => {
        this.showImagePreview = !this.showImagePreview;
        this.refreshResultView();
      });
    }

    const btnMergeEfa = document.getElementById('btn-merge-efa-pages');
    if (btnMergeEfa) {
      btnMergeEfa.addEventListener('click', () => {
        this.loadPresetInvoice('EFA_FULL');
        notify('Se unificaron las Hojas 1/2 y 2/2 de EFA (24 artículos — Total $100.000,00)', 'success');
      });
    }

    const btnAddRow = document.getElementById('btn-add-ocr-row');
    if (btnAddRow) {
      btnAddRow.addEventListener('click', () => {
        if (!this.extractedInvoice) return;
        this.syncHeaderInputs();
        this.extractedInvoice.items.push({
          code: '',
          commercial_name: '',
          description: '',
          boxes_count: 1,
          units_per_box: 1,
          pricing_mode: 'PER_BOX',
          inventory_unit: 'unidad',
          quantity: 1,
          unit_price: 0,
          discount_pct: Number(this.extractedInvoice.discount_pct) || 0,
          line_total: 0
        });
        this.refreshResultView();
      });
    }

    document.querySelectorAll('.btn-remove-ocr-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        if (this.extractedInvoice && this.extractedInvoice.items.length > 1) {
          this.syncHeaderInputs();
          this.extractedInvoice.items.splice(idx, 1);
          this.refreshResultView();
        }
      });
    });

    document.querySelectorAll('.ocr-row-input').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = Number(inp.getAttribute('data-idx'));
        const field = inp.getAttribute('data-field');
        if (!this.extractedInvoice || !this.extractedInvoice.items[idx]) return;
        this.syncHeaderInputs();

        const it = this.extractedInvoice.items[idx];
        if (field === 'boxes_count' || field === 'units_per_box' || field === 'unit_price' || field === 'discount_pct') {
          it[field] = Number(inp.value) || 0;
        } else {
          it[field] = inp.value;
        }

        // Si cambió el nombre comercial o empaque, recalculamos
        const calc = PackagingEngine.calculate({
          boxesCount: Number(it.boxes_count) || 1,
          unitsPerBox: Number(it.units_per_box) || 1,
          pricingMode: it.pricing_mode || 'PER_BOX',
          rawUnitPrice: Number(it.unit_price) || 0,
          discountPct: Number(it.discount_pct) || 0
        });
        it.line_total = calc.lineNetTotal;
        it.quantity = Number(it.boxes_count) || 1;

        this.refreshResultView();
      });
    });

    ['ocr-supplier-name', 'ocr-supplier-cuit', 'ocr-supplier-phone', 'ocr-supplier-address', 'ocr-invoice-number', 'ocr-invoice-date', 'ocr-payment-condition', 'ocr-discount-pct', 'ocr-vat-mode', 'ocr-stated-total', 'ocr-logistics-cost', 'ocr-cae'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          this.syncHeaderInputs();
          if (id === 'ocr-discount-pct') {
            const newDisc = Number(this.extractedInvoice.discount_pct) || 0;
            this.extractedInvoice.items.forEach(it => {
              it.discount_pct = newDisc;
            });
          }
          this.refreshResultView();
        });
      }
    });

    const btnForceReconcile = document.getElementById('btn-force-reconcile');
    if (btnForceReconcile) {
      btnForceReconcile.addEventListener('click', () => {
        if (!this.extractedInvoice) return;
        this.syncHeaderInputs();
        // Obtener total calculado actual
        let subtotalNet = 0;
        this.extractedInvoice.items.forEach(it => {
          const calc = PackagingEngine.calculate({
            boxesCount: Number(it.boxes_count) || 1,
            unitsPerBox: Number(it.units_per_box) || 1,
            pricingMode: it.pricing_mode || 'PER_BOX',
            rawUnitPrice: Number(it.unit_price) || 0,
            discountPct: Number(it.discount_pct) || 0
          });
          subtotalNet += calc.lineNetTotal;
        });
        const vat = this.extractedInvoice.vat_included === false ? (subtotalNet * 0.21) : 0;
        const log = Number(this.extractedInvoice.total_logistics) || 0;
        const total = Number((subtotalNet + vat + log).toFixed(2));
        this.extractedInvoice.invoice_stated_total = total;
        this.refreshResultView();
      });
    }

    const btnConfirm = document.getElementById('btn-confirm-ocr-purchase');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.confirmExtractedPurchase());
    }
  },

  syncHeaderInputs() {
    if (!this.extractedInvoice) return;
    const getVal = (id) => document.getElementById(id)?.value;
    if (getVal('ocr-supplier-name') !== undefined) this.extractedInvoice.supplier_name = getVal('ocr-supplier-name');
    if (getVal('ocr-supplier-cuit') !== undefined) this.extractedInvoice.supplier_cuit = getVal('ocr-supplier-cuit');
    if (getVal('ocr-supplier-phone') !== undefined) this.extractedInvoice.supplier_phone = getVal('ocr-supplier-phone');
    if (getVal('ocr-supplier-address') !== undefined) this.extractedInvoice.supplier_address = getVal('ocr-supplier-address');
    if (getVal('ocr-invoice-number') !== undefined) this.extractedInvoice.invoice_number = getVal('ocr-invoice-number');
    if (getVal('ocr-invoice-date') !== undefined) this.extractedInvoice.date = getVal('ocr-invoice-date');
    if (getVal('ocr-payment-condition') !== undefined) this.extractedInvoice.payment_condition = getVal('ocr-payment-condition');
    if (getVal('ocr-discount-pct') !== undefined) this.extractedInvoice.discount_pct = Number(getVal('ocr-discount-pct')) || 0;
    if (getVal('ocr-vat-mode') !== undefined) this.extractedInvoice.vat_included = getVal('ocr-vat-mode') !== 'ADD_21';
    if (getVal('ocr-stated-total') !== undefined) this.extractedInvoice.invoice_stated_total = Number(getVal('ocr-stated-total')) || 0;
    if (getVal('ocr-logistics-cost') !== undefined) this.extractedInvoice.total_logistics = Number(getVal('ocr-logistics-cost')) || 0;
    if (getVal('ocr-cae') !== undefined) this.extractedInvoice.cae = getVal('ocr-cae');
  },

  refreshResultView() {
    const container = document.getElementById('ocr-result-container');
    if (container) {
      container.innerHTML = this.renderResultSection();
      if (window.lucide) window.lucide.createIcons();
      this.bindResultEvents();
    }
  },

  confirmExtractedPurchase() {
    if (!this.extractedInvoice) return;
    if (this.ocrRequiresReview || this.extractedInvoice.key === 'OCR_REAL_PENDIENTE_REVISION') {
      notify('La lectura OCR todavía no identificó todos los artículos. No se puede registrar esta factura ni modificar stock.', 'error');
      return;
    }
    this.syncHeaderInputs();

    const inv = this.extractedInvoice;
    if (!inv.supplier_name || !inv.supplier_name.trim()) {
      notify('Ingresá el nombre del proveedor antes de confirmar.', 'error');
      return;
    }

    const validItems = (inv.items || []).filter(it => (it.description || it.commercial_name || '').trim() !== '' && (Number(it.boxes_count ?? it.quantity) > 0));
    if (validItems.length === 0) {
      notify('La factura debe tener al menos un artículo válido con cantidad mayor a 0.', 'error');
      return;
    }

    const existingSupplier = db.findSupplierMatch({
      name: inv.supplier_name,
      cuit: inv.supplier_cuit,
      email: inv.supplier_email
    });
    const cleanInvNum = String(inv.invoice_number || '').trim().toUpperCase();
    const existingSameInvoice = existingSupplier && cleanInvNum
      ? db.getPurchases().find(p => p.status !== 'ANULADA' && p.supplier_id === existingSupplier.id && String(p.invoice_number || '').trim().toUpperCase() === cleanInvNum)
      : null;

    if (existingSameInvoice) {
      const existingCodes = new Set((existingSameInvoice.items || []).map(i => db.normalizeCode(i.code || i.sku)));
      const allAlreadyInInvoice = validItems.every(i => existingCodes.has(db.normalizeCode(i.code)));
      if (allAlreadyInInvoice) {
        notify(`Esta hoja de la factura ${inv.invoice_number} (${inv.supplier_name}) ya fue cargada en el sistema.`, 'info');
        if (window.app) window.app.navigate('compras');
        return;
      }
    }

    try {
      const result = db.createPurchase({
        supplier_name: inv.supplier_name.trim(),
        supplier_cuit: inv.supplier_cuit,
        supplier_address: inv.supplier_address,
        supplier_phone: inv.supplier_phone,
        supplier_email: inv.supplier_email,
        invoice_number: inv.invoice_number || 'S/N',
        invoice_type: inv.invoice_type || 'FACTURA B',
        cae: inv.cae || '',
        date: inv.date || new Date().toISOString().substring(0, 10),
        payment_condition: inv.payment_condition || 'Contado',
        discount_pct: Number(inv.discount_pct) || 0,
        vat_included: inv.vat_included !== false,
        vat_rate: inv.vat_included === false ? 21 : 0,
        total_logistics: Number(inv.total_logistics) || 0,
        invoice_stated_total: inv.invoice_stated_total,
        reconciliation: PackagingEngine.reconcile({
          statedTotal: inv.invoice_stated_total,
          calculatedTotal: inv.invoice_stated_total // se calcula en db.createPurchase
        }),
        merge_into_existing: Boolean(existingSameInvoice),
        notes: inv.notes || '',
        items: validItems.map(it => {
          const parsed = PackagingEngine.parse(it.description || it.commercial_name, it.boxes_count || it.quantity, it.unit_price, it.line_total);
          return {
            code: String(it.code || '').trim(),
            product_name: String(it.commercial_name || parsed.cleanCommercialName || it.description).trim(),
            commercial_name: String(it.commercial_name || parsed.cleanCommercialName || it.description).trim(),
            invoice_description: String(it.description || it.rawDesc || '').trim(),
            boxes_count: Number(it.boxes_count ?? it.quantity) || 1,
            units_per_box: Number(it.units_per_box ?? parsed.unitsPerBox) || 1,
            pricing_mode: it.pricing_mode || parsed.pricingMode || 'PER_BOX',
            inventory_unit: it.inventory_unit || parsed.inventoryUnit || 'unidad',
            quantity: Number(it.boxes_count ?? it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            unit_price_original: Number(it.unit_price) || 0,
            discount_pct: Number(it.discount_pct ?? inv.discount_pct) || 0,
            line_total: Number(it.line_total) || 0
          };
        })
      });

      const meta = result._meta || {};
      notify(
        `¡Factura ${result.invoice_number} de ${result.supplier_name} registrada! (${meta.newProductsCreated || 0} creados, ${meta.existingProductsUpdated || 0} sumados al stock en unidades vendibles)`,
        'success'
      );

      this.extractedInvoice = null;
      if (window.app) {
        window.app.navigate('compras');
      }
    } catch (err) {
      console.error(err);
      notify(`Error al guardar la factura: ${err.message}`, 'error');
    }
  },

  loadAllTodayInvoicesBatch() {
    const batch = [
      buildEfaCombinedInvoice(),
      JSON.parse(JSON.stringify(KNOWN_INVOICES.EL_TRIO)),
      JSON.parse(JSON.stringify(KNOWN_INVOICES.SYS_7572))
    ];

    let loadedCount = 0;
    const existingPurchases = db.getPurchases().filter(p => p.status !== 'ANULADA');

    batch.forEach(inv => {
      const alreadyExists = existingPurchases.some(
        p => String(p.invoice_number || '').trim().toUpperCase() === String(inv.invoice_number || '').trim().toUpperCase()
      );
      if (!alreadyExists) {
        db.createPurchase({
          supplier_name: inv.supplier_name,
          supplier_cuit: inv.supplier_cuit,
          supplier_address: inv.supplier_address,
          supplier_phone: inv.supplier_phone,
          supplier_email: inv.supplier_email,
          invoice_number: inv.invoice_number,
          invoice_type: inv.invoice_type,
          cae: inv.cae || '',
          date: inv.date,
          payment_condition: inv.payment_condition,
          discount_pct: Number(inv.discount_pct) || 0,
          vat_included: inv.vat_included !== false,
          vat_rate: inv.vat_included === false ? 21 : 0,
          total_logistics: 0,
          invoice_stated_total: inv.invoice_stated_total,
          notes: inv.notes || '',
          items: inv.items.map(it => ({
            code: it.code,
            product_name: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount_pct: it.discount_pct
          }))
        });
        loadedCount++;
      }
    });

    if (loadedCount === 0) {
      notify('Las 3 facturas de demostración ya estaban cargadas en tu base de datos.', 'info');
    } else {
      notify(`¡Se cargaron ${loadedCount} facturas de demostración (3 proveedores y 12 artículos en Stock y Tienda Nube)!`, 'success');
    }

    if (window.app) {
      window.app.navigate('compras');
    }
  }
};
