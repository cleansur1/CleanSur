import { downloadOrderRemito } from './order_remito.js?v=1';
import { publicPresentations } from './presentations.js?v=1';
// Controlador de Tienda Nube / Catálogo Público para Clientes
// StayClean - Distribuidora Limpieza y Descartables (voltra.com.ar inspired)
import { db } from './db.js';
import { Formatter } from './models.js';
import { staycleanPublicCatalog, staycleanPublicCatalogAromas, staycleanAuthSignUp, staycleanAuthSignIn, staycleanAuthSignOut, staycleanAuthReset, staycleanAuthUpdatePassword, staycleanAuthToken, staycleanCustomerProfile, staycleanCustomerRpc, staycleanCustomerOrders, staycleanAuthenticatedOrder, STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from './supabase_public.js?v=account-1';

const escapeCatalogText = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

class TiendaStandaloneApp {
  constructor() {
    this.products = [];
    this.catalogAromas = new Map();
    this.cart = this.loadCart();
    this.pendingRequestId = sessionStorage.getItem('stayclean_pending_order_id') || null;
    this.customerProfile = null;
    this.isStaff = false;
    this.activeFilters = {
      availability: 'all',
      price: 'all',
      category: 'all',
      search: '',
      sort: 'featured'
    };
  }

  init() {
    this.loadProducts().finally(() => this.watchCatalogTotal());
    this.restoreCustomerSession();
    this.setupEventListeners();
    this.setupAccountDialog();
    this.updateProfileUI();
    this.updateCartBadge();
    this.applyFilters();
    this.checkPaymentReturn();
    this.checkAssistedAccess();
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
    // El identificador idempotente pertenece a un carrito exacto: si cambia, crear otro intento.
    this.pendingRequestId = null;
    sessionStorage.removeItem('stayclean_pending_order_id');
    this.updateCartBadge();
  }

  async restoreCustomerSession(){
    if(!await staycleanAuthToken()){this.customerProfile=null;this.updateProfileUI();return;}
    try{const p=await staycleanCustomerProfile();if(p?.registered){this.customerProfile={name:p.name,phone:p.phone,address:p.address,zone:p.city,email:p.email,creditAccountEnabled:p.credit_account_enabled===true};this.updateProfileUI();}}
    catch(e){console.error('No se pudo restaurar el perfil',e);}
  }
  async saveCustomerProfileData(profile){
    const p=await staycleanCustomerProfile({name:profile.name,phone:profile.phone,address:profile.address,city:/copahue/i.test(profile.zone||'')?'Copahue':'Caviahue'});
    this.customerProfile={...profile,email:p.email,creditAccountEnabled:p.credit_account_enabled===true};this.updateProfileUI();
  }

  showStoreDialog(title) {
    const dialog = document.getElementById('storeDialog');
    dialog.querySelector('h2').textContent = title;
    const content = dialog.querySelector('[data-store-dialog-content]');
    content.replaceChildren();
    content.classList.remove('whitespace-pre-line');
    if (!dialog.open) {
      dialog.returnValue = '';
      dialog.showModal();
    }
    dialog.scrollTop = 0;
    return content;
  }

  showNotice(message, title = 'Aviso de CleanSur') {
    const content = this.showStoreDialog(title);
    content.textContent = message;
    content.classList.add('whitespace-pre-line');
  }

  bindRemitoDownload(content, getOrder, profile = this.customerProfile) {
    const button = content.querySelector('[data-download-remito]');
    if (!button) return;
    const feedback = content.querySelector('[data-remito-status]');
    button.onclick = async () => {
      button.disabled = true;
      feedback.textContent = '';
      try {
        const order = await getOrder();
        if (!order) throw Error('El pedido todavía no está disponible. Volvé a intentar desde Mis pedidos.');
        await downloadOrderRemito(order, profile);
      } catch (error) {
        feedback.textContent = error.message || 'No se pudo descargar el remito.';
      } finally {
        button.disabled = false;
      }
    };
  }

  async findOrderForRemito(number) {
    const orders = await staycleanCustomerOrders();
    return orders.find(order => String(order.number) === String(number));
  }

  showOrderConfirmationWithRemito(number, message) {
    const content = this.showStoreDialog('Pedido registrado');
    content.innerHTML = `
      <p>${escapeCatalogText(message)}</p>
      ${number ? '<button type="button" data-download-remito class="btn-stayclean w-full rounded-xl py-3 font-bold">Descargar remito PDF</button><p data-remito-status role="status" class="text-sm text-slate-600"></p>' : ''}`;
    this.bindRemitoDownload(content, () => this.findOrderForRemito(number));
  }

  showTransferDetails(order, total, customerCanDownload = true) {
    const content = this.showStoreDialog('Datos para transferir');
    const amount = total == null ? NaN : Number(total);
    const message = encodeURIComponent('Hola CleanSur, les envío el comprobante de transferencia del pedido ' + order + '.');
    content.innerHTML = `
      <p class="font-bold text-[#0E3A6B]">Pedido ${escapeCatalogText(order)}</p>
      <div class="rounded-xl bg-sky-50 p-4">
        <p class="text-sm font-semibold">Importe a transferir</p>
        <p class="text-2xl font-bold text-[#0E3A6B]">${Number.isFinite(amount) ? Formatter.money(amount) : 'Consultá el total en el comprobante'}</p>
      </div>
      <dl class="space-y-3">
        <div><dt class="text-xs text-slate-500">Titular</dt><dd class="font-semibold">Federico Eumann</dd></div>
        <div><dt class="text-xs text-slate-500">Billetera</dt><dd class="font-semibold">Mercado Pago</dd></div>
        <div><dt class="text-xs text-slate-500">Alias</dt><dd class="flex flex-wrap items-center justify-between gap-2"><span class="font-mono select-all">cleansurcvh</span><button type="button" data-copy-transfer="cleansurcvh" class="rounded-lg border px-3 py-2 font-semibold">Copiar alias</button></dd></div>
        <div><dt class="text-xs text-slate-500">CVU</dt><dd class="flex flex-wrap items-center justify-between gap-2"><span class="font-mono select-all break-all">0000003100075971427558</span><button type="button" data-copy-transfer="0000003100075971427558" class="rounded-lg border px-3 py-2 font-semibold">Copiar CVU</button></dd></div>
      </dl>
      <p data-transfer-status role="status" aria-live="polite" class="text-sm text-slate-600"></p>
      <p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Enviá el comprobante de transferencia al WhatsApp de CleanSur, <strong>11 4156 4004</strong>. El pago queda pendiente hasta que verifiquemos la acreditación.</p>
      <a href="https://wa.me/5491141564004?text=${message}" target="_blank" rel="noopener noreferrer" class="block rounded-xl bg-emerald-700 px-4 py-3 text-center font-bold text-white">Enviar comprobante por WhatsApp</a>
      ${customerCanDownload ? '<button type="button" data-download-remito class="w-full rounded-xl border px-4 py-2 font-bold text-[#0E3A6B]">Descargar remito PDF</button><p data-remito-status role="status" class="text-sm text-slate-600"></p>' : ''}
      <form method="dialog"><button class="btn-stayclean w-full rounded-xl py-3 font-bold">Listo</button></form>`;
    this.bindRemitoDownload(content, () => this.findOrderForRemito(order));
    for (const button of content.querySelectorAll('[data-copy-transfer]')) {
      button.onclick = async () => {
        const status = content.querySelector('[data-transfer-status]');
        try {
          await navigator.clipboard.writeText(button.dataset.copyTransfer);
          status.textContent = 'Copiado al portapapeles.';
        } catch {
          status.textContent = 'Mantené presionado el dato para copiarlo manualmente.';
        }
      };
    }
  }

  confirmTestPayment() {
    const content = this.showStoreDialog('Continuar a Mercado Pago');
    content.innerHTML = `
      <p>La integración está en validación. Para una prueba, usá únicamente una orden y una tarjeta de prueba.</p>
      <form method="dialog" class="flex justify-end gap-3">
        <button value="cancel" class="rounded-xl border border-slate-300 px-4 py-2 font-semibold">Cancelar</button>
        <button value="continue" class="btn-stayclean rounded-xl px-4 py-2 font-bold">Continuar</button>
      </form>`;
    const dialog = content.closest('dialog');
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'continue'), { once: true });
    });
  }

  async showOrderReceipts() {
    const content = this.showStoreDialog('Mis pedidos');
    content.textContent = 'Cargando pedidos…';
    const [orders, profile] = await Promise.all([staycleanCustomerOrders(), staycleanCustomerProfile()]);
    if (!content.closest('dialog').open || content.textContent !== 'Cargando pedidos…') return;
    const renderOrders = () => {
      this.showStoreDialog('Mis pedidos');
      if (!orders.length) {
        content.textContent = 'Todavía no tenés pedidos.';
        return;
      }
      content.innerHTML = orders.map((order, index) => `
        <button type="button" data-receipt-index="${index}" class="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-left hover:bg-sky-50">
          <span><strong>Pedido ${escapeCatalogText(order.number)}</strong><br><span class="text-xs text-slate-600">${escapeCatalogText(order.status)} · ${Formatter.money(Number(order.total))}</span></span>
          <span class="text-xs font-bold text-[#0E3A6B]">Ver comprobante</span>
        </button>`).join('');
      for (const button of content.querySelectorAll('[data-receipt-index]')) {
        button.onclick = () => renderReceipt(orders[Number(button.dataset.receiptIndex)]);
      }
    };
    const renderReceipt = order => {
      this.showStoreDialog('Comprobante del pedido');
      const items = Array.isArray(order.items) ? order.items : [];
      content.innerHTML = `
        <p class="text-lg font-bold">Pedido ${escapeCatalogText(order.number)}</p>
        <p>${escapeCatalogText(new Date(order.date).toLocaleString('es-AR'))} · ${escapeCatalogText(order.status)}</p>
        <p>Cliente: ${escapeCatalogText(profile.name)}<br>Entrega: ${escapeCatalogText([profile.address, profile.city].filter(Boolean).join(', '))}</p>
        <ul class="divide-y divide-slate-200 border-y border-slate-200">
          ${items.map(item => `<li class="flex justify-between gap-4 py-2"><span>${escapeCatalogText(item.quantity)} × ${escapeCatalogText(item.product_name)} ${escapeCatalogText(item.unit_name)}</span><strong>${Formatter.money(Number(item.subtotal))}</strong></li>`).join('')}
        </ul>
        <p class="text-right text-lg font-bold">Total ${Formatter.money(Number(order.total))}</p>
        <p class="text-xs text-slate-600">Comprobante de pedido. Sin validez como factura fiscal ni comprobante de pago.</p>
        <div class="flex flex-wrap justify-between gap-3">
          <button type="button" data-back-orders class="font-semibold text-[#0E3A6B] underline">Volver a mis pedidos</button>
          <button type="button" data-download-remito class="btn-stayclean rounded-xl px-4 py-2 font-bold">Descargar remito PDF</button>
        </div>
        <p data-remito-status role="status" class="text-sm text-slate-600"></p>`;
      content.querySelector('[data-back-orders]').onclick = renderOrders;
      this.bindRemitoDownload(content, () => order, profile);
    };
    renderOrders();
  }

  setupAccountDialog() {
    const dialog = document.getElementById('customerAccountDialog');
    if (!dialog) return;
    this.accountDialog = dialog;
    this.accountForm = dialog.querySelector('form');
    this.accountMessage = document.getElementById('customerAccountMessage');

    dialog.addEventListener('click', async event => {
      const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
      if (!action || this.accountBusy) return;
      if (action === 'close') {
        dialog.close();
      } else if (action === 'logout') {
        await staycleanAuthSignOut();
        this.customerProfile = null;
        this.updateProfileUI();
        this.showAccountMode('login', 'Cerraste sesión.');
      } else if (action === 'profile' || action === 'orders') {
        dialog.close();
        try {
          await (action === 'profile' ? this.openProfileModal() : this.showOrderReceipts());
        } catch (error) {
          this.showNotice(error.message, action === 'orders' ? 'Mis pedidos' : 'Mis datos');
        }
      } else {
        this.showAccountMode(action);
      }
    });

    dialog.addEventListener('cancel', event => {
      if (this.accountBusy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open) {
        this.accountForm.reset();
        this.recoveryToken = null;
      }
    });
    this.accountForm.addEventListener('submit', event => this.submitAccountForm(event));

    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.get('type') === 'recovery') {
      this.recoveryToken = fragment.get('access_token');
      history.replaceState(history.state, '', location.pathname + location.search);
      if (this.recoveryToken) this.showAccountMode('newPassword');
      else this.showAccountMode('reset', 'El enlace venció. Pedí uno nuevo.');
    }
  }

  async openAccountDialog() {
    if (!this.accountDialog || this.accountDialog.open) return;
    this.showAccountMode(await staycleanAuthToken() ? 'account' : 'login');
  }

  showAccountMode(mode, message = '') {
    const modes = {
      login: ['Iniciar sesión', 'Ingresar'],
      signup: ['Crear cuenta', 'Registrarme'],
      reset: ['Recuperar contraseña', 'Enviar enlace'],
      newPassword: ['Elegí una nueva contraseña', 'Guardar contraseña'],
      account: ['Mi cuenta', '']
    };
    const [title, submit] = modes[mode];
    const form = this.accountForm;
    const { email, password } = form.elements;
    this.accountMode = mode;
    password.value = '';
    email.required = mode === 'login' || mode === 'signup' || mode === 'reset';
    email.disabled = !email.required;
    password.required = mode === 'login' || mode === 'signup' || mode === 'newPassword';
    password.disabled = !password.required;
    password.minLength = mode === 'login' ? 0 : 8;
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    document.getElementById('customerAccountTitle').textContent = title;
    document.getElementById('customerAccountPasswordLabel').textContent =
      mode === 'login' ? 'Contraseña' : 'Contraseña (mínimo 8 caracteres)';
    document.getElementById('customerAccountEmailField').classList.toggle('hidden', email.disabled);
    document.getElementById('customerAccountPasswordField').classList.toggle('hidden', password.disabled);
    form.hidden = !submit;
    form.querySelector('[type="submit"]').textContent = submit;
    this.accountMessage.textContent = message;
    const actions = {
      login: ['signup', 'reset'],
      signup: ['login'],
      reset: ['login'],
      newPassword: [],
      account: ['profile', 'orders', 'logout']
    };
    for (const button of this.accountDialog.querySelectorAll('[data-account-action]')) {
      button.hidden = button.dataset.accountAction !== 'close' && !actions[mode].includes(button.dataset.accountAction);
    }
    if (!this.accountDialog.open) this.accountDialog.showModal();
    if (!email.disabled) email.focus();
    else if (!password.disabled) password.focus();
  }

  async submitAccountForm(event) {
    event.preventDefault();
    if (this.accountBusy) return;
    const form = this.accountForm;
    const button = form.querySelector('[type="submit"]');
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    this.accountBusy = button.disabled = true;
    this.accountMessage.textContent = '';
    try {
      switch (this.accountMode) {
        case 'signup':
          await staycleanAuthSignUp(email, password);
          this.showAccountMode('login', 'Revisá tu correo para confirmar la cuenta.');
          break;
        case 'reset':
          await staycleanAuthReset(email, location.origin + location.pathname);
          this.showAccountMode('login', 'Si existe una cuenta con ese correo, recibirás un enlace para recuperar tu contraseña.');
          break;
        case 'newPassword':
          await staycleanAuthUpdatePassword(password, this.recoveryToken);
          this.recoveryToken = null;
          this.showAccountMode('login', 'Contraseña actualizada. Ya podés ingresar.');
          break;
        case 'login':
          await staycleanAuthSignIn(email, password);
          await this.restoreCustomerSession();
          await this.checkAssistedAccess();
          this.accountDialog.close();
          if (!this.customerProfile) await this.openProfileModal();
          break;
      }
    } catch (error) {
      this.accountMessage.textContent = error.message;
    } finally {
      this.accountBusy = button.disabled = false;
    }
  }

  async loadAromaFilter() {
    const select = document.getElementById('filterAroma');
    const note = document.getElementById('aromaFilterNote');
    if (!select || !note) return;
    try {
      const aromas = await staycleanPublicCatalogAromas();
      const labels = new Map();
      for (const {product_id, aroma} of aromas) {
        const key = aroma.trim().toLocaleLowerCase('es-AR');
        labels.set(key, labels.get(key) ?? aroma);
        if (!this.catalogAromas.has(product_id)) this.catalogAromas.set(product_id, new Set());
        this.catalogAromas.get(product_id).add(key);
      }
      for (const [key, label] of [...labels].sort((a,b) => a[1].localeCompare(b[1], 'es-AR'))) {
        select.add(new Option(label, key));
      }
      select.disabled = labels.size === 0;
      if (labels.size) note.textContent = 'Aromas registrados. Consultá disponibilidad por aroma.';
    } catch (error) {
      note.textContent = 'No se pudieron cargar los aromas.';
      console.error('No se pudo cargar el filtro de aromas', error);
    }
  }

  updateCatalogTotal(rows) {
    const label = document.getElementById('catalogTotal');
    if (!label) return;
    const variants = new Set(rows.map(({sku, id}) => {
      const normalizedSku = sku?.trim().toUpperCase();
      return normalizedSku ? `sku:${normalizedSku}` : `id:${id}`;
    }));
    const total = String(variants.size);
    if (label.textContent !== total) label.textContent = total;
  }

  watchCatalogTotal() {
    const label = document.getElementById('catalogTotal');
    if (!label) return;
    let refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        this.updateCatalogTotal(await staycleanPublicCatalog());
      } catch (error) {
        console.error('No se pudo actualizar el total del catálogo', error);
      } finally {
        refreshing = false;
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.setInterval(refresh, 60_000);
  }

  async loadProducts() {
    // Catálogo remoto: jamás mostrar stock local como si fuera compartido.
    try {
      const [rows, forms] = await Promise.all([staycleanPublicCatalog(), publicPresentations()]);
      this.presentations = forms;
      this.updateCatalogTotal(rows);
      this.products = rows.map(p => ({
        ...p, current_stock: Number(p.available_stock),
        sale_price: Number(p.sale_price), in_stock: Number(p.available_stock) > 0 || forms.some(form=>form.product_id===p.id && Number(form.available)>0),
        img_url: p.image_url || '../erp/assets/stayclean-logo.jpg',
        has_options: false, promo_badges: [], discount_pct: 0,
        display_price: Number(p.sale_price) > 0 && forms.some(form => form.product_id === p.id && form.code === p.sku)
          ? Number(p.sale_price)
          : Math.min(...forms.filter(form => form.product_id === p.id).map(form => Number(form.price)).concat(
              forms.some(form => form.product_id === p.id) ? [] : [Number(p.sale_price)])),
        reference_price: Number(p.sale_price)
      }));
      this.applyFilters();
      void this.loadAromaFilter();
    } catch (error) {
      const label = document.getElementById('catalogTotal');
      if (label) label.textContent = '—';
      this.products = [];
      this.applyFilters();
      console.error('No se pudo cargar el catálogo de Supabase', error);
      this.showNotice('No se pudo conectar al catálogo de StayClean. Intentá nuevamente más tarde.');
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

  togglePromos() {
    const enabled = !this.promosOnly;
    this.resetFilters(enabled);
  }

  resetFilters(promosOnly = false) {
    this.promosOnly = promosOnly;
    document.getElementById('filterPromos')?.setAttribute('aria-pressed', String(promosOnly));
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
    const aroma = document.getElementById('filterAroma');
    if (aroma) aroma.value = '';
    this.clearSearch();
  }

  applyFilters() {
    const avail = document.getElementById('filterAvailability')?.value || 'all';
    const price = document.getElementById('filterPrice')?.value || 'all';
    const cat = document.getElementById('filterCategory')?.value || 'all';
    const sort = document.getElementById('sortOrder')?.value || 'featured';
    const aroma = document.getElementById('filterAroma')?.value || '';

    this.activeFilters.availability = avail;
    this.activeFilters.price = price;
    this.activeFilters.category = cat;
    this.activeFilters.sort = sort;

    const hasActiveFilters = this.promosOnly || avail !== 'all' || price !== 'all' || cat !== 'all' || aroma !== '' || this.activeFilters.search;
    const btnClear = document.getElementById('btnClearFilters');
    if (btnClear) btnClear.classList.toggle('hidden', !hasActiveFilters);

    let list = this.products.filter(p => {
      if (this.promosOnly && !/^PROMO-/i.test(p.sku || '')) return false;
      if (aroma && !this.catalogAromas.get(p.id)?.has(aroma)) return false;
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
              <img src="${p.img_url}" alt="${escapeCatalogText(p.name)}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300">
            </div>

            <!-- Contenido del Producto: Título y Precios -->
            <div class="p-4 space-y-1.5">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                ${p.brand || 'StayClean'} • ${p.sale_unit || 'Unidad'}
              </span>

              <h3 onclick="window.tiendaApp.openProductModal('${p.id}')" class="text-[13px] sm:text-sm font-bold text-slate-900 group-hover:text-[#4EA1DD] line-clamp-2 min-h-[2.5rem] leading-snug cursor-pointer transition" title="${escapeCatalogText(p.name)}">
                ${escapeCatalogText(p.name)}
              </h3>

              <p class="text-[11px] text-slate-500 truncate font-normal">
                ${escapeCatalogText(p.presentation || 'Presentación profesional')}
              </p>

              <!-- Precio de venta -->
              <div class="pt-2 flex items-baseline gap-2">
                <span class="price-stayclean text-base sm:text-lg font-black tracking-tight">
                  ${Formatter.money(p.display_price ?? p.sale_price)}
                </span>
                ${p.discount_pct > 0 && p.reference_price > (p.display_price ?? p.sale_price) ? `
                  <span class="text-xs text-slate-400 line-through font-normal">
                    ${Formatter.money(p.reference_price)}
                  </span>` : ''}
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
              <button onclick="window.tiendaApp.openProductModal('${p.id}')" class="btn-stayclean w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs">
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
  async openProductModal(productId, presentationId) {
    if (!this.catalogAromas.size) await this.loadAromaFilter();
    const p = this.products.find(item => item.id === productId);
    if (!p) return;

    const modal = document.getElementById('productDetailModal');
    const content = document.getElementById('productDetailContent');
    if (!modal || !content) return;

    const forms = (this.presentations || []).filter(form=>form.product_id===p.id);
    const hasBaseOption = Number(p.sale_price)>0 && forms.some(row=>row.code===p.sku);
    const form = (presentationId === '' || (presentationId == null && hasBaseOption && this.availablePresentation(p)>0))
      ? undefined : forms.find(row=>row.id===presentationId) || forms.find(row=>this.availablePresentation(p,row)>0) || forms[0];
    const aromas = [...(this.catalogAromas.get(p.id) || [])];
    const available = this.availablePresentation(p,form);
    const price = form ? Number(form.price) : p.sale_price;

    content.innerHTML = `
      <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-[#0E3A6B] text-white">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-[#8FD0F4] block">Detalle de Producto</span>
          <h3 class="text-sm font-bold text-white">${escapeCatalogText(p.name)}</h3>
        </div>
        <button onclick="window.tiendaApp.closeProductModal()" class="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="p-6 space-y-5">
        <div class="flex flex-col sm:flex-row gap-5 items-center">
          <div class="w-48 h-48 bg-slate-50 rounded-xl p-3 shrink-0 flex items-center justify-center border border-slate-100">
            <img src="${p.img_url}" alt="${escapeCatalogText(p.name)}" class="max-h-full max-w-full object-contain">
          </div>

          <div class="space-y-2 flex-1">
            <div class="flex items-center gap-2">
              ${p.discount_pct > 0 ? `<span class="badge-off px-2.5 py-0.5 rounded text-[11px] font-bold">-${p.discount_pct}% OFF</span>` : ''}
              <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ${available > 0 ? `Disponible (${available})` : 'Sin stock'}
              </span>
            </div>

            <h2 class="text-base font-bold text-slate-900">${escapeCatalogText(p.name)}</h2>
            <p class="text-xs text-slate-500">${escapeCatalogText(p.description || p.presentation || 'Insumo de primera calidad para gastronomía y hotelería.')}</p>
            
            <div class="pt-2 flex items-baseline gap-2">
              <span class="price-stayclean text-2xl font-black">${Formatter.money(price)}</span>
            </div>
            <p class="text-[11px] text-slate-400">Precios finales en Pesos Argentinos (ARS) con IVA incluido.</p>
          </div>
        </div>

        <p class="border-t border-slate-100 pt-4 text-xs text-slate-700">
          <span class="font-bold">Presentación</span> · ${escapeCatalogText(p.presentation || p.sale_unit || 'Unidad')}
        </p>

        <div class="space-y-3 border-t border-slate-100 pt-4">
          ${forms.length ? `<label class="block font-semibold">Presentación <select id="modalPresentation" class="block w-full rounded-lg border p-3">${hasBaseOption ? `<option value="" ${form ? '' : 'selected'}>${escapeCatalogText(p.sale_unit)} · ${Formatter.money(p.sale_price)} · ${this.availablePresentation(p)} disp.</option>` : ''}${forms.map(row=>`<option value="${row.id}" ${row.id===form?.id ? 'selected' : ''}>${escapeCatalogText(row.name)} · ${Formatter.money(Number(row.price))} · ${this.availablePresentation(p,row)} disp.</option>`).join('')}</select></label>` : ''}
          ${available > 0 ? `
            ${aromas.length ? `<label class="block font-semibold text-slate-700">Aroma<select id="modalProductAroma" required class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3"><option value="">Seleccioná un aroma</option>${aromas.map(aroma=>`<option value="${escapeCatalogText(aroma)}">${escapeCatalogText(aroma.toLocaleUpperCase('es-AR'))}</option>`).join('')}</select></label>` : ''}
            <div class="flex items-center justify-between gap-3">
              <label for="modalProductQty" class="text-sm font-semibold text-slate-700">Cantidad a agregar</label>
              <div class="flex items-center rounded-lg border border-slate-300 bg-slate-50">
                <button type="button" aria-label="Reducir cantidad" onclick="window.tiendaApp.stepModalQty(-1)" class="px-3 py-2 font-bold">−</button>
                <input type="number" id="modalProductQty" value="1" min="1" max="${available}" required class="w-14 bg-transparent text-center text-sm font-bold">
                <button type="button" aria-label="Aumentar cantidad" onclick="window.tiendaApp.stepModalQty(1)" class="px-3 py-2 font-bold">+</button>
              </div>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <button type="button" onclick="window.tiendaApp.addFromModal('${p.id}')" class="rounded-xl border border-slate-300 px-3 py-3 text-xs font-bold text-[#0E3A6B] hover:bg-slate-50">
                Seguir comprando
              </button>
              <button type="button" onclick="window.tiendaApp.addFromModal('${p.id}', true)" class="btn-stayclean rounded-xl px-3 py-3 text-xs font-bold">
                Finalizar compra
              </button>
            </div>
          ` : `
            <p class="text-sm text-slate-600">${p.in_stock ? 'Ya tenés todas las unidades disponibles en el carrito.' : 'Producto agotado.'}</p>
            <button type="button" onclick="window.tiendaApp.closeProductModal()" class="w-full rounded-xl border border-slate-300 py-3 text-xs font-bold text-[#0E3A6B]">Seguir comprando</button>
          `}
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    const selector=content.querySelector('#modalPresentation');
    if (selector) selector.onchange=async()=>{
      const aroma=content.querySelector('#modalProductAroma')?.value;
      await this.openProductModal(productId,selector.value);
      const input=content.querySelector('#modalProductAroma');
      if (input && aroma) input.value=aroma;
      content.querySelector('#modalPresentation')?.focus();
    };
    if (window.lucide) window.lucide.createIcons();
  }

  availablePresentation(product, form = null) {
    const items=this.cart.filter(item=>item.id===product.id);
    const forms=(this.presentations || []).filter(row=>row.product_id===product.id);
    const baseFactor=Number(forms[0]?.base_factor || 1);
    if (!form) {
      const used=items.filter(item=>!item.sealed).reduce((sum,item)=>sum+item.quantity*Number(item.factor || baseFactor),0);
      return Math.max(0,Math.floor(Number(product.current_stock)-used/baseFactor));
    }
    const relevant=items.filter(item=>form.sealed || !item.sealed);
    const used=relevant.reduce((sum,item)=>sum+item.quantity*Number(item.factor || baseFactor),0);
    const same=items.filter(item=>item.presentationId===form.id).reduce((sum,item)=>sum+item.quantity,0);
    return Math.max(0,Math.min(Number(form.available)-same,Math.floor((Number(form.available_base)-used)/Number(form.factor))));
  }

  stepModalQty(delta) {
    const input = document.getElementById('modalProductQty');
    if (!input) return;
    const value = Math.trunc(input.valueAsNumber) || 1;
    input.value = Math.min(Number(input.max), Math.max(1, value + delta));
  }

  addFromModal(productId, checkout = false) {
    const input = document.getElementById('modalProductQty');
    if (!input || !input.reportValidity()) return;
    const aroma = document.getElementById('modalProductAroma');
    if (aroma && !aroma.reportValidity()) return;
    const presentationId=document.getElementById('modalPresentation')?.value || undefined;
    if (!this.addToCart(productId, input.valueAsNumber, aroma?.value || '', presentationId)) return;
    this.closeProductModal();
    if (checkout) return this.proceedToCheckout();
  }

  closeProductModal() {
    const modal = document.getElementById('productDetailModal');
    if (modal) modal.classList.add('hidden');
  }

  // ==========================================
  // CARRITO DE COMPRAS (DRAWER SLIDE-OVER)
  // ==========================================
  addToCart(productId, qty = 1, aroma = '', presentationId) {
    const p = this.products.find(item => item.id === productId);
    if (!p || !p.in_stock) return;

    const form=(this.presentations || []).find(row=>row.id===presentationId && row.product_id===productId);
    const existing = this.cart.find(item => item.id === productId && item.presentationId===presentationId && (item.aroma || '') === aroma);
    if (!Number.isInteger(qty) || qty < 1 || (presentationId && !form) || qty > this.availablePresentation(p,form)) {
      this.showNotice('Revisá la cantidad disponible para este producto.');
      return false;
    }
    if (existing) {
      existing.quantity += qty;
    } else {
      this.cart.push({
        id: p.id,
        aroma,
        name: p.name,
        price: Number(form?.price ?? p.sale_price),
        presentation: form?.name || p.presentation || p.sale_unit,
        presentationId, factor: form?.factor, sealed: form?.sealed, baseFactor: form?.base_factor,
        img_url: p.img_url,
        quantity: qty
      });
    }

    this.saveCart();
    this.renderCartItems();
    return true;
  }

  updateCartQty(index, delta) {
    const item = this.cart[index];
    if (!item) return;

    const product = this.products.find(p=>p.id===item.id);
    const form=(this.presentations || []).find(row=>row.id===item.presentationId);
    if (delta > 0 && (!product || (item.presentationId && !form) || delta>this.availablePresentation(product,form))) return;
    item.quantity += delta;
    if (item.quantity <= 0) this.cart.splice(index,1);
    this.saveCart();
    this.renderCartItems();
  }

  removeFromCart(index) {
    this.cart.splice(index,1);
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

    container.innerHTML = this.cart.map((item,index) => `
      <div class="py-3 flex items-center gap-3">
        <img src="${item.img_url}" alt="${escapeCatalogText(item.name + (item.aroma ? ' · ' + item.aroma : ''))}" class="w-14 h-14 object-contain rounded-lg bg-slate-50 border border-slate-100 p-1 shrink-0">
        
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-bold text-slate-800 truncate">${escapeCatalogText(item.name + (item.aroma ? ' · ' + item.aroma : ''))}</h4>
          <p class="text-[10px] text-slate-400 truncate">${escapeCatalogText(item.presentation || '')}</p>
          <span class="text-xs font-extrabold text-[#1f4e5b] block mt-0.5">
            ${Formatter.money(item.price)}
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <div class="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white text-xs">
            <button onclick="window.tiendaApp.updateCartQty(${index}, -1)" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold">-</button>
            <span class="px-2 py-1 font-bold text-slate-800">${item.quantity}</span>
            <button onclick="window.tiendaApp.updateCartQty(${index}, 1)" class="px-2 py-1 text-slate-600 hover:bg-slate-100 font-bold">+</button>
          </div>
          <button onclick="window.tiendaApp.removeFromCart(${index})" class="p-1 text-slate-300 hover:text-rose-500 rounded transition" title="Eliminar">
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
      invoice_type: 'B',
      notes: document.getElementById('profNotes').value.trim(),
      updated_at: new Date().toISOString()
    };

    try {await this.saveCustomerProfileData(profile);} catch(err){this.showNotice(err.message);return;}
    this.closeProfileModal();

    // Si tiene productos en el carrito y venía del checkout, abrir confirmación
    if (this.cart.length > 0) {
      this.openOrderConfirmation();
    } else {
      this.showNotice('¡Perfil de entrega guardado correctamente!');
    }
  }

  async checkPaymentReturn() {
    const params=new URLSearchParams(location.search);
    const state=params.get('mp'), requestId=params.get('request_id');
    if(!state || !requestId) return;
    const token=await staycleanAuthToken();
    if(!token){this.showNotice('Iniciá sesión para consultar el resultado de tu pago. Conservamos el enlace de retorno para que puedas verificarlo. No vuelvas a pagar hasta hacerlo.');return;}
    try {
      const res=await fetch(STAYCLEAN_SUPABASE_URL+'/functions/v1/get-mp-checkout-status',{
        method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({request_id:requestId})
      });
      const data=await res.json();
      if(!res.ok) throw Error(data.error||'No se pudo consultar el pago');
      if(data.status==='approved'||data.status==='paid'||data.status==='completed'){
        history.replaceState(null,'',location.pathname);
        this.cart=[];this.saveCart();this.pendingRequestId=null;sessionStorage.removeItem('stayclean_pending_order_id');
        this.showOrderConfirmationWithRemito(data.order_number, 'Pago aprobado. Podés consultar tu pedido desde Mi cuenta → Mis pedidos.');
      } else {
        this.showNotice('Estado del pago: '+(data.mp_status||data.status||'pendiente')+'. Conservá este enlace para volver a consultar. No repitas el pago hasta verificar su estado.');
      }
    } catch(e){this.showNotice('No pudimos verificar el pago: '+e.message+'. Consultá el pedido antes de intentar pagar nuevamente.');}
  }

  async confirmSelectedPayment() {
    const mode=document.getElementById('checkoutPaymentMethod')?.value;
    if(mode==='Mercado Pago'){this.showNotice('Mercado Pago no está disponible por el momento.');return;}
    if(!mode){this.showNotice('Seleccioná una forma de pago.');return;}
    return this.submitOfflineOrder(mode);
  }

  async startMercadoPagoCheckout() {
    if(this.sendingOrder)return;
    if(!this.cart.length){this.showNotice('Tu carrito está vacío.');return;}
    const token=await staycleanAuthToken();
    if(!token){await this.openAccountDialog();return;}
    if(!this.customerProfile?.name||!this.customerProfile?.phone||!this.customerProfile?.address){this.openProfileModal();return;}
    if (this.sendingOrder) return;
    this.sendingOrder = true;
    try {
      if (!await this.confirmTestPayment()) return;
      const requestId = this.pendingRequestId || (this.pendingRequestId = crypto.randomUUID());
      sessionStorage.setItem('stayclean_pending_order_id', requestId);
      const response=await fetch(STAYCLEAN_SUPABASE_URL+'/functions/v1/create-mp-checkout',{
        method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({request_id:requestId,items:this.cart.map(item=>({product_id:item.id,quantity:item.quantity,aroma:item.aroma || null}))})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||data.detail||'Mercado Pago no pudo iniciar el pago');
      const checkout=new URL(data.checkout_url||'');
      if(checkout.protocol!=='https:' || !/(^|\.)mercadopago\.com(\.ar)?$/.test(checkout.hostname))throw Error('Mercado Pago no devolvió un enlace de pago válido');
      location.assign(data.checkout_url);
    }catch(e){this.showNotice('No se inició el pago ni se confirmó el pedido: '+e.message);}
    finally{this.sendingOrder=false;}
  }


  async checkAssistedAccess() {
    const button = document.getElementById('btnAssistedCheckout');
    if (!button) return;
    button.classList.add('hidden');
    this.isStaff = false;
    try {
      if (await staycleanAuthToken() && await staycleanCustomerRpc('stayclean_is_staff')) { this.isStaff = true; button.classList.remove('hidden'); }
    } catch (error) { console.warn('Venta asistida no habilitada:', error.message); }
  }

  async openAssistedCheckout() {
    if (!this.cart.length) { this.showNotice('Agregá productos al carrito primero.'); return; }
    if (!await staycleanAuthToken()) { await this.openAccountDialog(); return; }
    try {
      if (await staycleanCustomerRpc('stayclean_is_staff') !== true) throw Error('Solo administradores pueden cargar ventas asistidas');
      this.closeCart();
      this.closeOrderConfirmation();
      let modal = document.getElementById('assistedCheckoutModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'assistedCheckoutModal';
        modal.className = 'fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4';
        modal.innerHTML = `
          <div class="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 shadow-xl space-y-4">
            <div class="flex items-center justify-between"><h2 class="text-xl font-extrabold text-[#0E3A6B]">Venta asistida · Comprar para otro cliente</h2><button type="button" id="assistedClose" class="text-2xl" aria-label="Cerrar">×</button></div>
            <p class="text-sm text-slate-600">El pedido se registra a nombre del cliente elegido. Tu cuenta queda registrada como operadora.</p>
            <label class="block text-sm font-bold">Buscar cliente (nombre, teléfono o correo)</label>
            <input id="assistedSearch" type="search" placeholder="Escribí para buscar..." class="w-full border rounded-lg p-3" />
            <label class="block text-sm font-bold">Cliente</label>
            <select id="assistedCustomer" class="w-full border rounded-lg p-3"><option value="">Seleccioná un cliente</option></select>
            <button type="button" id="assistedNewToggle" class="text-sm font-bold text-blue-700 underline">Mostrar / ocultar formulario de cliente nuevo</button>
            <div id="assistedNewForm" class="space-y-2 p-3 rounded-lg bg-slate-50">
              <input id="assistedNewName" class="w-full border rounded-lg p-2" placeholder="Nombre y apellido / comercio" />
              <input id="assistedNewDni" class="w-full border rounded-lg p-2" inputmode="numeric" placeholder="DNI (solo números)" />\n              <input id="assistedNewPhone" class="w-full border rounded-lg p-2" placeholder="Teléfono WhatsApp" />
              <input id="assistedNewAddress" class="w-full border rounded-lg p-2" placeholder="Dirección de entrega" />
              <select id="assistedNewCity" class="w-full border rounded-lg p-2"><option value="Caviahue">Caviahue</option><option value="Copahue">Copahue</option></select>
              <input id="assistedNewEmail" class="w-full border rounded-lg p-2" placeholder="Correo (opcional)" />
              <button id="assistedCreateCustomer" type="button" class="w-full bg-blue-700 text-white rounded-lg p-2 font-bold">Guardar cliente y seleccionarlo</button>
            </div>
            <div id="assistedCustomerInfo" class="text-sm text-slate-600"></div>
            <div id="assistedOrderTotal" class="font-bold text-lg text-[#0E3A6B]"></div>
            <label class="block text-sm font-bold">Forma de pago</label>
            <select id="assistedPayment" class="w-full border rounded-lg p-3">
              <option value="Efectivo contra entrega">Efectivo contra entrega</option>
              <option value="Transferencia Bancaria">Transferencia bancaria</option>
              <option value="Cuenta Corriente">Cuenta corriente</option>
              <option value="A coordinar">A coordinar</option>
            </select>
            <div id="assistedError" role="alert" class="text-sm text-red-600"></div>
            <button id="assistedConfirm" type="button" class="w-full bg-[#0E3A6B] text-white rounded-xl p-3 font-bold" disabled>Registrar pedido para este cliente</button>
          </div>`;
        document.body.appendChild(modal);
        modal.querySelector('#assistedClose').onclick = () => modal.remove();
        modal.querySelector('#assistedNewToggle').onclick = () => modal.querySelector('#assistedNewForm').classList.toggle('hidden');
        modal.querySelector('#assistedCreateCustomer').onclick = () => this.createAssistedCustomer();
        modal.querySelector('#assistedSearch').oninput = () => this.searchAssistedCustomers();
        modal.querySelector('#assistedCustomer').onchange = () => this.selectAssistedCustomer();
        modal.querySelector('#assistedConfirm').onclick = () => this.submitAssistedOrder();
      }
      this.assistedCustomer = null;
      this.assistedPrices = null;
      this.assistedCustomers = [];
      await this.searchAssistedCustomers();
    } catch (error) { this.showNotice(error.message); }
  }

  async createAssistedCustomer() {
    const modal=document.getElementById('assistedCheckoutModal');
    if(!modal)return;
    const error=modal.querySelector('#assistedError');
    const button=modal.querySelector('#assistedCreateCustomer');
    button.disabled=true;
    try {
      const id=await staycleanCustomerRpc('stayclean_staff_assisted_create_customer',{
        p_name:modal.querySelector('#assistedNewName').value.trim(),
        p_phone:modal.querySelector('#assistedNewPhone').value.trim(),
        p_address:modal.querySelector('#assistedNewAddress').value.trim(),
        p_city:modal.querySelector('#assistedNewCity').value,
        p_email:modal.querySelector('#assistedNewEmail').value.trim()
      });
      modal.querySelector('#assistedSearch').value='';
      await this.searchAssistedCustomers();
      const index=this.assistedCustomers.findIndex(c=>c.id===id);
      if(index<0) {
        modal.querySelector('#assistedSearch').value=modal.querySelector('#assistedNewName').value.trim();
        await this.searchAssistedCustomers();
      }
      const chosen=this.assistedCustomers.findIndex(c=>c.id===id);
      if(chosen<0)throw Error('Cliente creado. Buscalo por nombre para seleccionarlo.');
      modal.querySelector('#assistedCustomer').value=String(chosen);
      modal.querySelector('#assistedNewForm').classList.add('hidden');
      await this.selectAssistedCustomer();
    } catch(e){error.textContent=e.message;} finally {button.disabled=false;}
  }

  async searchAssistedCustomers() {
    const modal = document.getElementById('assistedCheckoutModal');
    if (!modal) return;
    const term = modal.querySelector('#assistedSearch').value.trim();
    const select = modal.querySelector('#assistedCustomer');
    const error = modal.querySelector('#assistedError');
    select.innerHTML = '<option value="">Buscando clientes...</option>';
    error.textContent = '';
    try {
      const rows = await staycleanCustomerRpc('stayclean_staff_assisted_customers', {p_search:term});
      if (!modal.isConnected || modal.querySelector('#assistedSearch').value.trim() !== term) return;
      this.assistedCustomers = rows || [];
      select.innerHTML = '<option value="">Seleccioná un cliente</option>' + this.assistedCustomers.map((c,i)=>`<option value="${i}">${escapeCatalogText(c.name)} · ${escapeCatalogText(c.phone||'Sin teléfono')}</option>`).join('');
      this.assistedCustomer = null;
      this.assistedPrices = null;
      modal.querySelector('#assistedConfirm').disabled = true;
      modal.querySelector('#assistedOrderTotal').textContent = '';
      modal.querySelector('#assistedCustomerInfo').textContent = this.assistedCustomers.length ? '' : 'No hay clientes que coincidan. Crealo desde ERP → Clientes.';
    } catch (e) { select.innerHTML='<option value="">Error al buscar</option>';error.textContent=e.message; }
  }

  async selectAssistedCustomer() {
    const modal=document.getElementById('assistedCheckoutModal');
    if (!modal) return;
    const value=modal.querySelector('#assistedCustomer').value;
    const c=value===''?null:this.assistedCustomers[Number(value)];
    this.assistedCustomer=c||null;
    this.assistedPrices=null;
    modal.querySelector('#assistedConfirm').disabled=true;
    modal.querySelector('#assistedOrderTotal').textContent='';
    if (!c) return;
    modal.querySelector('#assistedCustomerInfo').textContent=`Entrega: ${c.address||'Sin dirección'}, ${c.city||'Sin localidad'} · ${c.cost_price_list_enabled?'Lista al costo':'Precio de venta'}`;
    if (!c.phone || !c.address || !['Caviahue','Copahue'].includes(c.city)) {
      modal.querySelector('#assistedError').textContent='Completá teléfono, dirección y localidad del cliente desde ERP → Clientes antes de confirmar.';
      return;
    }
    try {
      const prices=await staycleanCustomerRpc('stayclean_staff_assisted_prices',{p_customer_id:c.id,p_product_ids:this.cart.map(item=>item.id)});
      if(this.assistedCustomer!==c) return;
      if(this.cart.some(item=>!Number.isFinite(this.assistedUnitPrice(item,prices,c))||this.assistedUnitPrice(item,prices,c)<=0))throw Error('Falta un precio válido para un producto');
      this.assistedPrices=prices;
      const total=Math.round(this.cart.reduce((sum,item)=>sum+this.assistedUnitPrice(item,prices,c)*item.quantity,0)*100)/100;
      modal.querySelector('#assistedOrderTotal').textContent='Total para '+c.name+': '+Formatter.money(total);
      modal.querySelector('#assistedError').textContent='';
      modal.querySelector('#assistedConfirm').disabled=false;
    } catch(e){modal.querySelector('#assistedError').textContent=e.message;}
  }

  assistedUnitPrice(item, prices, customer) {
    if (!item.presentationId) return Number(prices[item.id]);
    return customer.cost_price_list_enabled ? Math.round(Number(prices[item.id])*item.factor/item.baseFactor*100)/100 : item.price;
  }

  async submitAssistedOrder() {
    if(this.sendingOrder||!this.assistedCustomer||!this.assistedPrices)return;
    const modal=document.getElementById('assistedCheckoutModal');
    const button=modal.querySelector('#assistedConfirm');
    const error=modal.querySelector('#assistedError');
    const c=this.assistedCustomer;
    const method=modal.querySelector('#assistedPayment').value;
    if(method==='Cuenta Corriente'&&!c.credit_account_enabled){error.textContent='Este cliente no tiene habilitada la cuenta corriente.';return;}
    this.sendingOrder=true;
    button.disabled=true;
    try {
      const total=Math.round(this.cart.reduce((sum,item)=>sum+this.assistedUnitPrice(item,this.assistedPrices,c)*item.quantity,0)*100)/100;
      const requestId=this.pendingRequestId||(this.pendingRequestId=crypto.randomUUID());
      sessionStorage.setItem('stayclean_pending_order_id',requestId);
      const result=await staycleanCustomerRpc('stayclean_staff_assisted_order',{p_order:{
        request_id:requestId,customer_id:c.id,customer_name:c.name,customer_phone:c.phone,
        customer_email:c.email||'',delivery_address:c.address,delivery_city:c.city,
        payment_method:method,expected_cost_total:total,
        items:this.cart.map(item=>({product_id:item.id,quantity:item.quantity,aroma:item.aroma || null,presentation_id:item.presentationId || null}))
      }});
      this.cart=[];
      this.saveCart();
      this.pendingRequestId=null;
      sessionStorage.removeItem('stayclean_pending_order_id');
      modal.remove();
      await this.loadProducts();
      if (method === 'Transferencia Bancaria') this.showTransferDetails(result.order_number, result.total ?? total, false);
      else this.showNotice('Venta asistida registrada para '+c.name+'. Pedido '+result.order_number+'. Stock descontado.');
    }catch(e){error.textContent='No se registró el pedido: '+e.message+'. El carrito permanece intacto.';}
    finally{this.sendingOrder=false;if(button.isConnected)button.disabled=false;}
  }

  async proceedToCheckout() {
    if(!await staycleanAuthToken()){this.closeCart();await this.openAccountDialog();return;}
    if (this.cart.length === 0) {
      this.showNotice('Tu carrito está vacío. Agregá productos antes de continuar.');
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

  async openOrderConfirmation() {
    this.expectedCostTotal = undefined;
    let costPrices;
    if (this.customerProfile) {
      const profile = this.customerProfile;
      profile.creditAccountEnabled = false;
      try {
        const current = await staycleanCustomerProfile();
        profile.creditAccountEnabled = current?.credit_account_enabled === true;
        if (current?.cost_price_list_enabled === true) {
          costPrices = await staycleanCustomerRpc('stayclean_customer_cost_prices', {p_product_ids: this.cart.map(item => item.id)});
        }
      } catch (error) {
        this.showNotice('No se pudo verificar el precio del pedido: ' + error.message);
        return;
      }
      if (this.customerProfile !== profile) return;
    }
    const modal = document.getElementById('orderConfirmationModal');
    const content = document.getElementById('orderConfirmationContent');
    if (!modal || !content) return;

    const prof = this.customerProfile;
    const totalCount = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const unitPrice = item => costPrices ? Math.round(Number(costPrices[item.id])*Number(item.factor || 1)/Number(item.baseFactor || 1)*100)/100 : item.price;
    if (costPrices && this.cart.some(item => !Number.isFinite(unitPrice(item)))) return;
    const totalAmount = Math.round(this.cart.reduce((sum, item) => sum + unitPrice(item) * item.quantity, 0) * 100) / 100;
    if (costPrices) this.expectedCostTotal = totalAmount;

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
              <strong class="text-slate-800">${escapeCatalogText(prof.name)}</strong>
              <button type="button" onclick="window.tiendaApp.openAssistedCheckout()" class="block mt-1 text-blue-700 font-bold underline text-[11px]">Cambiar cliente · Venta asistida</button>
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
                <span class="text-slate-400 block">CUIT / DNI:</span>
                <span class="text-slate-700">${prof.tax_id}</span>
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
            <span>Productos a entregar (${totalCount})${costPrices ? ' · Lista al costo' : ''}:</span>
            <span class="font-extrabold text-[#1f4e5b]">${Formatter.money(totalAmount)}</span>
          </h4>
          <div class="max-h-36 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg p-2 bg-white">
            ${this.cart.map(item => `
              <div class="py-1.5 flex justify-between items-center text-[11px]">
                <div class="truncate max-w-[240px]">
                  <strong>${item.quantity}x</strong> ${escapeCatalogText(item.name + (item.aroma ? ' · ' + item.aroma : ''))}
                </div>
                <div class="font-mono text-slate-800 shrink-0">
                  ${Formatter.money(unitPrice(item) * item.quantity)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Método de Pago Preferido -->
        <div class="space-y-1.5">
          <label class="block font-bold text-slate-700">Forma de Pago:</label>
          <select id="checkoutPaymentMethod" class="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#2b5158] outline-none">
            <option value="Mercado Pago" disabled>Mercado Pago — No disponible</option>
            <option value="Efectivo contra entrega" selected>Efectivo contra entrega en Caviahue</option>
            <option value="Transferencia Bancaria">Transferencia Bancaria (Alias / CVU)</option>
            <option value="Cuenta Corriente" ${prof.creditAccountEnabled ? '' : 'disabled'}>${prof.creditAccountEnabled ? 'Cuenta Corriente Comercial' : 'Cuenta Corriente — No disponible'}</option>
          </select>
        </div>

        <!-- Confirmar forma de pago -->
        <div class="pt-3 border-t border-slate-100 space-y-2">
          <button onclick="window.tiendaApp.confirmSelectedPayment()" class="w-full py-3.5 rounded-xl font-bold text-sm bg-[#0E3A6B] hover:bg-[#1E88E5] text-white shadow-md flex items-center justify-center gap-2">
            <i data-lucide="check-circle" class="w-4 h-4"></i><span>Continuar con la forma de pago elegida</span>
          </button>
          <p class="text-[10px] text-slate-500 text-center">El pedido se registra para coordinar el pago. Si elegís transferencia, enviá el comprobante por WhatsApp al 11 4156 4004.</p>
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

  async submitOfflineOrder(paymentMethod) {
    if (this.sendingOrder) return;
    const prof = this.customerProfile;
    if (!prof || !this.cart.length) return;
    this.sendingOrder = true;
    const requestId = this.pendingRequestId || (this.pendingRequestId = crypto.randomUUID());
    sessionStorage.setItem('stayclean_pending_order_id', requestId);
    const city = /copahue/i.test(prof.zone || '') ? 'Copahue' : 'Caviahue';
    try {
      const savedOrder = await staycleanAuthenticatedOrder({
        request_id: requestId,
        customer_name: prof.name,
        customer_phone: prof.phone,
        customer_email: prof.email || '',
        delivery_address: prof.address || '',
        delivery_city: city,
        payment_method: paymentMethod,
        expected_cost_total: this.expectedCostTotal,
        items: this.cart.map(item => ({ product_id: item.id, quantity: item.quantity, aroma: item.aroma || null, presentation_id: item.presentationId || null }))
      });
      this.cart = [];
      this.saveCart();
      this.pendingRequestId = null;
      sessionStorage.removeItem('stayclean_pending_order_id');
      this.closeOrderConfirmation();
      await this.loadProducts();
      if (paymentMethod === 'Transferencia Bancaria') {
        let total = savedOrder.total;
        if (total == null) {
          try {
            const orders = await staycleanCustomerOrders();
            total = orders.find(order => order.number === savedOrder.order_number)?.total;
          } catch (error) { console.warn('No se pudo consultar el total del pedido', error); }
        }
        this.showTransferDetails(savedOrder.order_number, total);
      } else this.showOrderConfirmationWithRemito(savedOrder.order_number, `Pedido ${savedOrder.order_number} registrado. También podés descargar el remito desde Mi cuenta → Mis pedidos.`);
    } catch (error) {
      console.error('Error registrando pedido en Supabase', error);
      this.showNotice('No se registró el pedido: ' + error.message + '. El carrito permanece intacto.');
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
