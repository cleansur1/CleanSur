// Módulo de Tienda Nube / Catálogo Virtual para el Panel de Administración ERP
// Gestión completa de catálogo: Crear nuevos productos, editar información, precios, fotos y stock
import { db } from '../db.js';
import { Formatter } from '../models.js';

const publicUrl = 'https://cleansur1.github.io/CleanSur/tienda/';
const shareUrl = 'https://wa.me/?text=' + encodeURIComponent(
  `¡Hola! Te compartimos el catálogo de CleanSur. Podés armar tu pedido acá: ${publicUrl}`
);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const TiendaView = {
  currentCategoryFilter: 'ALL',
  searchQuery: '',

  render(container) {
    this.container = container;
    const allProducts = db.getProducts();
    const categories = db.getCategories();
    const orders = db.getOrders() || [];
    const webOrders = orders.filter(o => o.status === 'Nuevo' || (o.notes && o.notes.includes('Tienda')));
    const central = window.app.centralReadOnly;

    // Filtrar productos para la vista previa administrativa
    const products = allProducts.filter(p => {
      const matchCat = this.currentCategoryFilter === 'ALL' || p.category_id === this.currentCategoryFilter;
      const q = this.searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        p.name.toLowerCase().includes(q) || 
        (p.brand || '').toLowerCase().includes(q) || 
        (p.sku || '').toLowerCase().includes(q) || 
        (p.presentation || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-7xl mx-auto">
        
        <!-- ======================================================== -->
        <!-- 1. PANEL DE CONTROL DE TIENDA NUBE & ACCESO PÚBLICO     -->
        <!-- ======================================================== -->
        <div class="bg-gradient-to-r from-[#071d36] via-[#0E3A6B] to-[#071d36] text-white rounded-2xl p-6 sm:p-7 shadow-xl border border-[#4EA1DD]/40">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            
            <div class="space-y-2 max-w-2xl">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#4EA1DD]/20 text-[#8FD0F4] border border-[#4EA1DD]/40">
                  <i data-lucide="globe" class="w-3.5 h-3.5 mr-1.5 text-[#4EA1DD]"></i> Tienda Online Pública para Clientes
                </span>
                <span class="text-xs text-slate-300">CleanSur Caviahue</span>
              </div>
              <h1 class="text-2xl sm:text-3xl font-black tracking-tight">Catálogo Web CleanSur</h1>
              <p class="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                Compartí el catálogo con tus clientes y editá los datos de los productos desde el ERP.
              </p>
              
              <!-- Botón Principal: Agregar Producto a la Tienda -->
              <div class="pt-2">
                ${central ? '' : `<button onclick="window.tiendaAdminModule.openProductEditor()" class="px-5 py-2.5 bg-[#4EA1DD] hover:bg-[#8FD0F4] hover:text-[#0E3A6B] text-white rounded-xl text-xs font-black shadow-lg shadow-[#0E3A6B]/50 transition flex items-center gap-2 transform hover:-translate-y-0.5">
                  <i data-lucide="plus-circle" class="w-4 h-4"></i>
                  <span>+ Agregar Nuevo Producto a la Tienda</span>
                </button>`}
              </div>
            </div>

            <!-- Botones del Enlace para Clientes -->
            <div class="bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-[#4EA1DD]/30 space-y-3 shrink-0 lg:w-96">
              <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Enlace Directo para Clientes:</span>
              <div class="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-700">
                <input type="text" id="erpPublicTiendaUrl" readonly value="${publicUrl}" class="bg-transparent text-xs text-[#8FD0F4] font-mono flex-1 outline-none truncate">
                <button type="button" data-copy-store-link onclick="window.tiendaAdminModule.copyPublicLink()" class="px-3 py-1.5 bg-[#0E3A6B] hover:bg-[#4EA1DD] text-white rounded-md text-xs font-bold transition flex items-center gap-1 shadow-sm shrink-0">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                  <span>Copiar Link</span>
                </button>
              </div>

              <div class="flex gap-2">
                <a href="${publicUrl}" target="_blank" rel="noopener noreferrer" class="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold text-center transition flex items-center justify-center gap-1.5">
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  <span>Abrir Tienda Cliente</span>
                </a>
                <a href="${shareUrl}" target="_blank" rel="noopener noreferrer" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5">
                  <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
                  <span>Compartir por WhatsApp</span>
                </a>
              </div>
            </div>

          </div>

          <!-- Indicadores de la Tienda -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
            <div class="bg-white/5 rounded-xl p-3">
              <span class="text-[10px] text-slate-400 uppercase font-semibold">Total Catálogo</span>
              <p class="text-xl font-bold text-white mt-0.5">${allProducts.length}</p>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
              <span class="text-[10px] text-slate-400 uppercase font-semibold">En Stock Inmediato</span>
              <p class="text-xl font-bold text-emerald-400 mt-0.5">${allProducts.filter(p => (p.current_stock || 0) > 0).length}</p>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
              <span class="text-[10px] text-slate-400 uppercase font-semibold">Sin Stock (Agotados)</span>
              <p class="text-xl font-bold text-rose-400 mt-0.5">${allProducts.filter(p => (p.current_stock || 0) <= 0).length}</p>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
              <span class="text-[10px] text-slate-400 uppercase font-semibold">Pedidos Web Pendientes</span>
              <p class="text-xl font-bold text-amber-400 mt-0.5">${webOrders.length}</p>
            </div>
          </div>
        </div>

        <!-- ======================================================== -->
        <!-- 2. PEDIDOS ENTRANTES DE LA TIENDA WEB                    -->
        <!-- ======================================================== -->
        ${webOrders.length > 0 ? `
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
                  <i data-lucide="inbox" class="w-4 h-4"></i>
                </span>
                <div>
                  <h3 class="text-sm font-bold text-amber-900">Nuevos Pedidos Recibidos desde la Tienda Online</h3>
                  <p class="text-xs text-amber-700">Tus clientes cargaron su perfil de entrega y confirmaron el pedido.</p>
                </div>
              </div>
              <button onclick="window.app.navigate('pedidos')" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition">
                Gestionar en Módulo Pedidos
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              ${webOrders.slice(0, 3).map(o => `
                <div class="p-3 bg-white rounded-lg border border-amber-200 shadow-2xs space-y-1 text-xs">
                  <div class="flex justify-between items-center">
                    <span class="font-bold text-slate-800">${o.order_number}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">${o.status}</span>
                  </div>
                  <p class="text-slate-600"><strong>Cliente:</strong> ${o.customer_name}</p>
                  <p class="text-slate-500 truncate"><strong>Entrega:</strong> ${o.delivery_address || 'Caviahue'}</p>
                  <div class="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span class="text-slate-400">${(o.items || []).length} productos</span>
                    <span class="font-bold text-emerald-700 font-mono">${Formatter.money(o.total)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- ======================================================== -->
        <!-- 3. GESTIÓN Y EDICIÓN DE PRODUCTOS EN TIENDA              -->
        <!-- ======================================================== -->
        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-slate-700">Filtrar por Rubro:</span>
              <button type="button" data-store-category onclick="window.tiendaAdminModule.filterCat('ALL')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${this.currentCategoryFilter === 'ALL' ? 'bg-[#1f4e5b] text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}">
                Todos (${allProducts.length})
              </button>
              ${categories.map(c => `
                <button type="button" data-store-category onclick="window.tiendaAdminModule.filterCat('${c.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition ${this.currentCategoryFilter === c.id ? 'bg-[#1f4e5b] text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}">
                  ${c.name}
                </button>
              `).join('')}
            </div>

            <!-- Buscador rápido en el catálogo -->
            <div class="relative w-full md:w-72">
              <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
              <input type="text" id="erpTiendaSearch" placeholder="Buscar por nombre, SKU, marca..." value="${escapeHtml(this.searchQuery)}" oninput="window.tiendaAdminModule.handleSearch(event)" class="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#1f4e5b] outline-none">
            </div>

          </div>
        </div>

        <!-- ======================================================== -->
        <!-- 4. CATÁLOGO CON BOTONES DE EDICIÓN EN CADA PRODUCTO      -->
        <!-- ======================================================== -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-bold text-slate-800">
              Productos en Tienda Nube (${products.length})
            </h2>
            ${central ? '' : `<button onclick="window.tiendaAdminModule.openProductEditor()" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>+ Agregar Producto</span>
            </button>`}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            ${products.map((p, idx) => {
              const inStock = (p.current_stock || 0) > 0;
              const salePrice = p.sale_price || 0;
              let referencePrice = Number(p.reference_price) || 0;
              let discountPct = 0;
              if (referencePrice > salePrice) {
                discountPct = Math.round(((referencePrice - salePrice) / referencePrice) * 100);
              } else {
                const discountPcts = [35, 25, 40, 50, 30, 20, 15];
                discountPct = discountPcts[idx % discountPcts.length];
                referencePrice = Math.round(salePrice / (1 - (discountPct / 100)));
              }
              const imgUrl = db.getProductImage(p);

              return `
                <div class="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-200 flex flex-col justify-between overflow-hidden group relative">
                  
                  <!-- Contenedor Superior: Imagen, Badges y Botón Editar Superior -->
                  <div>
                    <div class="relative bg-slate-50 aspect-square w-full overflow-hidden flex items-center justify-center p-4">
                      
                      <!-- Badges Flotantes (Izquierda) -->
                      <div class="absolute top-3 left-3 flex flex-col gap-1.5 z-10 items-start">
                        ${!inStock ? `
                          <span class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-slate-800 border border-slate-300 shadow-xs">
                            Agotado
                          </span>
                        ` : `
                          <span class="px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#2b5158] text-white shadow-xs">
                            -${discountPct}% OFF
                          </span>
                        `}
                        ${p.promo_badge ? `
                          <span class="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-rose-600 text-white shadow-xs uppercase">
                            ${p.promo_badge}
                          </span>
                        ` : ''}
                      </div>

                      <!-- BOTÓN EDITAR EN CADA PRODUCTO (Esquina Superior Derecha) -->
                      <div class="absolute top-3 right-3 z-20">
                        <button onclick="${central ? `window.app.navigate('productos', { editId: '${p.id}' })` : `window.tiendaAdminModule.openProductEditor('${p.id}')`}" class="px-2.5 py-1.5 bg-white/95 hover:bg-white text-slate-800 hover:text-blue-600 rounded-lg text-xs font-bold shadow-md border border-slate-200 flex items-center gap-1 transition" title="Editar producto">
                          <i data-lucide="edit-3" class="w-3.5 h-3.5 text-blue-600"></i>
                          <span>Editar</span>
                        </button>
                      </div>

                      <!-- Foto del Producto -->
                      <img src="${imgUrl}" alt="${p.name}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300">
                    </div>

                    <!-- Datos del Producto -->
                    <div class="p-4 space-y-1.5">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                        ${p.brand || 'Caviahue'} • SKU: ${p.sku || '-'}
                      </span>

                      <h3 class="text-[13px] sm:text-sm font-bold text-slate-900 line-clamp-2 min-h-[2.5rem] leading-snug" title="${p.name}">
                        ${p.name}
                      </h3>

                      <p class="text-[11px] text-slate-500 truncate">
                        ${p.presentation || 'Presentación profesional'}
                      </p>

                      <!-- Precios -->
                      <div class="pt-2 flex items-baseline gap-2">
                        <span class="text-base sm:text-lg font-black text-[#0E3A6B]">
                          ${Formatter.money(salePrice)}
                        </span>
                        <span class="text-xs text-slate-400 line-through">
                          ${Formatter.money(referencePrice)}
                        </span>
                      </div>

                      <!-- Información administrativa de stock y costo -->
                      <div class="pt-1 flex justify-between items-center text-[11px] text-slate-500 border-t border-slate-100">
                        <span>Stock: <strong class="${inStock ? 'text-emerald-700' : 'text-rose-600'}">${p.current_stock || 0} ${p.sale_unit || 'U'}</strong></span>
                        <span>Costo: <strong class="text-slate-700 font-mono">${Formatter.money(p.caviahue_cost || 0)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <!-- BOTÓN EDITAR COMPLETO AL PIE DE LA TARJETA -->
                  <div class="p-4 pt-0 space-y-2">
                    <button onclick="${central ? `window.app.navigate('productos', { editId: '${p.id}' })` : `window.tiendaAdminModule.openProductEditor('${p.id}')`}" class="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-200">
                      <i data-lucide="edit" class="w-3.5 h-3.5 text-blue-600"></i>
                      <span>Editar Info, Precios y Fotos</span>
                    </button>
                  </div>

                </div>
              `;
            }).join('')}
          </div>

          ${products.length === 0 ? `
            <div class="bg-white p-12 rounded-xl text-center text-slate-400 border border-slate-200 space-y-3">
              <i data-lucide="package-search" class="w-10 h-10 mx-auto text-slate-300"></i>
              <p class="text-sm font-semibold text-slate-600">No hay productos que coincidan con los filtros</p>
              ${central ? '' : `<button onclick="window.tiendaAdminModule.openProductEditor()" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold">
                + Crear un producto nuevo
              </button>`}
            </div>
          ` : ''}

        </div>

      </div>

      <!-- ======================================================== -->
      <!-- MODAL COMPLETO: CREAR / EDITAR PRODUCTO TIENDA NUBE      -->
      <!-- ======================================================== -->
      <div id="erpProductEditorModal" class="hidden fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-fade-in" id="erpProductEditorContent">
          <!-- Inyectado dinámicamente -->
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.setupAdminActions();
  },

  setupAdminActions() {
    const view = this;

    window.tiendaAdminModule = {
      filterCat(catId) {
        view.currentCategoryFilter = catId;
        view.render(view.container);
      },

      handleSearch(e) {
        const { value, selectionStart, selectionEnd } = e.target;
        view.searchQuery = value;
        view.render(view.container);
        const search = view.container.querySelector('#erpTiendaSearch');
        search.focus();
        search.setSelectionRange(selectionStart, selectionEnd);
      },

      async copyPublicLink() {
        const input = document.getElementById('erpPublicTiendaUrl');
        if (!input) return;
        try {
          await navigator.clipboard.writeText(input.value);
        } catch {
          input.focus();
          input.select();
          let copied = false;
          try { copied = document.execCommand('copy'); } catch {}
          if (!copied) {
            window.app.showNotification('Enlace seleccionado. Presioná Ctrl+C (o ⌘+C) para copiarlo.', 'info');
            return;
          }
        }
        window.app.showNotification('Enlace de la tienda copiado', 'success');
      },

      // Abrir Modal de Edición / Creación de Producto
      openProductEditor(productId = null) {
        const modal = document.getElementById('erpProductEditorModal');
        const content = document.getElementById('erpProductEditorContent');
        if (!modal || !content) return;

        const isEdit = !!productId;
        const p = isEdit ? db.getProduct(productId) : {
          name: '',
          sku: `SKU-${Date.now().toString().slice(-4)}`,
          barcode: '',
          category_id: 'cat-1',
          brand: 'StayClean',
          presentation: '',
          sale_unit: 'Unidad',
          buy_unit: 'Unidad',
          conversion_factor: 1,
          caviahue_cost: 0,
          sale_price: 0,
          reference_price: 0,
          current_stock: 10,
          min_stock: 5,
          max_stock: 50,
          image_url: '',
          promo_badge: '',
          active: true,
          description: ''
        };

        const categories = db.getCategories();

        content.innerHTML = `
          <!-- Header del Modal StayClean -->
          <div class="p-5 border-b border-slate-200 bg-[#0E3A6B] text-white flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <i data-lucide="${isEdit ? 'edit' : 'plus-circle'}" class="w-4 h-4 text-[#8FD0F4]"></i>
              </div>
              <div>
                <h3 class="text-sm font-bold">${isEdit ? 'Editar Producto en Tienda StayClean' : 'Agregar Nuevo Producto a StayClean'}</h3>
                <p class="text-[11px] text-[#8FD0F4]">Modificá fotos, precios, características y stock</p>
              </div>
            </div>
            <button onclick="window.tiendaAdminModule.closeProductEditor()" class="text-white/80 hover:text-white p-1">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <!-- Formulario de Producto -->
          <form id="erpProductForm" onsubmit="window.tiendaAdminModule.saveProduct(event, '${productId || ''}')" class="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
            
            <!-- 1. FOTO / IMAGEN DEL PRODUCTO (¡PROMINENTE!) -->
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <label class="block font-bold text-slate-800 text-xs uppercase tracking-wider">
                📷 Foto del Producto para la Tienda
              </label>

              <div class="flex flex-col sm:flex-row gap-4 items-center">
                <!-- Preview en vivo -->
                <div class="w-32 h-32 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center p-2 shrink-0 shadow-2xs relative">
                  <img id="editProductImagePreview" src="${p.image_url || db.getProductImage(p)}" alt="Preview" class="max-h-full max-w-full object-contain">
                </div>

                <!-- Controles para subir imagen o pegar URL -->
                <div class="flex-1 space-y-2.5 w-full">
                  <div>
                    <label class="block text-[11px] font-bold text-slate-700 mb-1">Subir Foto desde tu PC o Celular:</label>
                    <input type="file" id="editProductFileInput" accept="image/*" onchange="window.tiendaAdminModule.handleImageFileUpload(event)" class="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-[#1f4e5b] hover:file:bg-teal-100 cursor-pointer">
                    <p class="text-[10px] text-slate-400 mt-0.5">Se optimiza automáticamente para no ocupar espacio de más.</p>
                  </div>

                  <div>
                    <label class="block text-[11px] font-bold text-slate-700 mb-1">O Pegar Enlace / URL de la imagen:</label>
                    <input type="text" id="editProductImageUrl" value="${p.image_url || ''}" oninput="window.tiendaAdminModule.handleImageUrlInput(event)" placeholder="https://ejemplo.com/foto-producto.jpg" class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#1f4e5b]">
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. DATOS PRINCIPALES -->
            <div class="space-y-3">
              <h4 class="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b pb-1">Información General</h4>
              
              <div>
                <label class="block font-bold text-slate-700 mb-1">Nombre Completo del Producto <span class="text-rose-500">*</span></label>
                <input type="text" id="editProductName" required value="${p.name}" placeholder="Ej: Lavandina Concentrada x 5 Litros" class="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-[#1f4e5b] outline-none">
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Código / SKU <span class="text-rose-500">*</span></label>
                  <input type="text" id="editProductSku" required value="${p.sku || ''}" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Código de Barras (Opcional)</label>
                  <input type="text" id="editProductBarcode" value="${p.barcode || ''}" placeholder="EAN-13" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono outline-none">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Marca</label>
                  <input type="text" id="editProductBrand" value="${p.brand || 'Limpieza Caviahue'}" class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none">
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Categoría / Rubro <span class="text-rose-500">*</span></label>
                  <select id="editProductCategory" required class="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none">
                    ${categories.map(c => `
                      <option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${c.name}</option>
                    `).join('')}
                  </select>
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Presentación / Formato</label>
                  <input type="text" id="editProductPresentation" value="${p.presentation || ''}" placeholder="Ej: Bidón x 5 Litros / Caja x 4 unid / Bulto x 12" class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none">
                </div>
              </div>
            </div>

            <!-- 3. PRECIOS Y DESCUENTOS ESTILO VOLTRA -->
            <div class="p-4 rounded-xl bg-teal-50/50 border border-teal-200/60 space-y-3">
              <h4 class="font-bold text-[#1f4e5b] uppercase tracking-wider text-[11px] border-b border-teal-200 pb-1">Precios para la Tienda Nube</h4>
              
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Precio Venta Tienda ($ ARS) <span class="text-rose-500">*</span></label>
                  <input type="number" id="editProductSalePrice" required value="${p.sale_price || 0}" step="10" oninput="window.tiendaAdminModule.recalcMargin()" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold text-teal-900 bg-white outline-none">
                  <span class="text-[10px] text-slate-500">Precio real que paga el cliente</span>
                </div>

                <div>
                  <label class="block font-bold text-slate-700 mb-1">Precio de Lista / Tachado ($ ARS)</label>
                  <input type="number" id="editProductReferencePrice" value="${p.reference_price || ''}" step="10" placeholder="Ej: $ 15.000" oninput="window.tiendaAdminModule.recalcDiscountBadge()" class="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none">
                  <span id="editDiscountBadgePreview" class="text-[10px] font-bold text-teal-700 block mt-0.5">Calculando descuento...</span>
                </div>

                <div>
                  <label class="block font-bold text-slate-700 mb-1">Precio Mayorista ($ ARS)</label>
                  <input type="number" id="editProductWholesalePrice" value="${p.wholesale_price || ''}" step="10" class="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none">
                  <span class="text-[10px] text-slate-500">Tarifa para compras por bulto</span>
                </div>
              </div>

              <!-- Costo Puesto en Caviahue y Margen Calculado -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-teal-100">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Costo Puesto Caviahue ($ ARS)</label>
                  <input type="number" id="editProductCaviahueCost" value="${p.caviahue_cost || 0}" step="10" oninput="window.tiendaAdminModule.recalcMargin()" class="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none">
                </div>

                <div>
                  <span class="block font-bold text-slate-700 mb-1">Ganancia Neta Estimada</span>
                  <div id="editProductMarginAmount" class="p-2 rounded-lg bg-white border border-slate-200 font-mono font-bold text-emerald-700 text-xs">
                    ${Formatter.money((p.sale_price || 0) - (p.caviahue_cost || 0))}
                  </div>
                </div>

                <div>
                  <span class="block font-bold text-slate-700 mb-1">Margen Real %</span>
                  <div id="editProductMarginPct" class="p-2 rounded-lg bg-white border border-slate-200 font-mono font-bold text-indigo-700 text-xs">
                    ${Formatter.percent(((p.sale_price || 0) - (p.caviahue_cost || 0)) / (p.sale_price || 1) * 100)}
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. STOCK & ALMACÉN -->
            <div class="space-y-3">
              <h4 class="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b pb-1">Stock & Almacén</h4>
              
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Stock Actual <span class="text-rose-500">*</span></label>
                  <input type="number" id="editProductStock" required value="${p.current_stock || 0}" class="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold outline-none">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Stock Mínimo</label>
                  <input type="number" id="editProductMinStock" value="${p.min_stock || 5}" class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Unidad de Venta</label>
                  <input type="text" id="editProductSaleUnit" value="${p.sale_unit || 'Unidad'}" placeholder="Unidad / Litro / Caja" class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Ubicación Depósito</label>
                  <input type="text" id="editProductLocation" value="${p.location || 'Depósito Caviahue'}" class="w-full p-2 border border-slate-300 rounded-lg text-xs outline-none">
                </div>
              </div>
            </div>

            <!-- 5. ETIQUETA DESTACADA & DESCRIPCIÓN -->
            <div class="space-y-3">
              <h4 class="font-bold text-slate-800 uppercase tracking-wider text-[11px] border-b pb-1">Etiqueta & Descripción Tienda</h4>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">Etiqueta Destacada (Badge)</label>
                  <select id="editProductPromoBadge" class="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none">
                    <option value="" ${!p.promo_badge ? 'selected' : ''}>Sin etiqueta especial</option>
                    <option value="NUEVO" ${p.promo_badge === 'NUEVO' ? 'selected' : ''}>NUEVO (Rojo)</option>
                    <option value="HOTELERÍA" ${p.promo_badge === 'HOTELERÍA' ? 'selected' : ''}>HOTELERÍA (Azul)</option>
                    <option value="GASTRONOMÍA" ${p.promo_badge === 'GASTRONOMÍA' ? 'selected' : ''}>GASTRONOMÍA (Ámbar)</option>
                    <option value="OFERTA" ${p.promo_badge === 'OFERTA' ? 'selected' : ''}>OFERTA ESPECIAL (Verde)</option>
                    <option value="TOP VENTAS" ${p.promo_badge === 'TOP VENTAS' ? 'selected' : ''}>TOP VENTAS (Violeta)</option>
                  </select>
                </div>

                <div class="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="editProductActive" ${p.active !== false ? 'checked' : ''} class="w-4 h-4 rounded text-teal-600 focus:ring-teal-500">
                  <label for="editProductActive" class="font-bold text-slate-800 cursor-pointer">
                    Visible y Activo en la Tienda Online
                  </label>
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">Descripción y Características</label>
                <textarea id="editProductDescription" rows="2" placeholder="Detalles de rendimiento, dilución sugerida, usos o especificaciones para el cliente..." class="w-full p-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#1f4e5b]">${p.description || ''}</textarea>
              </div>
            </div>

            <!-- Botones de Acción -->
            <div class="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                ${isEdit ? `
                  <button type="button" onclick="window.tiendaAdminModule.deleteProduct('${productId}')" class="px-3 py-2 text-rose-600 hover:text-rose-800 font-bold hover:bg-rose-50 rounded-lg transition flex items-center gap-1">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                    <span>Eliminar Producto</span>
                  </button>
                ` : '<span></span>'}
              </div>

              <div class="flex gap-2">
                <button type="button" onclick="window.tiendaAdminModule.closeProductEditor()" class="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" class="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-md transition flex items-center gap-1.5">
                  <i data-lucide="check" class="w-4 h-4"></i>
                  <span>${isEdit ? 'Guardar Cambios' : 'Crear Producto'}</span>
                </button>
              </div>
            </div>

          </form>
        `;

        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
        window.tiendaAdminModule.recalcDiscountBadge();
      },

      closeProductEditor() {
        const modal = document.getElementById('erpProductEditorModal');
        if (modal) modal.classList.add('hidden');
      },

      // Subida de imagen y compresión a canvas para no sobrecargar almacenamiento
      handleImageFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600;
            const scaleSize = MAX_WIDTH / img.width;
            const width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
            const height = img.width > MAX_WIDTH ? (img.height * scaleSize) : img.height;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

            const preview = document.getElementById('editProductImagePreview');
            const urlInput = document.getElementById('editProductImageUrl');
            if (preview) preview.src = dataUrl;
            if (urlInput) urlInput.value = dataUrl;
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      },

      handleImageUrlInput(e) {
        const val = e.target.value.trim();
        const preview = document.getElementById('editProductImagePreview');
        if (preview && val) {
          preview.src = val;
        }
      },

      recalcDiscountBadge() {
        const salePrice = Number(document.getElementById('editProductSalePrice')?.value) || 0;
        const refPrice = Number(document.getElementById('editProductReferencePrice')?.value) || 0;
        const badgeLabel = document.getElementById('editDiscountBadgePreview');
        if (!badgeLabel) return;

        if (refPrice > salePrice && salePrice > 0) {
          const pct = Math.round(((refPrice - salePrice) / refPrice) * 100);
          badgeLabel.textContent = `Generará badge: -${pct}% OFF en la tienda`;
          badgeLabel.className = 'text-[10px] font-bold text-emerald-700 block mt-0.5';
        } else {
          badgeLabel.textContent = 'Sin precio tachado (se calculará sugerido)';
          badgeLabel.className = 'text-[10px] text-slate-400 block mt-0.5';
        }
      },

      recalcMargin() {
        const salePrice = Number(document.getElementById('editProductSalePrice')?.value) || 0;
        const caviahueCost = Number(document.getElementById('editProductCaviahueCost')?.value) || 0;
        const marginEl = document.getElementById('editProductMarginAmount');
        const pctEl = document.getElementById('editProductMarginPct');

        const gain = salePrice - caviahueCost;
        const pct = salePrice > 0 ? (gain / salePrice) * 100 : 0;

        if (marginEl) marginEl.textContent = Formatter.money(gain);
        if (pctEl) pctEl.textContent = Formatter.percent(pct);
        this.recalcDiscountBadge();
      },

      saveProduct(e, productId) {
        e.preventDefault();

        const productData = {
          name: document.getElementById('editProductName').value.trim(),
          sku: document.getElementById('editProductSku').value.trim(),
          barcode: document.getElementById('editProductBarcode').value.trim(),
          brand: document.getElementById('editProductBrand').value.trim(),
          category_id: document.getElementById('editProductCategory').value,
          presentation: document.getElementById('editProductPresentation').value.trim(),
          sale_price: Number(document.getElementById('editProductSalePrice').value) || 0,
          reference_price: Number(document.getElementById('editProductReferencePrice').value) || 0,
          wholesale_price: Number(document.getElementById('editProductWholesalePrice').value) || 0,
          caviahue_cost: Number(document.getElementById('editProductCaviahueCost').value) || 0,
          current_stock: Number(document.getElementById('editProductStock').value) || 0,
          min_stock: Number(document.getElementById('editProductMinStock').value) || 5,
          sale_unit: document.getElementById('editProductSaleUnit').value.trim() || 'Unidad',
          location: document.getElementById('editProductLocation').value.trim() || 'Depósito Caviahue',
          image_url: document.getElementById('editProductImageUrl').value.trim(),
          promo_badge: document.getElementById('editProductPromoBadge').value,
          active: document.getElementById('editProductActive').checked,
          description: document.getElementById('editProductDescription').value.trim()
        };

        if (productId) {
          productData.id = productId;
        }

        try {
          db.saveProduct(productData);
          this.closeProductEditor();
          alert(`¡Producto "${productData.name}" guardado exitosamente! Ya está actualizado en el ERP y en la Tienda Nube.`);
          view.render(view.container);
        } catch (err) {
          alert('Error al guardar producto: ' + err.message);
        }
      },

      deleteProduct(productId) {
        const p = db.getProduct(productId);
        if (!p) return;
        if (confirm(`¿Estás seguro de que querés eliminar "${p.name}" del catálogo?`)) {
          db.deleteProduct(productId);
          this.closeProductEditor();
          alert('Producto eliminado correctamente.');
          view.render(view.container);
        }
      }
    };
  }
};
