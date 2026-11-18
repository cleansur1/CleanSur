// Controlador Principal & Router para Limpieza Caviahue ERP v6.0
import { db } from './db.js';
import { signInAdmin, signOutAdmin } from './supabase_admin.js';
import { readCentral, readCentralDashboard, centralTables } from './supabase_erp_adapter.js';
import { DashboardView } from './views/dashboard.js?v=8.0';
import { VentasView } from './views/ventas.js?v=8.0';
import { ComprasView } from './views/compras.js?v=13.1';
import { ProductosView } from './views/productos.js?v=7.0';
import { StockView } from './views/stock.js?v=6.0';
import { PreciosView } from './views/precios.js?v=6.0';
import { ClientesView } from './views/clientes.js?v=6.0';
import { CuentasCorrientesView } from './views/cuentas_corrientes.js?v=6.0';
import { ComparadorView } from './views/comparador.js?v=6.0';
import { ReposicionView } from './views/reposicion.js?v=6.0';
import { EstacionalidadView } from './views/estacionalidad.js?v=6.0';
import { GastosView } from './views/gastos.js?v=6.0';
import { PedidosView } from './views/pedidos.js?v=6.0';
import { OrdenesCompraView } from './views/ordenes_compra.js?v=6.0';
import { ReportesView } from './views/reportes.js?v=6.0';
import { AuditoriaView } from './views/auditoria.js?v=6.0';
import { ConfiguracionView } from './views/configuracion.js?v=6.0';
import { UsuariosView } from './views/usuarios.js?v=6.0';
import { OcrFacturasView } from './views/ocr_facturas.js?v=6.2';
import { CajaView } from './views/caja.js?v=6.0';
import { ArcaView } from './views/arca.js?v=6.0';
import { TiendaView } from './views/tienda.js?v=6.0';

let deferredPrompt = null;

class App {
  constructor() {
    this.currentRoute = 'dashboard';
    this.routeParams = {};
    this.views = {
      dashboard: DashboardView,
      ventas: VentasView,
      pedidos: PedidosView,
      caja: CajaView,
      arca: ArcaView,
      compras: ComprasView,
      ocr_facturas: OcrFacturasView,
      productos: ProductosView,
      stock: StockView,
      precios: PreciosView,
      clientes: ClientesView,
      cuentas_corrientes: CuentasCorrientesView,
      proveedores: ComparadorView,
      comparador: ComparadorView,
      ordenes_compra: OrdenesCompraView,
      gastos: GastosView,
      reposicion: ReposicionView,
      estacionalidad: EstacionalidadView,
      reportes: ReportesView,
      tienda: TiendaView,
      usuarios: UsuariosView,
      auditoria: AuditoriaView,
      configuracion: ConfiguracionView
    };
  }

  init() {
    // Normalización comercial V2 automática e idempotente (con snapshot de respaldo previo)
    try {
      if (!this.centralReadOnly) db.runDataNormalizations();
    } catch (normErr) {
      console.warn('Advertencia en normalización V2:', normErr);
    }

    this.setupNavigation();
    this.setupGlobalSearch();
    this.setupPWA();
    this.updateUserHeader();
    this.applyRolePermissions();
    this.navigate('dashboard');

    // Manejar atajo de teclado Ctrl+K
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.openGlobalSearch();
      }
    });
  }

  applyRolePermissions() {
    const user = db.getCurrentUser();
    document.querySelectorAll('.nav-link').forEach(link => {
      const route = link.getAttribute('data-route');
      const hasAccess = db.hasPermission(route);
      const li = link.closest('li');
      if (li) {
        if (!hasAccess && route !== 'dashboard') {
          li.style.display = 'none';
        } else {
          li.style.display = '';
        }
      }
    });
  }

  navigate(route, params = {}) {
    // Unificar ocr_facturas dentro de la pestaña compras
    if (route === 'ocr_facturas') {
      route = 'compras';
      params = { ...params, action: 'ocr' };
    }
    if (!this.views[route]) {
      route = 'dashboard';
    }

    // Verificar permisos del rol
    if (!db.hasPermission(route) && route !== 'dashboard') {
      const u = db.getCurrentUser();
      alert(`Acceso denegado: Tu perfil (${u.role}) no tiene permisos para acceder al módulo "${route}".`);
      route = 'dashboard';
    }

    this.currentRoute = route;
    this.routeParams = params;

    // Actualizar sidebar activo con identidad StayClean
    document.querySelectorAll('.nav-link').forEach(link => {
      const target = link.getAttribute('data-route');
      if (target === route) {
        link.className = 'nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0E3A6B] text-white shadow-md border-l-4 border-[#4EA1DD]';
      } else {
        link.className = 'nav-link flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-[#0E3A6B]/40 hover:text-white transition';
      }
    });

    // Cerrar sidebar móvil si está abierto
    const mobileSidebar = document.getElementById('sidebar');
    if (window.innerWidth < 1024 && mobileSidebar && !mobileSidebar.classList.contains('-translate-x-full')) {
      mobileSidebar.classList.add('-translate-x-full');
    }

    // Renderizar vista
    const mainContainer = document.getElementById('mainContent');
    if (mainContainer) {
      mainContainer.innerHTML = '';
      try {
        this.views[route].render(mainContainer, params);
        window.scrollTo(0, 0);
      } catch (err) {
        console.error(`Error renderizando la vista ${route}:`, err);
        mainContainer.innerHTML = `
          <div class="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 shadow-sm">
            <div class="flex items-center gap-3 mb-3">
              <span class="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold">!</span>
              <div>
                <h3 class="font-bold text-base">Error al cargar el módulo "${route}"</h3>
                <p class="text-xs text-rose-600">Se produjo una excepción durante la inicialización de esta pantalla.</p>
              </div>
            </div>
            <div class="text-xs font-mono bg-white p-3 rounded-lg border border-rose-200 text-slate-800 break-all mb-4">
              ${err.message || err}
            </div>
            <div class="flex gap-2">
              <button onclick="window.location.reload()" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
                Recargar Sistema (F5)
              </button>
              <button onclick="window.app.navigate('dashboard')" class="px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 transition">
                Ir al Dashboard
              </button>
            </div>
          </div>
        `;
      }
    }
  }

  setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.getAttribute('data-route');
        this.navigate(route);
      });
    });

    const menuBtn = document.getElementById('btnMobileMenu');
    const sidebar = document.getElementById('sidebar');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
      });
    }
  }

  updateUserHeader() {
    const user = db.getCurrentUser();
    const nameEl = document.getElementById('headerUserName');
    const roleEl = document.getElementById('headerUserRole');
    const avatarEl = document.getElementById('headerUserAvatar');

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = user.role;
    if (avatarEl) {
      const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      avatarEl.textContent = initials;
    }
  }

  showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    let bg = 'bg-slate-900 text-white border-slate-700';
    if (type === 'success') bg = 'bg-emerald-700 text-white border-emerald-600';
    if (type === 'error') bg = 'bg-rose-700 text-white border-rose-600';

    toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium flex items-center gap-2 animate-bounce-in ${bg}`;
    toast.innerHTML = `
      <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}" class="w-4 h-4"></i>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  setupGlobalSearch() {
    const modal = document.getElementById('globalSearchModal');
    const input = document.getElementById('globalSearchInput');
    const results = document.getElementById('globalSearchResults');

    if (input) {
      input.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (q.length === 0) {
          results.innerHTML = '<div class="p-6 text-center text-xs text-slate-400">Escribí para buscar productos, clientes, ventas...</div>';
          return;
        }

        const products = db.getProducts().filter(p => String(p.name || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q));
        const purchases = db.getPurchases().filter(p => String(p.invoice_number || '').toLowerCase().includes(q) || String(p.supplier_name || '').toLowerCase().includes(q));
        const customers = db.getCustomers().filter(c => String(c.name || '').toLowerCase().includes(q) || (c.cuit_dni && c.cuit_dni.includes(q)));
        const sales = db.getSales().filter(s => String(s.sale_number || '').toLowerCase().includes(q) || String(s.customer_name || '').toLowerCase().includes(q));

        let html = '';
        if (products.length > 0) {
          html += '<div class="p-2 text-[10px] font-bold uppercase text-slate-400">Artículos (por Código o Descripción)</div>';
          products.slice(0, 6).forEach(p => {
            html += `
              <div onclick="window.app.navigate('productos', { viewId: '${p.id}' }); window.app.closeGlobalSearch();" class="p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer flex justify-between items-center text-xs">
                <div>
                  <span class="font-mono font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded mr-2">${p.sku}</span>
                  <span class="font-bold text-slate-800">${p.name}</span>
                </div>
                <span class="font-bold text-emerald-700">Stock: ${p.current_stock} ${p.base_unit || 'u.'}</span>
              </div>
            `;
          });
        }

        if (purchases.length > 0) {
          html += '<div class="p-2 text-[10px] font-bold uppercase text-slate-400 mt-2">Facturas de Compra</div>';
          purchases.slice(0, 4).forEach(pur => {
            html += `
              <div onclick="window.app.navigate('compras', { supplier_id: '${pur.supplier_id}' }); window.app.closeGlobalSearch();" class="p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer flex justify-between items-center text-xs">
                <div>
                  <span class="font-mono font-bold text-slate-900">${pur.invoice_number}</span>
                  <span class="text-slate-600 ml-2 font-semibold">${pur.supplier_name}</span>
                </div>
                <span class="font-bold text-blue-700">$ ${(Number(pur.total_final) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
            `;
          });
        }

        if (customers.length > 0) {
          html += '<div class="p-2 text-[10px] font-bold uppercase text-slate-400 mt-2">Clientes</div>';
          customers.slice(0, 4).forEach(c => {
            html += `
              <div onclick="window.app.navigate('clientes', { viewId: '${c.id}' }); window.app.closeGlobalSearch();" class="p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer flex justify-between items-center text-xs">
                <div>
                  <span class="font-bold text-slate-800">${c.name}</span>
                  <span class="text-slate-400 ml-2 text-[11px]">${c.customer_type}</span>
                </div>
                <span class="text-indigo-600 font-semibold text-[11px]">${c.phone || ''}</span>
              </div>
            `;
          });
        }

        if (sales.length > 0) {
          html += '<div class="p-2 text-[10px] font-bold uppercase text-slate-400 mt-2">Ventas</div>';
          sales.slice(0, 3).forEach(s => {
            html += `
              <div onclick="window.ventasModule.showTicket('${s.id}'); window.app.closeGlobalSearch();" class="p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer flex justify-between items-center text-xs">
                <span class="font-mono font-bold text-slate-800">${s.sale_number} - ${s.customer_name}</span>
                <span class="font-bold text-slate-900">$ ${s.total.toFixed(2)}</span>
              </div>
            `;
          });
        }

        if (html === '') {
          html = '<div class="p-6 text-center text-xs text-rose-500">No se encontraron resultados coincidentes.</div>';
        }

        results.innerHTML = html;
      });
    }
  }

  openGlobalSearch() {
    const modal = document.getElementById('globalSearchModal');
    const input = document.getElementById('globalSearchInput');
    if (modal) modal.classList.remove('hidden');
    if (input) {
      input.value = '';
      input.focus();
    }
    if (window.lucide) window.lucide.createIcons();
  }

  closeGlobalSearch() {
    const modal = document.getElementById('globalSearchModal');
    if (modal) modal.classList.add('hidden');
  }

  setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById('btnInstallPWA');
      if (btn) btn.classList.remove('hidden');
    });

    const installBtn = document.getElementById('btnInstallPWA');
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
          alert('Para instalar en PC o celular, seleccioná "Instalar aplicación" o "Agregar a pantalla principal" desde el menú del navegador.');
          return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
      });
    }

    // Desregistrar cualquier Service Worker viejo para evitar que sirva versiones en caché
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      });
      if ('caches' in window) {
        caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
      }
    }
  }
}

export const app = new App();
window.app = app;

// Modo central de validación: reutiliza las 22 pantallas originales sin escrituras locales.
// Activación explícita: index.html?central=1. No es todavía el ERP transaccional.
async function bootCentralReadOnly() {
  const shield = document.createElement('div');
  shield.id = 'central-access';
  shield.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f1f5f9;display:grid;place-items:center;font-family:system-ui';
  shield.innerHTML = '<form id="central-form" style="background:white;border-radius:16px;padding:32px;max-width:410px;width:90%;box-shadow:0 10px 35px #0002"><h2 style="font-size:23px;font-weight:800;color:#0e3a6b">StayClean · ERP original</h2><p style="margin:12px 0;color:#475569">Inventario central de Supabase · 39 productos registrados · Ingresá para verlos</p><input name="email" type="email" autocomplete="username" required placeholder="Correo" style="width:100%;padding:12px;margin:6px 0;border:1px solid #cbd5e1;border-radius:8px"><input name="password" type="password" autocomplete="current-password" required placeholder="Contraseña" style="width:100%;padding:12px;margin:6px 0;border:1px solid #cbd5e1;border-radius:8px"><button style="background:#0e3a6b;color:white;padding:12px;border-radius:8px;width:100%;margin-top:12px">Ingresar</button><p id="central-error" role="alert" style="color:#b91c1c;margin-top:12px"></p></form>';
  document.body.append(shield);
  document.getElementById('stayclean-boot-status')?.remove();
  document.getElementById('central-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const error = document.getElementById('central-error');
    button.disabled = true;
    error.textContent = '';
    try {
      await signInAdmin(form.elements.email.value, form.elements.password.value);
      const names = [...Object.keys(centralTables),'arca_config','arca_invoices','seasons','users','cost_history'];
      const values = await Promise.all(names.map(async name => {
        try {
          const rows = await readCentral(centralTables[name] || name, {order:'id.asc',limit:10000});
          if (rows.length >= 10000) throw new Error('Límite de registros alcanzado en '+name);
          return rows;
        } catch (err) {
          if (['products','purchases','sales','inventory_movements'].includes(name)) throw err;
          console.warn('Tabla opcional no disponible:',name,err);
          return [];
        }
      }));
      const snapshot = Object.fromEntries(names.map((name,i)=>[name,values[i]]));
      // En el ERP original, ARCA es un objeto de configuración, no una lista.
      snapshot.arca_config = Array.isArray(snapshot.arca_config) ? (snapshot.arca_config[0] || {}) : {};
      // Estas dos tablas no tienen fecha created_at, pero sí se consultan por ID.
      // Nunca sobrescribir los datos remotos desde una pantalla local.
      const centralDashboard = await readCentralDashboard();
      const loadedProducts = snapshot.products?.length || 0;
      const loadedStock = (snapshot.products || []).reduce((sum, p) => sum + Number(p.current_stock || 0), 0);
      const loadedPurchases = snapshot.purchases?.length || 0;
      if (loadedProducts === 0) throw new Error('No se cargaron productos desde Supabase. No se usará el stock local como reemplazo.');
      console.info('StayClean central cargado:', {productos:loadedProducts,stock:loadedStock,compras:loadedPurchases});
      // Mantener en memoria, sin escribir ni sobrescribir el respaldo local.
      db.getTable = name => structuredClone(snapshot[name] ?? []);
      db.saveTable = () => { throw new Error('Operación local bloqueada: usá la transacción central autorizada'); };
      db.centralSetTable = (name, rows) => { snapshot[name] = structuredClone(rows); };
      db.logAudit = () => {};
      db.getCurrentUser = () => ({id:'central-staff',name:'Personal StayClean',role:'ADMINISTRADOR',permissions:new Proxy({}, {get:()=>true})});
      db.hasPermission = () => true;
      db.runDataNormalizations = () => {};
      app.centralReadOnly = true;
      app.centralDashboard = centralDashboard;
      shield.remove();
      app.init();
      // Acceso central: sin zócalo de diagnóstico. Mantener cierre de sesión accesible.
      const exit = document.createElement('button');
      exit.type = 'button';
      exit.textContent = 'Cerrar sesión';
      exit.setAttribute('aria-label', 'Cerrar sesión de CleanSur');
      exit.style.cssText = 'position:fixed;top:72px;right:16px;z-index:9000;background:white;color:#0e3a6b;border:1px solid #cbd5e1;border-radius:8px;padding:7px 12px;font:600 12px system-ui;box-shadow:0 2px 8px #0001';
      exit.onclick = async () => { await signOutAdmin(); location.reload(); };
      document.body.append(exit);
      // Bloqueo de controles de escritura: navegación permitida, formularios y acciones no.
      document.addEventListener('click', e => {
        if (e.target.closest('#central-access') || e.target === exit || e.target.closest('.nav-link')) return;
        const control = e.target.closest('button, input[type=submit], a[onclick], [role=button]');
        if (control) {
          const handler = control.getAttribute('onclick') || '';
          const safeNavigation = handler.includes('window.app.navigate(');
          const stockControl = app.currentRoute === 'stock' && ['openAdjustModal(', 'onAdjustProductChange(', 'switchTab('].some(method => handler.includes('window.stockModule.' + method));
          const ocrReadControl = app.currentRoute === 'compras' && (
            control.closest('#ocr-dropzone, #ocr-file-input, #btn-toggle-image, #btn-add-ocr-row, #btn-confirm-ocr-purchase, #btn-merge-efa-pages') ||
            control.classList.contains('btn-remove-ocr-row')
          );
          const purchaseControl = app.currentRoute === 'compras' && (
            /^window\.comprasModule\.(viewCentralPurchase|editCentralPurchase|cancelPurchase|setSupplierFilter|clearFilters)\(/.test(handler) ||
            control.matches('#centralPurchaseDetailModal .close-purchase-detail')
          );
          const priceControl = app.currentRoute === 'productos' && handler.includes('window.productosModule.changeCentralPrice(');
          if (safeNavigation || priceControl || stockControl || ocrReadControl || purchaseControl || (app.currentRoute === 'stock' && control.closest('#adjustStockModal'))) return;
          e.preventDefault(); e.stopImmediatePropagation();
          alert('Esta operación todavía no está habilitada para guardar en Supabase.');
        }
      }, true);
      document.addEventListener('submit', e => { if (e.target.closest('#adjustStockModal') && app.currentRoute==='stock') return; e.preventDefault(); e.stopImmediatePropagation(); }, true);
    } catch (err) {
      error.textContent = err.message || 'No se pudo iniciar la sesión';
      await signOutAdmin().catch(()=>{});
    } finally { button.disabled = false; }
  });
}
function boot() {
  if (new URLSearchParams(location.search).get('central') === '1') {
    bootCentralReadOnly();
  } else {
    document.getElementById('stayclean-boot-status')?.remove();
    app.init();
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
