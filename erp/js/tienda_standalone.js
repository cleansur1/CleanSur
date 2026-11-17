// Controlador de Tienda Nube / Catálogo Público para Clientes
// StayClean - Distribuidora Limpieza y Descartables (voltra.com.ar inspired)
import { db } from './db.js';
import { Formatter } from './models.js';
import { staycleanPublicCatalog, staycleanAuthSession, staycleanAuthSignUp, staycleanAuthSignIn, staycleanAuthSignOut, staycleanAuthReset, staycleanAuthToken, staycleanCustomerProfile, staycleanCustomerOrders, staycleanAuthenticatedOrder, staycleanCreateMpCheckout, staycleanMpCheckoutStatus } from './supabase_public.js';

class TiendaStandaloneApp {
  constructor() {
    this.products = [];
    this.cart = this.loadCart();
    this.pendingRequestId = sessionStorage.getItem('stayclean_pending_order_id') || null;
    this.customerProfile = null;
    this.activeFilters = {
      availability: 'all',
      price: 'all',
      category: 'all',
      search: '',
      sort: 'featured'
    };
    this.companyWhatsApp = '5492942498120'; // WhatsApp de StayClean Caviahue
  }

  init() {
    this.loadProducts();
    this.restoreCustomerSession().then(() => this.handleMpReturn());
    this.setupEventListeners();
    this.updateProfileUI();
    this.updateCartBadge();
    this.applyFilters();
    if (window.lucide) window.lucide.createIcons();
  }

  loadCart() {
    try {
      const saved = localStorage.getItem('caviahue_tienda_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  saveCart() {
    localStorage.setItem('caviahue_tienda_cart', JSON.stringify(this.cart));
    this.updateCartBadge();
  }

  async restoreCustomerSession(){
    if(!await staycleanAuthToken()){this.customerProfile=null;this.updateProfileUI();return;}
    try{const p=await staycleanCustomerProfile();if(p?.registered){this.customerProfile={name:p.name,phone:p.phone,address:p.address,zone:p.city,email:p.email};this.updateProfileUI();}}
    catch(e){console.error('No se pudo restaurar el perfil',e);}
  }
  async saveCustomerProfileData(profile){
    const p=await staycleanCustomerProfile({name:profile.name,phone:profile.phone,address:profile.address,city:/copahue/i.test(profile.zone||'')?'Copahue':'Caviahue'});
    this.customerProfile={...profile,email:p.email};this.updateProfileUI();
  }

  async showOrderReceipts(selectNumber=null){
    const orders=await staycleanCustomerOrders();
    if(!orders.length){alert('Todavía no tenés pedidos.');return;}
    const target=selectNumber?orders.find(o=>o.number===selectNumber):null;
    const selected=target||orders[Number(prompt('Elegí el número del pedido para ver su comprobante:\\n'+orders.map((o,i)=>(i+1)+'. '+o.number+' · $'+Number(o.total).toLocaleString('es-AR')).join('\\n'))-1)];
    if(!selected)return;
    const profile=await staycleanCustomerProfile();
    const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=x=>'$ '+Number(x||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const lines=Array.isArray(selected.items)?selected.items:[];
    const rows=lines.map(item=>'<tr><td>'+esc(item.product_name)+'</td><td>'+esc(item.quantity)+' '+esc(item.unit_name||'')+'</td><td>'+money(item.unit_price)+'</td><td>'+money(item.subtotal)+'</td></tr>').join('');
    const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante '+esc(selected.number)+'</title><style>body{font-family:Arial,sans-serif;color:#172b46;max-width:850px;margin:36px auto;padding:16px}header{border-bottom:3px solid #0e3a6b;padding-bottom:16px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:12px 8px;text-align:left;border-bottom:1px solid #ddd}th{background:#f2f5f9}.total{text-align:right;font-size:23px;font-weight:bold;margin-top:25px}.note{font-size:12px;color:#555;margin-top:30px}.actions{margin-top:20px}@media print{.actions{display:none}body{margin:0}}</style></head><body><header><h1>StayClean</h1><p>Comprobante de compra · No válido como factura fiscal</p></header><h2>Pedido '+esc(selected.number)+'</h2><p>Fecha: '+esc(new Date(selected.date).toLocaleString('es-AR'))+'<br>Estado: '+esc(selected.status)+'<br>Cliente: '+esc(profile.name)+'<br>Entrega: '+esc(profile.address)+', '+esc(profile.city)+'</p><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead><tbody>'+rows+'</tbody></table><p class="total">Total: '+money(selected.total)+'</p><p class="note">Este documento acredita el detalle del pedido. No constituye factura electrónica de ARCA ni comprobante de pago.</p><div class="actions"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div></body></html>';
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async openAccountDialog(){
    const active=!!(await staycleanAuthToken());
    const action=prompt(active?'Cuenta StayClean: escribí PEDIDOS para ver tus compras, SALIR para cerrar sesión o PERFIL para editar tus datos.':'Cuenta StayClean: escribí REGISTRO, INGRESAR o RECUPERAR:');
    if(!action)return;
    const cmd=action.trim().toUpperCase();
    try{
      if(cmd==='SALIR'){await staycleanAuthSignOut();this.customerProfile=null;this.updateProfileUI();alert('Sesión cerrada');return;}
      if(cmd==='PEDIDOS'){await this.showOrderReceipts();return;}
      if(cmd==='PERFIL'){this.openProfileModal();return;}
      if(cmd==='RECUPERAR'){const email=prompt('Correo de tu cuenta');if(email){await staycleanAuthReset(email);alert('Si existe una cuenta, recibirás instrucciones por correo.')}return;}
      if(cmd==='REGISTRO'||cmd==='INGRESAR'){
        const email=prompt('Correo electrónico');if(!email)return;
        const password=prompt('Contraseña (mínimo 8 caracteres)');if(!password)return;
        if(cmd==='REGISTRO'){await staycleanAuthSignUp(email,password);alert('Revisá tu correo para confirmar la cuenta. Luego elegí INGRESAR.');return;}
        await staycleanAuthSignIn(email,password);await this.restoreCustomerSession();
        if(!this.customerProfile)this.openProfileModal();else alert('Sesión iniciada. Tus datos ya están disponibles.');
        return;
      }
      alert('Opción no reconocida');
    }catch(e){alert('Cuenta StayClean: '+e.message);}
  }

  async loadProducts() {
    // Catálogo remoto: jamás mostrar stock local como si fuera compartido.
    try {
      const rows = await staycleanPublicCatalog();
      this.products = rows.map(p => ({
        ...p, current_stock: Number(p.available_stock),
        sale_price: Number(p.sale_price), in_stock: Number(p.available_stock) > 0,
        img_url: p.image_url || '../erp/assets/stayclean-logo.jpg',
        has_options: false, promo_badges: [], discount_pct: 0,
        reference_price: Number(p.sale_price)
      }));
      this.applyFilters();
    } catch (error) {
      this.products = [];
      this.applyFilters();
      console.error('No se pudo cargar el catálogo de Supabase', error);
      alert('No se pudo conectar al catálogo de StayClean. Intentá nuevamente más tarde.');
    }
    return;
    // Cargar productos del ERP con enriquecimiento de catálogo estilo Voltra
    const raw = db.getProducts().filter(p => p.active !== false);
    
    this.products = raw.map((p, idx) => {
      const salePrice = p.sale_price || 0;
      // Precios de referencia / comparación tachados para generar badges -XX% OFF reales
      let referencePrice = Number(p.reference_price) || 0;
      let discountPct = 0;
      if (referencePrice > salePrice) {
        discountPct = Math.round(((referencePrice - salePrice) / referencePrice) * 100);
      } else {
        const discountPcts = [35, 25, 40, 50, 30, 20, 15];
        discountPct = discountPcts[idx % discountPcts.length];
        referencePrice = Math.round(salePrice / (1 - (discountPct / 100)));
      }

      // Identificar si tiene presentaciones / opciones para el botón Voltra
      const hasOptions = p.presentation && (
        p.presentation.toLowerCase().includes('caja') ||
        p.presentation.toLowerCase().includes('bulto') ||
        p.presentation.toLowerCase().includes('bidón') ||
        p.presentation.toLowerCase().includes('pack')
      );

      // Tags promocionales (NUEVO, HOTELERÍA, GASTRONOMÍA, etc.)
      const badges = [];
      if (p.promo_badge) {
        badges.push({ text: p.promo_badge, color: 'bg-rose-600 text-white' });
      } else {
        if (idx % 4 === 0) badges.push({ text: 'NUEVO', color: 'bg-rose-600 text-white' });
        if (p.category_id === 'cat-1' || p.category_id === 'cat-5') badges.push({ text: 'HOTELERÍA', color: 'bg-indigo-600 text-white' });
        if (p.category_id === 'cat-4') badges.push({ text: 'GASTRONOMÍA', color: 'bg-amber-600 text-white' });
      }

      return {
        ...p,
        sale_price: salePrice,
        reference_price: referencePrice,
        discount_pct: discountPct,
        has_options: hasOptions,
        promo_badges: badges,
        in_stock: (p.current_stock || 0) > 0,
        img_url: db.getProductImage(p)
      };
    });
  }

  setupEventListeners() {
    // Buscador escritorio
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.activeFilters.search = e.target.value.trim().toLowerCase();
        if (clearBtn) clearBtn.classList.toggle('hidden', !e.target.value);
        this.applyFilters();
      });
    }

    // Buscador móvil
    const mobileSearch = document.getElementById('mobileSearchInput');
    if (mobileSearch) {
      mobileSearch.addEventListener('input', (e) => {
        this.activeFilters.search = e.target.value.trim().toLowerCase();
        if (searchInput) searchInput.value = e.target.value;
        this.applyFilters();
      });
    }
  }

  clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const mobileSearch = document.getElementById('mobileSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (searchInput) searchInput.value = '';
    if (mobileSearch) mobileSearch.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    this.activeFilters.search = '';
    this.applyFilters();
  }

  resetFilters() {
    this.activeFilters = {
      availability: 'all',
      price: 'all',
      category: 'all',
      search: '',
      sort: 'featured'
    };
    document.getElementById('filterAvailability').value = 'all';
    document.getElementById('filterPrice').value = 'all';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('sortOrder').value = 'featured';
    this.clearSearch();
  }

  applyFilters() {
    const avail = document.getElementById('filterAvailability')?.value || 'all';
    const price = document.getElementById('filterPrice')?.value || 'all';
    const cat = document.getElementById('filterCategory')?.value || 'all';
    const sort = document.getElementById('sortOrder')?.value || 'featured';

    this.activeFilters.availability = avail;
    this.activeFilters.price = price;
    this.activeFilters.category = cat;
    this.activeFilters.sort = sort;

    const hasActiveFilters = avail !== 'all' || price !== 'all' || cat !== 'all' || this.activeFilters.search;
    const btnClear = document.getElementById('btnClearFilters');
    if (btnClear) btnClear.classList.toggle('hidden', !hasActiveFilters);

    let list = this.products.filter(p => {
      // 1. Disponibilidad
      if (avail === 'in_stock' && !p.in_stock) return false;
      if (avail === 'out_of_stock' && p.in_stock) return false;

      // 2. Precio
      if (price === 'under_10k' && p.sale_price > 10000) return false;
      if (price === '10k_to_30k' && (p.sale_price < 10000 || p.sale_price > 30000)) return false;
      if (price === 'over_30k' && p.sale_price <= 30000) return false;

      // 3. Categoría
      if (cat !== 'all' && p.category_id !== cat) return false;

      // 4. Búsqueda por texto
      if (this.activeFilters.search) {
        const q = this.activeFilters.search;
        const matchName = p.name.toLowerCase().includes(q);
        const matchBrand = (p.brand || '').toLowerCase().includes(q);
        const matchSku = (p.sku || '').toLowerCase().includes(q);
        const matchPres = (p.presentation || '').toLowerCase().includes(q);
        if (!matchName && !matchBrand && !matchSku && !matchPres) return false;
      }

      return true;
    });

    // Ordenamiento
    if (sort === 'price_asc') {
      list.sort((a, b) => a.sale_price - b.sale_price);
    } else if (sort === 'price_desc') {
      list.sort((a, b) => b.sale_price - a.sale_price);
    } else if (sort === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'discount') {
      list.sort((a, b) => b.discount_pct - a.discount_pct);
    }

    this.renderProductsGrid(list);
  }

  renderProductsGrid(list) {
    const grid = document.getElementById('productsGrid');
    const noResults = document.getElementById('noResultsState');
    const countLabel = document.getElementById('productCountLabel');

    if (countLabel) {
      countLabel.textContent = `${list.length} ${list.length === 1 ? 'producto' : 'productos'}`;
    }

    if (!grid) return;

    if (list.length === 0) {
      grid.innerHTML = '';
      if (noResults) noResults.classList.remove('hidden');
      return;
    }

    if (noResults) noResults.classList.add('hidden');

    // Tarjetas exactamente estructuradas con el diseño de Voltra
    grid.innerHTML = list.map(p => {
      const isAgotado = !p.in_stock;

      return `
        <div class="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-200 flex flex-col justify-between overflow-hidden group">
          
          <!-- Contenedor Superior: Imagen y Badges -->
          <div>
            <div class="relative bg-slate-50 aspect-square w-full overflow-hidden flex items-center justify-center p-4 cursor-pointer" onclick="window.tiendaApp.openProductModal('${p.id}')">
              
              <!-- Badges Superiores Flotantes (Izquierda) -->
              <div class="absolute top-3 left-3 flex flex-col gap-1.5 z-10 items-start">
                ${isAgotado ? `
                  <span class="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white text-slate-800 border border-slate-300 shadow-xs">
                    Agotado
                  </span>
                ` : `
                  <span class="badge-off px-2.5 py-1 rounded-md text-[11px] font-extrabold shadow-xs tracking-tight">
                    -${p.discount_pct}% OFF
                  </span>
                `}
                
                ${p.promo_badges.map(b => `
                  <span class="${b.color} px-2 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider shadow-xs">
                    ${b.text}
                  </span>
                `).join('')}
              </div>

              <!-- Badge Estado Caviahue (Derecha) -->
              ${p.in_stock ? `
                <div class="absolute top-3 right-3 z-10">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-2xs">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Caviahue
                  </span>
                </div>
              ` : ''}

              <!-- Foto del Producto -->
              <img src="${p.img_url}" alt="${p.name}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300">
            </div>

            <!-- Contenido del Producto: Título y Precios -->
            <div class="p-4 space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                ${p.brand || 'StayClean'} • ${p.sale_unit || 'Unidad'}
              </span>

              <h3 onclick="window.tiendaApp.openProductModal('${p.id}')" class="text-[13px] sm:text-sm font-bold text-slate-900 group-hover:text-[#4EA1DD] line-clamp-2 min-h-[2.5rem] leading-snug cursor-pointer transition" title="${p.name}">
                ${p.name}
              </h3>

              <p class="text-[11px] text-slate-500 truncate font-normal">
                ${p.presentation || 'Presentación profesional'}
              </p>

              <!-- Bloque de Precios Estilo Voltra (Precio actual + tachado) -->
              <div class="pt-2 flex items-baseline gap-2">
                <span class="price-stayclean text-base sm:text-lg font-black tracking-tight">
                  ${Formatter.money(p.sale_price)}
                </span>
                <span class="text-xs text-slate-400 line-through font-normal">
                  ${Formatter.money(p.reference_price)}
                </span>
              </div>
            </div>
          </div>

          <!-- Botón de Acción StayClean -->
          <div class="p-4 pt-0">
            ${isAgotado ? `
              <button disabled class="w-full py-2.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed">
                Agotado
              </button>
            ` : p.has_options ? `
              <button onclick="window.tiendaApp.openProductModal('${p.id}')" class="btn-stayclean w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs">
                <span>Seleccionar opciones</span>
              </button>
            ` : `
              <button onclick="window.tiendaApp.addToCart('${p.id}', 1)" class="btn-stayclean w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>Agregar al carrito</span>
              </button>
            `}
          </div>

        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  // ==========================================
  // MODAL VISTA RÁPIDA / OPCIONES
  // ==========================================
  openProductModal(productId) {
    const p = this.products.find(item => item.id === productId);
    if (!p) return;

    const modal = document.getElementById('productDetailModal');
    const content = document.getElementById('productDetailContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-[#0E3A6B] text-white">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-[#8FD0F4] block">Detalle de Producto</span>
          <h3 class="text-sm font-bold text-white">${p.name}</h3>
        </div>
        <button onclick="window.tiendaApp.closeProductModal()" class="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="p-6 space-y-5">
        <div class="flex flex-col sm:flex-row gap-5 items-center">
          <div class="w-48 h-48 bg-slate-50 rounded-xl p-3 shrink-0 flex items-center justify-center border border-slate-100">
            <img src="${p.img_url}" alt="${p.name}" class="max-h-full max-w-full object-contain">
          </div>

          <div class="space-y-2 flex-1">
            <div class="flex items-center gap-2">
              ${p.discount_pct > 0 ? `<span class="badge-off px-2.5 py-0.5 rounded text-[11px] font-bold">-${p.discount_pct}% OFF</span>` : ''}
              <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ${p.in_stock ? `Stock disponible (${p.current_stock} unid.)` : 'Sin stock'}
              </span>
            </div>

            <h2 class="text-base font-bold text-slate-900">${p.name}</h2>
            <p class="text-xs text-slate-500">${p.description || p.presentation || 'Insumo de primera calidad para gastronomía y hotelería.'}</p>
            
            <div class="pt-2 flex items-baseline gap-2">
              <span class="price-stayclean text-2xl font-black">${Formatter.money(p.sale_price)}</span>
              <span class="text-sm text-slate-400 line-through">${Formatter.money(p.reference_price)}</span>
            </div>
            <p class="text-[11px] text-slate-400">Precios finales en Pesos Argentinos (ARS) con IVA incluido.</p>
          </div>
        </div>

        <!-- Selector de Presentación / Variantes -->
        <div class="space-y-2 border-t border-slate-100 pt-4">
          <label class="block text-xs font-bold text-slate-700">Presentación / Formato:</label>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="border-2 border-[#0E3A6B] bg-blue-50/50 p-3 rounded-lg cursor-pointer flex flex-col justify-between">
              <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-800">${p.presentation || 'Unidad estándar'}</span>
                <span class="w-2.5 h-2.5 rounded-full bg-[#0E3A6B]"></span>
              </div>
              <span class="font-black text-[#0E3A6B]">${Formatter.money(p.sale_price)}</span>
            </label>
            <label class="border border-slate-200 hover:border-slate-300 p-3 rounded-lg cursor-pointer flex flex-col justify-between opacity-80">
              <div class="flex justify-between items-center mb-1">
                <span class="font-medium text-slate-700">Pack / Bulto Mayorista</span>
                <span class="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.2 rounded">-10% Extra</span>
              </div>
              <span class="font-bold text-slate-700">Consultar x Cantidad</span>
            </label>
          </div>
        </div>

        <!-- Selector de Cantidad y Agregar -->
        <div class="flex items-center gap-3 border-t border-slate-100 pt-4">
          <div class="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
            <button onclick="window.tiendaApp.stepModalQty(-1)" class="px-3 py-2 text-slate-600 hover:bg-slate-200 font-bold text-sm">-</button>
            <input type="number" id="modalProductQty" value="1" min="1" max="${p.current_stock || 100}" class="w-12 text-center text-xs font-bold bg-transparent outline-none">
            <button onclick="window.tiendaApp.stepModalQty(1)" class="px-3 py-2 text-slate-600 hover:bg-slate-200 font-bold text-sm">+</button>
          </div>

          <button onclick="window.tiendaApp.addFromModal('${p.id}')" ${!p.in_stock ? 'disabled' : ''} class="btn-stayclean flex-1 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm ${!p.in_stock ? 'opacity-50 cursor-not-allowed' : ''}">
            <i data-lucide="shopping-cart" class="w-4 h-4"></i>
            <span>${p.in_stock ? 'Agregar al Carrito' : 'Agotado'}</span>
          </button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  stepModalQty(delta) {
    const input = document.getElementById('modalProductQty');
    if (input) {
      let val = parseInt(input.value) || 1;
      val = Math.max(1, val + delta);
      input.value = val;
    }
  }

  addFromModal(productId) {
    const input = document.getElementById('modalProductQty');
    const qty = input ? parseInt(input.value) || 1 : 1;
    this.addToCart(productId, qty);
    this.closeProductModal();
  }

  closeProductModal() {
    const modal = document.getElementById('productDetailModal');
    if (modal) modal.classList.add('hidden');
  }

  // ==========================================
  // CARRITO DE COMPRAS (DRAWER SLIDE-OVER)
  // ==========================================
  addToCart(productId, qty = 1) {
    const p = this.products.find(item => item.id === productId);
    if (!p || !p.in_stock) return;

    const existing = this.cart.find(item => item.id === productId);
    if (existing) {
      existing.quantity += qty;
    } else {
      this.cart.push({
        id: p.id,
        name: p.name,
        price: p.sale_price,
        presentation: p.presentation || p.sale_unit,
        img_url: p.img_url,
        quantity: qty
      });
    }

    this.saveCart();
    this.openCart();
    this.renderCartItems();
  }

  updateCartQty(productId, delta) {
    const item = this.cart.find(i => i.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      this.cart = this.cart.filter(i => i.id !== productId);
    }
    this.saveCart();
    this.renderCartItems();
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter(i => i.id !== productId);
    this.saveCart();
    this.renderCartItems();
  }

  openCart() {
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.classList.remove('hidden');
    this.renderCartItems();
  }

  closeCart() {
    const drawer = document.getElementById('cartDrawer');
    if (drawer) drawer.classList.add('hidden');
  }

  updateCartBadge() {
    const totalCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const badge = document.getElementById('cartCountBadge');
    const totalEl = document.getElementById('cartTotalSummary');
    if (badge) badge.textContent = totalCount;
    if (totalEl) totalEl.textContent = Formatter.money(totalAmount);
  }

  renderCartItems() {
    const container = document.getElementById('cartItemsList');
    const subtotalEl = document.getElementById('cartDrawerSubtotal');
    const totalEl = document.getElementById('cartDrawerTotal');
    const countText = document.getElementById('drawerItemCountText');
    const checkoutBtn = document.getElementById('btnProceedCheckout');

    const totalCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (countText) countText.textContent = `${totalCount} ${totalCount === 1 ? 'producto' : 'productos'} seleccionados`;
    if (subtotalEl) subtotalEl.textContent = Formatter.money(totalAmount);
    if (totalEl) totalEl.textContent = Formatter.money(totalAmount);
    if (checkoutBtn) checkoutBtn.disabled = this.cart.length === 0;

    if (!container) return;

    if (this.cart.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400 space-y-3">
          <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <i data-lucide="shopping-bag" class="w-6 h-6"></i>
          </div>
          <p class="text-sm font-bold text-slate-700">Tu carrito está vacío</p>
          <p class="text-xs text-slate-400">Elegí insumos de limpieza y descartables para armar tu pedido.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = this.cart.map(item => `
      <div class="py-3 flex items-center gap-3">
        <img src="${item.img_url}" alt="${item.name}" class="w-14 h-14 object-contain rounded-lg bg-slate-50 border border-slate-100 p-1 shrink-0">
        
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-bold text-slate-800 truncate">${item.name}</h4>
          <p class="text-[10px] text-slate-400 truncate">${item.presentation || ''}</p>
          <span class="text-xs font-extrabold text-[#1f4e5b] block mt-0.5">
            ${Formatter.money(item.price)}
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <div class="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white text-xs">
            <button onclick="window.tiendaApp.updateCartQty('${item.id}', -1)" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold">-</button>
            <span class="px-2 py-1 font-bold text-slate-800">${item.quantity}</span>
            <button onclick="window.tiendaApp.updateCartQty('${item.id}', 1)" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold">+</button>
          </div>
          <button onclick="window.tiendaApp.removeFromCart('${item.id}')" class="p-1 text-slate-300 hover:text-rose-500 rounded transition" title="Eliminar">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  // ==========================================
  // PERFIL DE CLIENTE & CHECKOUT
  // ==========================================
  updateProfileUI() {
    const label = document.getElementById('userProfileLabel');
    if (!label) return;

    if (this.customerProfile && this.customerProfile.name) {
      label.textContent = this.customerProfile.name.split(' ')[0];
    } else {
      label.textContent = 'Crear cuenta / Ingresar';
    }
  }

  async openProfileModal() {
    if(!await staycleanAuthToken()){await this.openAccountDialog();return;}
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    // Precargar datos si ya existen
    if (this.customerProfile) {
      document.getElementById('profName').value = this.customerProfile.name || '';
      document.getElementById('profType').value = this.customerProfile.customer_type || 'Alojamiento';
      document.getElementById('profPhone').value = this.customerProfile.phone || '';
      document.getElementById('profAddress').value = this.customerProfile.address || '';
      document.getElementById('profZone').value = this.customerProfile.zone || '';
      document.getElementById('profTaxId').value = this.customerProfile.tax_id || '';
      document.getElementById('profInvoiceType').value = this.customerProfile.invoice_type || 'B';
      document.getElementById('profNotes').value = this.customerProfile.notes || '';
    }

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
  }

  async saveProfile(e) {
    e.preventDefault();
    const profile = {
      name: document.getElementById('profName').value.trim(),
      customer_type: document.getElementById('profType').value,
      phone: document.getElementById('profPhone').value.trim(),
      address: document.getElementById('profAddress').value.trim(),
      zone: document.getElementById('profZone').value.trim(),
      tax_id: document.getElementById('profTaxId').value.trim(),
      invoice_type: document.getElementById('profInvoiceType').value,
      notes: document.getElementById('profNotes').value.trim(),
      updated_at: new Date().toISOString()
    };

    try {await this.saveCustomerProfileData(profile);} catch(err){alert(err.message);return;}
    this.closeProfileModal();

    // Si tiene productos en el carrito y venía del checkout, abrir confirmación
    if (this.cart.length > 0) {
      this.openOrderConfirmation();
    } else {
      alert('¡Perfil de entrega guardado correctamente!');
    }
  }

  async proceedToCheckout() {
    if(!await staycleanAuthToken()){this.closeCart();await this.openAccountDialog();return;}
    if (this.cart.length === 0) {
      alert('Tu carrito está vacío. Agregá productos antes de continuar.');
      return;
    }

    // Obligatorio: Validar si existe perfil con datos de entrega
    if (!this.customerProfile || !this.customerProfile.name || !this.customerProfile.phone || !this.customerProfile.address) {
      this.closeCart();
      this.openProfileModal();
      return;
    }

    // Si ya tiene perfil, abrir pantalla de confirmación directa
    this.closeCart();
    this.openOrderConfirmation();
  }

  openOrderConfirmation() {
    const modal = document.getElementById('orderConfirmationModal');
    const content = document.getElementById('orderConfirmationContent');
    if (!modal || !content) return;

    const prof = this.customerProfile;
    const totalCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    content.innerHTML = `
      <div class="p-5 border-b border-slate-200 bg-[#0E3A6B] text-white flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
            <i data-lucide="check-circle" class="w-4 h-4 text-[#8FD0F4]"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold">Confirmar Pedido & Entrega</h3>
            <p class="text-[11px] text-[#8FD0F4]">Verificá tus datos antes de enviar a StayClean Caviahue</p>
          </div>
        </div>
        <button onclick="window.tiendaApp.closeOrderConfirmation()" class="text-white/80 hover:text-white p-1">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="p-6 space-y-4 text-xs">
        
        <!-- Tarjeta de Datos de Entrega -->
        <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div class="flex items-center justify-between border-b border-slate-200 pb-2">
            <div class="flex items-center gap-1.5 font-bold text-slate-800">
              <i data-lucide="map-pin" class="w-4 h-4 text-[#0E3A6B]"></i>
              <span>Destino del Envío en Caviahue</span>
            </div>
            <button onclick="window.tiendaApp.openProfileModal()" class="text-[#0E3A6B] hover:text-[#4EA1DD] font-bold underline text-[11px]">
              Editar Datos
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span class="text-slate-400 block">Cliente:</span>
              <strong class="text-slate-800">${prof.name}</strong>
              <span class="text-slate-500 block">(${prof.customer_type})</span>
            </div>
            <div>
              <span class="text-slate-400 block">Contacto WhatsApp:</span>
              <strong class="text-slate-800">${prof.phone}</strong>
            </div>
            <div class="col-span-2">
              <span class="text-slate-400 block">Dirección de Entrega:</span>
              <strong class="text-slate-800">${prof.address}</strong>
              ${prof.zone ? `<span class="text-slate-500"> - Zona: ${prof.zone}</span>` : ''}
            </div>
            ${prof.tax_id ? `
              <div>
                <span class="text-slate-400 block">Facturación:</span>
                <span class="text-slate-700">Factura ${prof.invoice_type || 'B'} • CUIT/DNI: ${prof.tax_id}</span>
              </div>
            ` : ''}
            ${prof.notes ? `
              <div class="col-span-2 text-slate-600 italic bg-white p-2 rounded border border-slate-200">
                "${prof.notes}"
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Resumen de Productos -->
        <div class="space-y-2">
          <h4 class="font-bold text-slate-700 flex justify-between">
            <span>Productos a entregar (${totalCount}):</span>
            <span class="font-extrabold text-[#1f4e5b]">${Formatter.money(totalAmount)}</span>
          </h4>
          <div class="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg p-2 bg-white">
            ${this.cart.map(item => `
              <div class="py-1.5 flex justify-between items-center text-[11px]">
                <div class="truncate max-w-[240px]">
                  <strong>${item.quantity}x</strong> ${item.name}
                </div>
                <div class="font-mono text-slate-800 shrink-0">
                  ${Formatter.money(item.price * item.quantity)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Método de Pago Preferido -->
        <div class="space-y-1.5">
          <label class="block font-bold text-slate-700">Forma de Pago:</label>
          <select id="checkoutPaymentMethod" onchange="document.getElementById(\'checkoutSubmitLabel\').textContent = this.value === \'Mercado Pago\' ? \'Continuar a Mercado Pago\' : \'Confirmar y Enviar Pedido por WhatsApp\'" class="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#2b5158] outline-none">
            <option value="Efectivo contra entrega">Efectivo contra entrega en Caviahue</option>
            <option value="Transferencia Bancaria">Transferencia Bancaria (Alias / CBU)</option>
            <option value="Cuenta Corriente">Cuenta Corriente Comercial (Hoteles / Cabañas habituales)</option>
            <option value="Mercado Pago">Mercado Pago (pago online de prueba)</option>
          </select>
        </div>

        <!-- Botón de Envío por WhatsApp -->
        <div class="pt-3 border-t border-slate-100 space-y-2">
          <button onclick="window.tiendaApp.submitOrderToWhatsApp()" class="w-full py-3.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99]">
            <i data-lucide="send" class="w-4 h-4"></i>
            <span id="checkoutSubmitLabel">Confirmar y Enviar Pedido por WhatsApp</span>
          </button>
          <p class="text-[10px] text-slate-400 text-center">
            Se abrirá WhatsApp con el pedido redactado para que lo envíes con un solo clic.
          </p>
        </div>

      </div>
    `;

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeOrderConfirmation() {
    const modal = document.getElementById('orderConfirmationModal');
    if (modal) modal.classList.add('hidden');
  }

  async handleMpReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('mp');
    const requestId = params.get('request_id');
    if (!result || !requestId) return;
    try {
      const status = await staycleanMpCheckoutStatus(requestId);
      if (status.status === 'approved') {
        this.cart = [];
        this.saveCart();
        this.pendingRequestId = null;
        sessionStorage.removeItem('stayclean_pending_order_id');
        sessionStorage.removeItem('stayclean_pending_mp_order_id');
        await this.loadProducts();
        alert('¡Pago aprobado! Pedido ' + status.order_number + ' registrado correctamente en StayClean.');
      } else if (status.status === 'pending' || status.status === 'fulfillment_review') {
        if (status.status === 'fulfillment_review') {
          alert('Tu pago fue acreditado, pero el pedido requiere revisión manual de stock. No vuelvas a pagar. Contactá a StayClean e indicá el identificador ' + requestId + '.');
        } else {
          alert('El pago todavía está pendiente de confirmación. No vuelvas a pagar; podés consultar el estado desde tu cuenta.');
        }
      } else {
        sessionStorage.removeItem('stayclean_pending_mp_order_id');
        alert('El pago no figura aprobado. Tu carrito se conserva para que puedas volver a intentarlo.');
      }
    } catch (error) {
      console.error('No se pudo consultar el retorno de Mercado Pago', error);
      alert('Volviste de Mercado Pago, pero todavía no pudimos verificar el estado. No vuelvas a pagar; consultá tus pedidos en tu cuenta.');
    } finally {
      params.delete('mp');
      params.delete('request_id');
      const query = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
    }
  }

  async submitOrderToWhatsApp() {
    if (this.sendingOrder) return;
    const prof = this.customerProfile;
    if (!prof || !this.cart.length) return;
    this.sendingOrder = true;
    const requestId = this.pendingRequestId || (this.pendingRequestId = crypto.randomUUID());
    sessionStorage.setItem('stayclean_pending_order_id', requestId);
    const city = /copahue/i.test(prof.zone || '') ? 'Copahue' : 'Caviahue';
    try {
      const paymentMethod = document.getElementById('checkoutPaymentMethod')?.value || 'Efectivo contra entrega';
      if (paymentMethod === 'Mercado Pago') {
        const mpRequestId = sessionStorage.getItem('stayclean_pending_mp_order_id') || crypto.randomUUID();
        sessionStorage.setItem('stayclean_pending_mp_order_id', mpRequestId);
        const checkout = await staycleanCreateMpCheckout(
          mpRequestId,
          this.cart.map(item => ({ product_id: item.id, quantity: item.quantity }))
        );
        if (!checkout.checkout_url || !/^https:\/\//.test(checkout.checkout_url)) throw new Error('Mercado Pago no devolvió una URL válida');
        window.location.assign(checkout.checkout_url);
        return;
      }
      const savedOrder = await staycleanAuthenticatedOrder({
        request_id: requestId,
        customer_name: prof.name,
        customer_phone: prof.phone,
        customer_email: prof.email || '',
        delivery_address: prof.address || '',
        delivery_city: city,
        items: this.cart.map(item => ({ product_id: item.id, quantity: item.quantity }))
      });
      const lines = this.cart.map(item => `• ${item.quantity}x ${item.name}`).join('\\n');
      const message = `*PEDIDO STAYCLEAN*\\nN°: ${savedOrder.order_number}\\nCliente: ${prof.name}\\nTel: ${prof.phone}\\nEntrega: ${prof.address}, ${city}\\n${lines}\\nTotal: ${Formatter.money(Number(savedOrder.total || 0))}\\nPedido registrado; pendiente de coordinación.`;
      this.cart = [];
      this.saveCart();
      this.pendingRequestId = null;
      sessionStorage.removeItem('stayclean_pending_order_id');
      this.closeOrderConfirmation();
      await this.loadProducts();
      window.open(`https://wa.me/${this.companyWhatsApp}?text=${encodeURIComponent(message)}`, '_blank');
      alert(`Pedido ${savedOrder.order_number} registrado correctamente en StayClean. Podés consultar e imprimir tu comprobante desde Mi cuenta → PEDIDOS.`);
    } catch (error) {
      console.error('Error registrando pedido en Supabase', error);
      alert('No se registró el pedido: ' + error.message + '. El carrito permanece intacto.');
    } finally {
      this.sendingOrder = false;
    }
  }

}

// Inicializar y exponer globalmente
export const tiendaApp = new TiendaStandaloneApp();
window.tiendaApp = tiendaApp;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => tiendaApp.init());
} else {
  tiendaApp.init();
}
