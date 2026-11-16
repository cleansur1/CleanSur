// Módulo de Ventas / POS para Limpieza Caviahue
// Cálculo en vivo, descuentos, listas de precios, unidades/conversiones, descuento automático de stock y anulación.

import { db } from '../db.js';
import { Formatter } from '../models.js';

let cartItems = [];
let selectedCustomer = null;
let selectedPriceListId = 'list-minorista';
let discountPct = 0;
let paymentMethod = 'Efectivo';
let saleNotes = '';

export const VentasView = {
  async renderCentralOrders(container) {
    const {STAYCLEAN_SUPABASE_URL,STAYCLEAN_PUBLISHABLE_KEY,staycleanStaffOrders}=await import('../supabase_public.js');
    const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const token=sessionStorage.getItem('stayclean_staff_access_token');
    if(token) {
      try {
        const rows=await staycleanStaffOrders(token);
        if(!Array.isArray(rows))throw Error('No autorizado');
        container.innerHTML='<section class="bg-white p-6 rounded-xl"><h2 class="font-bold text-xl">Pedidos online centrales</h2><p class="text-sm mb-3">Supabase · stock descontado al confirmar</p>'+(rows.length?rows.map(o=>'<div class="border-b p-2">'+esc(o.number)+' · '+esc(o.customer)+' · '+esc(o.city)+' · $'+Number(o.total).toLocaleString('es-AR')+' · '+esc(o.status)+'</div>').join(''):'<p>No hay pedidos registrados.</p>')+'</section>';return;
      } catch(e) {sessionStorage.removeItem('stayclean_staff_access_token');}
    }
    container.innerHTML='<section class="bg-white p-6 rounded-xl"><h2 class="font-bold mb-2">Iniciar sesión de personal Supabase</h2><form id="stayclean-login"><input class="border p-2 m-1" name="email" type="email" placeholder="Email" required><input class="border p-2 m-1" name="password" type="password" placeholder="Contraseña" required><button class="bg-blue-800 text-white p-2 rounded" type="submit">Ingresar</button></form><p id="stayclean-login-error"></p></section>';
    container.querySelector('#stayclean-login').onsubmit=async e=>{
      e.preventDefault();const d=new FormData(e.target);
      try {const r=await fetch(STAYCLEAN_SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:d.get('email'),password:d.get('password')})});const x=await r.json();if(!r.ok||!x.access_token)throw Error('Ingreso inválido');sessionStorage.setItem('stayclean_staff_access_token',x.access_token);await this.renderCentralOrders(container);}
      catch(err){container.querySelector('#stayclean-login-error').textContent='No se pudo autenticar al personal autorizado';}
    };
  },
  render(container, params = {}) {
    if(params.action==='online'){this.renderCentralOrders(container);return;}
    const isNew = params.action === 'new';
    const sales = db.getSales();
    const customers = db.getCustomers();
    const products = db.getProducts().filter(p => p.active);
    const priceLists = db.getPriceLists();

    if (isNew) {
      this.renderNewSale(container, customers, products, priceLists);
    } else {
      this.renderSalesList(container, sales);
    }
  },

  renderSalesList(container, sales) {
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Registro de Ventas & Comprobantes</h1><button onclick="window.app.navigate(&quot;ventas&quot;, {action: &quot;online&quot;})" class="text-blue-700 underline text-sm">Pedidos online / iniciar sesión</button>
            <p class="text-xs text-slate-500">Historial de ventas comerciales, facturación y control de márgenes.</p>
          </div>
          <button onclick="window.app.navigate('ventas', { action: 'new' })" class="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm transition">
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            + Nueva Venta (POS)
          </button>
        </div>

        <!-- Filtros y Búsqueda -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div class="relative w-full md:w-80">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3 text-slate-400"></i>
            <input type="text" id="searchSalesInput" placeholder="Buscar por N° Venta, cliente..." class="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          </div>
          <div class="flex items-center gap-2 w-full md:w-auto text-xs">
            <span class="text-slate-500">Filtro Estado:</span>
            <select id="filterSaleStatus" class="border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700">
              <option value="TODOS">Todos</option>
              <option value="COMPLETADA">Completadas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
        </div>

        <!-- Tabla de Ventas -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">N° Comprobante</th>
                  <th class="py-3 px-4">Fecha</th>
                  <th class="py-3 px-4">Cliente</th>
                  <th class="py-3 px-4">Medio Pago</th>
                  <th class="py-3 px-4 text-right">Subtotal</th>
                  <th class="py-3 px-4 text-right">IVA (21%)</th>
                  <th class="py-3 px-4 text-right">Total Factura</th>
                  <th class="py-3 px-4 text-right">Margen Bruto</th>
                  <th class="py-3 px-4 text-right">Margen %</th>
                  <th class="py-3 px-4 text-center">Estado</th>
                  <th class="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100" id="salesTableBody">
                ${sales.map(s => `
                  <tr class="hover:bg-slate-50 transition ${s.status === 'ANULADA' ? 'opacity-60 bg-slate-50/50' : ''}">
                    <td class="py-3 px-4 font-mono font-bold text-slate-800">${s.sale_number}</td>
                    <td class="py-3 px-4 text-slate-600">${Formatter.date(s.date)}</td>
                    <td class="py-3 px-4 font-medium text-slate-900">${s.customer_name}</td>
                    <td class="py-3 px-4 text-slate-600">${s.payment_method}</td>
                    <td class="py-3 px-4 text-right text-slate-600">${Formatter.money(s.subtotal)}</td>
                    <td class="py-3 px-4 text-right text-slate-600">${Formatter.money(s.vat_amount)}</td>
                    <td class="py-3 px-4 text-right font-bold text-slate-900">${Formatter.money(s.total)}</td>
                    <td class="py-3 px-4 text-right font-semibold ${s.gross_margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
                      ${Formatter.money(s.gross_margin)}
                    </td>
                    <td class="py-3 px-4 text-right font-bold ${s.gross_margin_pct >= 40 ? 'text-emerald-700' : 'text-amber-600'}">
                      ${Formatter.percent(s.gross_margin_pct)}
                    </td>
                    <td class="py-3 px-4 text-center">
                      <span class="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'COMPLETADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                        ${s.status}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-center space-x-1.5 whitespace-nowrap">
                      <button onclick="window.ventasModule.showTicket('${s.id}')" title="Ver e Imprimir Comprobante" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                        <i data-lucide="printer" class="w-4 h-4"></i>
                      </button>
                      ${s.status === 'COMPLETADA' ? `
                        <button onclick="window.ventasModule.promptCancelSale('${s.id}')" title="Anular Venta y Revertir Stock" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded">
                          <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                        </button>
                      ` : ''}
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
    this.attachSalesListEvents();
  },

  renderNewSale(container, customers, products, priceLists) {
    // Inicializar carro vacío si no tiene ítems
    if (!cartItems) cartItems = [];

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('ventas')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div>
              <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Punto de Venta (POS Caviahue)</h1>
              <p class="text-xs text-slate-500">Emisión de nueva venta con cálculo automático de márgenes y descuento de stock.</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200">
              Terminal Mostrador / Móvil
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Columna Izquierda: Búsqueda y Selección de Productos (2 cols) -->
          <div class="lg:col-span-2 space-y-4">
            <!-- Selector de Cliente y Lista de Precios -->
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Cliente</label>
                <select id="posCustomerSelect" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="">Consumidor Final (Particular)</option>
                  ${customers.map(c => `
                    <option value="${c.id}" ${selectedCustomer && selectedCustomer.id === c.id ? 'selected' : ''}>
                      ${c.name} (${c.customer_type}) - ${c.credit_account_enabled ? `Saldo Cta Cte: ${Formatter.money(c.current_balance)}` : 'Sin Cta Cte'}
                    </option>
                  `).join('')}
                </select>
                <div id="customerInfoBadge" class="mt-1 text-[11px] text-slate-500"></div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Lista de Precios Aplicada</label>
                <select id="posPriceListSelect" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  ${priceLists.map(pl => `
                    <option value="${pl.id}" ${selectedPriceListId === pl.id ? 'selected' : ''}>
                      ${pl.name} (${pl.code}) - Margen factor ${pl.margin_factor}x
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Buscador Rápido de Productos -->
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <label class="block text-xs font-bold text-slate-700 mb-2">Buscar y Agregar Productos al Carrito</label>
              <div class="relative mb-3">
                <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3 text-slate-400"></i>
                <input type="text" id="posProductSearch" placeholder="Escribí nombre, SKU o escaneá código de barras..." class="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              </div>

              <!-- Resultados de Búsqueda Rápida -->
              <div id="posSearchResults" class="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50">
                <div class="p-4 text-center text-xs text-slate-400">
                  Escribí en el buscador o seleccioná de la lista para agregar al carrito
                </div>
              </div>
            </div>

            <!-- Tabla de Ítems en Carrito -->
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Detalle del Pedido / Carrito</h3>
                <span id="cartCountBadge" class="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  0 ítems
                </span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                  <thead class="text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 bg-white">
                    <tr>
                      <th class="py-2.5 px-3">Producto</th>
                      <th class="py-2.5 px-3">Unidad / Pres.</th>
                      <th class="py-2.5 px-3 text-center w-24">Cantidad</th>
                      <th class="py-2.5 px-3 text-right">Precio Unit.</th>
                      <th class="py-2.5 px-3 text-right">Costo Caviahue</th>
                      <th class="py-2.5 px-3 text-right">Subtotal</th>
                      <th class="py-2.5 px-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody id="cartTableBody" class="divide-y divide-slate-100">
                    <!-- Se llena dinámicamente -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Columna Derecha: Resumen Financiero, Métricas y Cobro (1 col) -->
          <div class="space-y-4">
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 sticky top-6">
              <h2 class="text-sm font-bold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-200">
                Resumen de la Venta
              </h2>

              <div class="space-y-2 text-xs">
                <div class="flex justify-between text-slate-600">
                  <span>Subtotal Mercadería</span>
                  <span id="summarySubtotal" class="font-semibold text-slate-800">$ 0,00</span>
                </div>
                <div class="flex items-center justify-between text-slate-600">
                  <span>Descuento Especial (%)</span>
                  <input type="number" id="posDiscountInput" min="0" max="100" value="0" class="w-16 text-right px-2 py-1 border border-slate-300 rounded text-xs">
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>Descuento Monto</span>
                  <span id="summaryDiscountAmount" class="font-semibold text-rose-600">- $ 0,00</span>
                </div>
                <div class="flex justify-between text-slate-600">
                  <span>IVA (21%)</span>
                  <span id="summaryVat" class="font-semibold text-slate-800">$ 0,00</span>
                </div>
                <div class="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                  <span class="text-sm font-bold text-slate-800">TOTAL FINAL</span>
                  <span id="summaryTotal" class="text-xl font-extrabold text-emerald-700">$ 0,00</span>
                </div>
              </div>

              <!-- Indicadores de Rentabilidad en Vivo de la Operación -->
              <div class="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 space-y-1.5 text-xs">
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">Costo Mercadería (CMV):</span>
                  <span id="summaryCost" class="font-medium text-slate-800">$ 0,00</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">Margen Estimado de la Venta:</span>
                  <span id="summaryMargin" class="font-bold text-indigo-700">$ 0,00</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-slate-600">Margen Porcentual (%):</span>
                  <span id="summaryMarginPct" class="font-bold text-indigo-700">0,00 %</span>
                </div>
              </div>

              <!-- Medio de Pago -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Medio de Pago</label>
                <select id="posPaymentMethod" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Débito">Tarjeta Débito</option>
                  <option value="Crédito">Tarjeta Crédito</option>
                  <option value="Cuenta Corriente">Cuenta Corriente (A plazo)</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <!-- Observaciones -->
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">Notas u Observaciones</label>
                <textarea id="posNotes" rows="2" placeholder="N° remito, entrega en cabaña..." class="w-full border border-slate-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"></textarea>
              </div>

              <!-- Botón Confirmar Venta -->
              <button id="btnConfirmSale" onclick="window.ventasModule.confirmSale()" class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50">
                <i data-lucide="check-circle" class="w-5 h-5"></i>
                Confirmar y Facturar Venta
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal de Ticket / Comprobante -->
      <div id="ticketModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 class="text-base font-bold text-slate-800">Comprobante de Venta</h3>
            <button onclick="document.getElementById('ticketModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="ticketModalContent" class="text-xs font-mono bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
            <!-- Contenido dinámico del ticket -->
          </div>
          <div class="flex gap-2">
            <button onclick="window.print()" class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5">
              <i data-lucide="printer" class="w-4 h-4"></i> Imprimir Comprobante
            </button>
            <button onclick="document.getElementById('ticketModal').classList.add('hidden')" class="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.attachPOSInteractions(products, customers, priceLists);
  },

  attachPOSInteractions(products, customers, priceLists) {
    const searchInput = document.getElementById('posProductSearch');
    const resultsContainer = document.getElementById('posSearchResults');
    const customerSelect = document.getElementById('posCustomerSelect');
    const priceListSelect = document.getElementById('posPriceListSelect');
    const discountInput = document.getElementById('posDiscountInput');

    // Manejo de cambio de cliente
    if (customerSelect) {
      customerSelect.addEventListener('change', (e) => {
        const custId = e.target.value;
        selectedCustomer = customers.find(c => c.id === custId) || null;
        if (selectedCustomer) {
          if (selectedCustomer.price_list_id && priceListSelect) {
            priceListSelect.value = selectedCustomer.price_list_id;
            selectedPriceListId = selectedCustomer.price_list_id;
          }
          if (selectedCustomer.special_discount_pct && discountInput) {
            discountInput.value = selectedCustomer.special_discount_pct;
            discountPct = Number(selectedCustomer.special_discount_pct);
          }
        }
        window.ventasModule.recalcPOS();
      });
    }

    // Manejo de cambio de lista de precios
    if (priceListSelect) {
      priceListSelect.addEventListener('change', (e) => {
        selectedPriceListId = e.target.value;
        // Recalcular precios unitarios del carrito según la lista seleccionada
        const list = priceLists.find(pl => pl.id === selectedPriceListId);
        const factor = list ? list.margin_factor : 1.0;
        cartItems.forEach(item => {
          const prod = products.find(p => p.id === item.product_id);
          if (prod) {
            item.unit_price = (prod.sale_price || 0) * factor;
          }
        });
        window.ventasModule.renderCart();
      });
    }

    // Búsqueda de productos en tiempo real
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (query.length === 0) {
          resultsContainer.innerHTML = `
            <div class="p-4 text-center text-xs text-slate-400">
              Escribí para buscar productos...
            </div>
          `;
          return;
        }

        const filtered = products.filter(p => 
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          (p.barcode && p.barcode.includes(query)) ||
          p.subcategory.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
          resultsContainer.innerHTML = `
            <div class="p-4 text-center text-xs text-rose-500 font-medium">
              No se encontraron productos coincidentes.
            </div>
          `;
          return;
        }

        const list = priceLists.find(pl => pl.id === selectedPriceListId);
        const factor = list ? list.margin_factor : 1.0;

        resultsContainer.innerHTML = filtered.slice(0, 10).map(p => {
          const price = (p.sale_price || 0) * factor;
          const isLow = p.current_stock <= (p.min_stock || 5);
          return `
            <div class="p-2.5 flex items-center justify-between hover:bg-emerald-50/60 transition cursor-pointer" onclick="window.ventasModule.addToCart('${p.id}')">
              <div class="min-w-0 pr-2">
                <div class="text-xs font-bold text-slate-800 truncate">${p.name}</div>
                <div class="text-[11px] text-slate-500 flex items-center gap-2">
                  <span class="font-mono">${p.sku}</span>
                  <span>•</span>
                  <span>Unidad: ${p.sale_unit}</span>
                  <span>•</span>
                  <span class="font-semibold ${isLow ? 'text-amber-600' : 'text-emerald-600'}">Stock: ${p.current_stock}</span>
                </div>
              </div>
              <div class="text-right whitespace-nowrap">
                <div class="text-xs font-bold text-emerald-700">${Formatter.money(price)}</div>
                <button class="mt-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold">
                  + Agregar
                </button>
              </div>
            </div>
          `;
        }).join('');
      });
    }

    if (discountInput) {
      discountInput.addEventListener('input', (e) => {
        discountPct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        window.ventasModule.recalcPOS();
      });
    }

    // Inicializar carro vacío en UI
    window.ventasModule.renderCart();
  },

  attachSalesListEvents() {
    const searchInput = document.getElementById('searchSalesInput');
    const statusSelect = document.getElementById('filterSaleStatus');

    const filterRows = () => {
      const q = (searchInput?.value || '').toLowerCase().trim();
      const st = statusSelect?.value || 'TODOS';
      const rows = document.querySelectorAll('#salesTableBody tr');

      rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        const matchesQ = text.includes(q);
        const matchesSt = st === 'TODOS' || text.includes(st.toLowerCase());
        r.style.display = matchesQ && matchesSt ? '' : 'none';
      });
    };

    if (searchInput) searchInput.addEventListener('input', filterRows);
    if (statusSelect) statusSelect.addEventListener('change', filterRows);
  }
};

// Objeto global de acciones para Ventas
window.ventasModule = {
  addToCart(productId) {
    const prod = db.getProduct(productId);
    if (!prod) return;

    const priceLists = db.getPriceLists();
    const list = priceLists.find(pl => pl.id === selectedPriceListId);
    const factor = list ? list.margin_factor : 1.0;
    const basePrice = (prod.sale_price || 0) * factor;

    const existing = cartItems.find(it => it.product_id === productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      cartItems.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        unit_name: prod.sale_unit || 'Unidad',
        factor_to_base: 1, // Unidad de venta estándar
        quantity: 1,
        unit_price: basePrice,
        unit_cost: prod.caviahue_cost || 0
      });
    }

    this.renderCart();
  },

  updateCartQty(index, qty) {
    const val = Number(qty);
    if (val <= 0) {
      cartItems.splice(index, 1);
    } else {
      cartItems[index].quantity = val;
    }
    this.renderCart();
  },

  removeFromCart(index) {
    cartItems.splice(index, 1);
    this.renderCart();
  },

  renderCart() {
    const tbody = document.getElementById('cartTableBody');
    const countBadge = document.getElementById('cartCountBadge');
    if (!tbody) return;

    if (countBadge) countBadge.textContent = `${cartItems.length} ítems`;

    if (cartItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-xs text-slate-400">
            <i data-lucide="shopping-bag" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
            El carrito de ventas está vacío. Agregá productos para comenzar.
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
      this.recalcPOS();
      return;
    }

    tbody.innerHTML = cartItems.map((item, idx) => {
      const subtotal = item.quantity * item.unit_price;
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3">
            <div class="font-bold text-slate-800 text-xs">${item.product_name}</div>
            <div class="text-[10px] text-slate-400 font-mono">${item.sku}</div>
          </td>
          <td class="py-2.5 px-3 text-slate-600">${item.unit_name}</td>
          <td class="py-2.5 px-3 text-center">
            <input type="number" min="1" value="${item.quantity}" onchange="window.ventasModule.updateCartQty(${idx}, this.value)" class="w-16 px-2 py-1 border border-slate-300 rounded text-center text-xs font-bold">
          </td>
          <td class="py-2.5 px-3 text-right font-medium text-slate-800">${Formatter.money(item.unit_price)}</td>
          <td class="py-2.5 px-3 text-right text-slate-500">${Formatter.money(item.unit_cost)}</td>
          <td class="py-2.5 px-3 text-right font-bold text-emerald-700">${Formatter.money(subtotal)}</td>
          <td class="py-2.5 px-3 text-center">
            <button onclick="window.ventasModule.removeFromCart(${idx})" class="text-rose-500 hover:text-rose-700 p-1">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    this.recalcPOS();
  },

  recalcPOS() {
    const rawSubtotal = cartItems.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0);
    const rawCost = cartItems.reduce((sum, it) => sum + (it.quantity * it.unit_cost), 0);

    const discountAmount = rawSubtotal * (discountPct / 100);
    const netSubtotal = rawSubtotal - discountAmount;
    const vatAmount = netSubtotal * 0.21;
    const total = netSubtotal + vatAmount;

    const grossMargin = total - rawCost;
    const grossMarginPct = total > 0 ? (grossMargin / total) * 100 : 0;

    // Actualizar elementos visuales
    const elSub = document.getElementById('summarySubtotal');
    const elDisc = document.getElementById('summaryDiscountAmount');
    const elVat = document.getElementById('summaryVat');
    const elTot = document.getElementById('summaryTotal');
    const elCost = document.getElementById('summaryCost');
    const elMarg = document.getElementById('summaryMargin');
    const elMargPct = document.getElementById('summaryMarginPct');
    const btnConfirm = document.getElementById('btnConfirmSale');

    if (elSub) elSub.textContent = Formatter.money(rawSubtotal);
    if (elDisc) elDisc.textContent = `- ${Formatter.money(discountAmount)}`;
    if (elVat) elVat.textContent = Formatter.money(vatAmount);
    if (elTot) elTot.textContent = Formatter.money(total);
    if (elCost) elCost.textContent = Formatter.money(rawCost);
    if (elMarg) elMarg.textContent = Formatter.money(grossMargin);
    if (elMargPct) elMargPct.textContent = Formatter.percent(grossMarginPct);

    if (btnConfirm) {
      btnConfirm.disabled = cartItems.length === 0;
    }
  },

  async confirmSale() {
    if (cartItems.length === 0) {
      alert('Agregá al menos un producto a la venta.');
      return;
    }

    const payMethod = document.getElementById('posPaymentMethod')?.value || 'Efectivo';
    const notes = document.getElementById('posNotes')?.value || '';

    // Validar límite de crédito si es en Cuenta Corriente
    if (payMethod === 'Cuenta Corriente') {
      if (!selectedCustomer) {
        alert('Para vender en Cuenta Corriente debés seleccionar un cliente registrado.');
        return;
      }
      if (!selectedCustomer.credit_account_enabled) {
        alert(`El cliente ${selectedCustomer.name} no tiene habilitada cuenta corriente.`);
        return;
      }
    }

    try {
      if (discountPct !== 0) throw Error('Los descuentos requieren validación y todavía no están habilitados en la venta central.');
      const {STAYCLEAN_SUPABASE_URL,STAYCLEAN_PUBLISHABLE_KEY}=await import('../supabase_public.js');
      const token=sessionStorage.getItem('stayclean_staff_access_token');
      if (!token) throw Error('Iniciá sesión de personal desde Pedidos online antes de registrar una venta.');
      const requestId=this.pendingPosId||(this.pendingPosId=crypto.randomUUID());
      const response=await fetch(STAYCLEAN_SUPABASE_URL+'/rest/v1/rpc/stayclean_staff_record_sale',{method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_sale:{request_id:requestId,customer_name:selectedCustomer?.name||'Consumidor Final',payment_method:payMethod,notes,items:cartItems.map(it=>({product_id:it.product_id||it.id,quantity:it.quantity}))}})});
      const sale=await response.json();
      if (!response.ok||!sale.success) throw Error(sale.message||'No se pudo registrar la venta');
      this.pendingPosId=null;
      cartItems=[];selectedCustomer=null;discountPct=0;
      window.app.showNotification('Venta central confirmada. Stock descontado en Supabase.', 'success');
      window.app.navigate('ventas');
    } catch(e) {alert('No se registró la venta: '+e.message);}

  },

  showTicket(saleId) {
    const sale = db.getSale(saleId);
    if (!sale) return;

    const modal = document.getElementById('ticketModal');
    const content = document.getElementById('ticketModalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="text-center pb-2 border-b border-dashed border-slate-300">
        <div class="font-bold text-sm">LIMPIEZA CAVIAHUE</div>
        <div class="text-[10px]">Insumos Descartables & Químicos</div>
        <div class="text-[10px]">Av. Los Pehuenes s/n - Caviahue, Neuquén</div>
        <div class="text-[10px]">CUIT: 30-71894215-4 • IVA Resp. Inscripto</div>
      </div>

      <div class="py-2 border-b border-dashed border-slate-300 space-y-0.5 text-[11px]">
        <div>COMPROBANTE: <span class="font-bold">${sale.sale_number}</span></div>
        <div>FECHA: ${Formatter.dateTime(sale.created_at || sale.date)}</div>
        <div>CLIENTE: <span class="font-bold">${sale.customer_name}</span></div>
        <div>FORMA DE PAGO: <span class="font-semibold">${sale.payment_method}</span></div>
        <div>VENDEDOR: ${sale.user_name || 'Esteban Caviahue'}</div>
      </div>

      <div class="py-2 border-b border-dashed border-slate-300 space-y-1">
        ${(sale.items || []).map(it => `
          <div class="flex justify-between items-start text-[11px]">
            <div class="max-w-[200px]">
              <div>${it.product_name}</div>
              <div class="text-[10px] text-slate-500">${it.quantity} x ${Formatter.money(it.unit_price)}</div>
            </div>
            <div class="font-bold">${Formatter.money(it.subtotal)}</div>
          </div>
        `).join('')}
      </div>

      <div class="py-2 space-y-1 text-[11px]">
        <div class="flex justify-between">
          <span>Subtotal:</span>
          <span>${Formatter.money(sale.subtotal)}</span>
        </div>
        ${sale.discount_amount > 0 ? `
          <div class="flex justify-between text-rose-600">
            <span>Descuento:</span>
            <span>- ${Formatter.money(sale.discount_amount)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between">
          <span>IVA (21%):</span>
          <span>${Formatter.money(sale.vat_amount)}</span>
        </div>
        <div class="flex justify-between text-sm font-bold pt-1 border-t border-dashed border-slate-400">
          <span>TOTAL:</span>
          <span>${Formatter.money(sale.total)}</span>
        </div>
      </div>

      <div class="text-center pt-2 text-[10px] text-slate-500 border-t border-dashed border-slate-300">
        ¡Gracias por elegir Limpieza Caviahue!<br>
        Envíos a domicilio en Caviahue y Copahue.
      </div>
    `;

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  promptCancelSale(saleId) {
    const sale = db.getSale(saleId);
    if (!sale) return;

    if (confirm(`¿Estás seguro de anular la venta ${sale.sale_number}? Esta acción devolverá todos los productos al inventario y revertirá la deuda del cliente si fue en Cuenta Corriente.`)) {
      try {
        db.cancelSale(saleId);
        window.app.showNotification(`Venta ${sale.sale_number} anulada correctamente y stock restaurado.`, 'info');
        window.app.navigate('ventas');
      } catch (e) {
        alert(e.message);
      }
    }
  }
};
