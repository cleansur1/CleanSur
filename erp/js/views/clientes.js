// Módulo de Clientes & Ficha Comercial para Limpieza Caviahue
// Directorio de clientes, métricas de compra, límites de crédito y tipos de clientes.

import { db } from '../db.js';
import { getAdminSession } from '../supabase_admin.js';
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from '../supabase_public.js';
import { Formatter } from '../models.js';

export const ClientesView = {
  render(container, params = {}) {
    const isNew = params.action === 'new';
    const editId = params.editId;
    const viewId = params.viewId;

    const customers = db.getCustomers();
    const priceLists = db.getPriceLists();

    if (isNew || editId) {
      this.renderCustomerForm(container, priceLists, editId ? db.getCustomer(editId) : null);
    } else if (viewId) {
      this.renderCustomerDetail(container, db.getCustomer(viewId));
    } else {
      this.renderCustomerList(container, customers);
      this.renderStoreAccounts(container.querySelector('[data-store-accounts]'));
    }
  },

  async renderStoreAccounts(section) {
    const token = getAdminSession()?.access_token || sessionStorage.getItem('stayclean_staff_access_token');
    const list = section.querySelector('ul');
    const status = section.querySelector('[role=status]');
    if (!token) {
      status.textContent = 'Entrá al ERP en la nube con tu cuenta de personal para ver las cuentas de la tienda.';
      return;
    }
    try {
      const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/stayclean_staff_store_accounts', {
        method: 'POST',
        headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: '{}'
      });
      const accounts = await response.json();
      if (!response.ok || !Array.isArray(accounts)) throw Error('No se pudieron consultar las cuentas.');
      status.textContent = accounts.length ? '' : 'Todavía no hay cuentas registradas.';
      for (const account of accounts) {
        const row = document.createElement('li');
        row.className = 'border-t border-slate-200 py-2 text-sm';
        row.textContent = [account.name, account.email, account.confirmed ? 'Correo confirmado' : 'Correo pendiente',
          account.customer_id ? 'Perfil vinculado' : 'Perfil pendiente', account.qa ? 'Cuenta de prueba' : null].filter(Boolean).join(' · ');
        if (account.customer_id && !account.qa && db.getCustomer(account.customer_id)) {
          const action = document.createElement('button');
          action.type = 'button';
          action.className = 'ml-3 text-blue-800 font-semibold underline';
          action.textContent = 'Ver ficha';
          action.setAttribute('onclick', "window.app.navigate('clientes', {viewId: this.dataset.customerId})");
          action.dataset.customerId = account.customer_id;
          row.append(action);
        }
        list.append(row);
      }
    } catch {
      status.textContent = 'No se pudieron consultar las cuentas. Volvé a ingresar al ERP e intentá nuevamente.';
    }
  },

  renderCustomerList(container, customers) {
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Directorio de Clientes</h1>
            <p class="text-xs text-slate-500">Alojamientos turísticos, restaurantes, cabañas, administradores y particulares.</p>
          </div>
          <button onclick="window.app.navigate('clientes', { action: 'new' })" class="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
            <i data-lucide="user-plus" class="w-4 h-4"></i> + Nuevo Cliente
          </button>
        </div>

        <section data-store-accounts class="rounded-xl border border-slate-200 bg-white p-5">
          <h2 class="mb-2 font-bold">Cuentas de la tienda</h2>
          <p role="status" class="text-sm text-slate-600">Cargando cuentas…</p>
          <ul></ul>
        </section>

        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div class="relative w-full md:w-80">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-3 text-slate-400"></i>
            <input type="text" id="searchCustInput" placeholder="Buscar por nombre, CUIT, teléfono..." class="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none">
          </div>
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-500">Tipo de Cliente:</span>
            <select id="filterCustomerType" class="border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-700">
              <option value="TODOS">Todos</option>
              <option value="Alojamiento">Hotelería / Cabañas</option>
              <option value="Gastronomía">Gastronomía</option>
              <option value="Administrador">Administradores</option>
              <option value="Comercio">Comercios</option>
              <option value="Particular">Particulares</option>
            </select>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-3 px-4">Razón Social / Nombre</th>
                  <th class="py-3 px-4">CUIT / DNI</th>
                  <th class="py-3 px-4">Tipo</th>
                  <th class="py-3 px-4">Contacto / WhatsApp</th>
                  <th class="py-3 px-4">Dirección</th>
                  <th class="py-3 px-4 text-center">Cta Cte</th>
                  <th class="py-3 px-4 text-right">Saldo Actual</th>
                  <th class="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100" id="customersTableBody">
                ${customers.map(c => `
                  <tr class="hover:bg-slate-50 transition" data-type="${c.customer_type}">
                    <td class="py-3 px-4">
                      <div class="font-bold text-slate-900">${c.name}</div>
                      <div class="text-[11px] text-slate-500">${c.email || 'Sin email'}</div>
                    </td>
                    <td class="py-3 px-4 font-mono text-slate-600">${c.cuit_dni || '-'}</td>
                    <td class="py-3 px-4">
                      <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700">
                        ${c.customer_type}
                      </span>
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-1.5 text-slate-700">
                        <i data-lucide="phone" class="w-3.5 h-3.5 text-slate-400"></i>
                        <span>${c.phone || '-'}</span>
                      </div>
                    </td>
                    <td class="py-3 px-4 text-slate-600">${c.address || 'Caviahue'}</td>
                    <td class="py-3 px-4 text-center">
                      <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${c.credit_account_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                        ${c.credit_account_enabled ? 'Habilitada' : 'No'}
                      </span>
                    </td>
                    <td class="py-3 px-4 text-right font-bold ${c.current_balance > 0 ? 'text-amber-700' : 'text-slate-700'}">
                      ${Formatter.money(c.current_balance)}
                    </td>
                    <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
                      <button onclick="window.app.navigate('clientes', { viewId: '${c.id}' })" title="Ver Ficha y Estadísticas" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                      </button>
                      <button onclick="window.app.navigate('clientes', { editId: '${c.id}' })" title="Editar Cliente" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                      </button>
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
    this.attachListFilters();
  },

  renderCustomerForm(container, priceLists, customer = null) {
    const isEdit = !!customer;
    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-3xl mx-auto">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('clientes')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div>
              <h1 class="text-2xl font-bold text-slate-800 tracking-tight">
                ${isEdit ? `Editar Cliente: ${customer.name}` : 'Registrar Nuevo Cliente'}
              </h1>
              <p class="text-xs text-slate-500">Datos comerciales, cuenta corriente y lista de precios asignada.</p>
            </div>
          </div>
        </div>

        <form onsubmit="window.clientesModule.saveCustomer(event, '${customer ? customer.id : ''}')" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 text-xs">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre o Razón Social *</label>
              <input type="text" name="name" required value="${customer ? customer.name : ''}" placeholder="Ej: Hotel Nevado Caviahue" class="w-full border border-slate-300 rounded-lg p-2 font-medium">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">CUIT / DNI</label>
              <input type="text" name="cuit_dni" value="${customer ? customer.cuit_dni || '' : ''}" placeholder="30-12345678-9" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Tipo de Cliente *</label>
              <select name="customer_type" required class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                <option value="Alojamiento" ${customer && customer.customer_type === 'Alojamiento' ? 'selected' : ''}>Alojamiento / Cabaña / Hotel</option>
                <option value="Gastronomía" ${customer && customer.customer_type === 'Gastronomía' ? 'selected' : ''}>Gastronomía / Bar / Restaurante</option>
                <option value="Administrador" ${customer && customer.customer_type === 'Administrador' ? 'selected' : ''}>Administrador de Propiedades</option>
                <option value="Comercio" ${customer && customer.customer_type === 'Comercio' ? 'selected' : ''}>Comercio / Reventa</option>
                <option value="Particular" ${customer && customer.customer_type === 'Particular' ? 'selected' : ''}>Particular Domiciliario</option>
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Lista de Precios Asignada</label>
              <select name="price_list_id" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                ${priceLists.map(pl => `
                  <option value="${pl.id}" ${customer && customer.price_list_id === pl.id ? 'selected' : ''}>${pl.name}</option>
                `).join('')}
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Descuento Especial (%)</label>
              <input type="number" min="0" max="50" step="0.5" name="special_discount_pct" value="${customer ? customer.special_discount_pct || 0 : 0}" class="w-full border border-slate-300 rounded-lg p-2 text-right">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Teléfono</label>
              <input type="text" name="phone" value="${customer ? customer.phone || '' : ''}" placeholder="2948-495123" class="w-full border border-slate-300 rounded-lg p-2">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">WhatsApp</label>
              <input type="text" name="whatsapp" value="${customer ? customer.whatsapp || '' : ''}" placeholder="2948-495123" class="w-full border border-slate-300 rounded-lg p-2">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Email</label>
              <input type="email" name="email" value="${customer ? customer.email || '' : ''}" placeholder="contacto@cliente.com" class="w-full border border-slate-300 rounded-lg p-2">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Dirección en Caviahue / Copahue</label>
              <input type="text" name="address" value="${customer ? customer.address || '' : ''}" placeholder="Av. Los Pehuenes 150" class="w-full border border-slate-300 rounded-lg p-2">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Localidad</label>
              <input type="text" name="city" value="${customer ? customer.city || 'Caviahue' : 'Caviahue'}" class="w-full border border-slate-300 rounded-lg p-2">
            </div>
          </div>

          <!-- Parámetros de Cuenta Corriente -->
          <div class="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div class="flex items-center gap-2">
              <input type="checkbox" id="chkCtaCte" name="credit_account_enabled" ${customer && customer.credit_account_enabled ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded">
              <label for="chkCtaCte" class="font-bold text-slate-800">Habilitar Cuenta Corriente Comercial</label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-slate-600 mb-1">Límite de Crédito ($ ARS)</label>
                <input type="number" step="1000" name="credit_limit" value="${customer ? customer.credit_limit || 500000 : 500000}" class="w-full border border-slate-300 rounded-lg p-2">
              </div>
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Observaciones</label>
            <textarea name="notes" rows="2" placeholder="Horarios de entrega, recepcionistas..." class="w-full border border-slate-300 rounded-lg p-2">${customer ? customer.notes || '' : ''}</textarea>
          </div>

          <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window.app.navigate('clientes')" class="px-5 py-2 border rounded-lg">Cancelar</button>
            <button type="submit" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold">Guardar Cliente</button>
          </div>
        </form>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  renderCustomerDetail(container, customer) {
    if (!customer) {
      container.innerHTML = '<div class="p-8 text-center text-xs text-rose-500">Cliente no encontrado</div>';
      return;
    }

    const sales = db.getSales().filter(s => s.customer_id === customer.id && s.status === 'COMPLETADA');
    const totalComprado = sales.reduce((sum, s) => sum + s.total, 0);
    const avgTicket = sales.length > 0 ? totalComprado / sales.length : 0;

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-3">
            <button onclick="window.app.navigate('clientes')" class="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
              <i data-lucide="arrow-left" class="w-5 h-5"></i>
            </button>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">${customer.customer_type}</span>
                <span class="text-xs text-slate-500 font-mono">${customer.cuit_dni || ''}</span>
              </div>
              <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-0.5">${customer.name}</h1>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.app.navigate('cuentas_corrientes', { customerId: '${customer.id}' })" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5">
              <i data-lucide="credit-card" class="w-4 h-4"></i> Ver Estado de Cuenta
            </button>
            <button onclick="window.app.navigate('clientes', { editId: '${customer.id}' })" class="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5">
              <i data-lucide="edit-3" class="w-4 h-4"></i> Editar
            </button>
          </div>
        </div>

        ${window.app.centralReadOnly ? `
          <section class="bg-white p-5 rounded-xl border border-slate-200">
            <h2 class="font-bold">Cuenta Corriente en la tienda</h2>
            <p class="text-sm mb-3">${customer.credit_account_enabled ? 'Habilitada' : 'No disponible'}</p>
            <button type="button" data-customer-credit class="px-4 py-2 rounded-lg bg-[#0E3A6B] text-white text-sm font-semibold">
              ${customer.credit_account_enabled ? 'Deshabilitar Cuenta Corriente' : 'Habilitar Cuenta Corriente'}
            </button>
          </section>
        ` : ''}

        <!-- Métricas del Cliente -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Total Comprado</div>
            <div class="text-lg font-bold text-slate-800 mt-1">${Formatter.money(totalComprado)}</div>
            <div class="text-[11px] text-slate-500">${sales.length} compras realizadas</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Ticket Promedio</div>
            <div class="text-lg font-bold text-slate-800 mt-1">${Formatter.money(avgTicket)}</div>
            <div class="text-[11px] text-slate-500">Por pedido</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Saldo en Cuenta Corriente</div>
            <div class="text-lg font-bold text-amber-700 mt-1">${Formatter.money(customer.current_balance)}</div>
            <div class="text-[11px] text-slate-500">Límite: ${Formatter.money(customer.credit_limit)}</div>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div class="text-xs text-slate-500 font-medium">Última Compra</div>
            <div class="text-base font-bold text-slate-800 mt-1">${sales.length > 0 ? Formatter.date(sales[0].date) : '-'}</div>
            <div class="text-[11px] text-emerald-600 font-medium">Cliente activo</div>
          </div>
        </div>

        <!-- Historial de Compras de este Cliente -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Historial de Compras del Cliente</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th class="py-2.5 px-4">Comprobante</th>
                  <th class="py-2.5 px-4">Fecha</th>
                  <th class="py-2.5 px-4">Forma de Pago</th>
                  <th class="py-2.5 px-4 text-right">Total Factura</th>
                  <th class="py-2.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${sales.map(s => `
                  <tr>
                    <td class="py-2.5 px-4 font-mono font-bold">${s.sale_number}</td>
                    <td class="py-2.5 px-4">${Formatter.date(s.date)}</td>
                    <td class="py-2.5 px-4">${s.payment_method}</td>
                    <td class="py-2.5 px-4 text-right font-bold">${Formatter.money(s.total)}</td>
                    <td class="py-2.5 px-4 text-center">
                      <button onclick="window.ventasModule.showTicket('${s.id}')" class="text-blue-600 hover:text-blue-800 font-semibold">
                        Ver Comprobante
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.app.centralReadOnly) {
      const panel = document.createElement('section');
      panel.className = 'bg-white p-5 rounded-xl border border-slate-200 space-y-3';
      container.firstElementChild.children[0].after(panel);
      this.renderInternalWithdrawals(panel, customer);
    }
    const creditButton = container.querySelector('[data-customer-credit]');
    creditButton?.addEventListener('click', () => this.setStoreCredit(customer, creditButton));
    if (window.lucide) window.lucide.createIcons();
  },

  async renderInternalWithdrawals(panel, customer) {
    const token = getAdminSession()?.access_token || sessionStorage.getItem('stayclean_staff_access_token');
    const heading = document.createElement('h2');
    heading.className = 'font-bold text-slate-800';
    heading.textContent = 'Retiros internos al costo';
    panel.replaceChildren(heading);
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Cargando retiros…';
    panel.append(status);

    const request = async (args = {}) => {
      const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/stayclean_staff_internal_withdrawal', {
        method: 'POST',
        headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_customer_id: customer.id, ...args })
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.message || 'No se pudo actualizar el retiro');
      return result;
    };
    const button = (label, action) => {
      const control = document.createElement('button');
      control.type = 'button';
      control.dataset.customerWithdrawal = '';
      control.className = 'px-3 py-2 rounded-lg bg-[#0E3A6B] text-white text-sm font-semibold';
      control.textContent = label;
      control.addEventListener('click', async () => {
        control.disabled = true;
        try { await action(); } catch (error) { status.textContent = error.message; }
        finally { control.disabled = false; }
      });
      return control;
    };
    try {
      const data = await request();
      status.textContent = 'Total consumido al costo: ' + Formatter.money(data.total);
      panel.append(button(data.enabled ? 'Deshabilitar retiros internos' : 'Habilitar retiros internos', async () => {
        await request({ p_enabled: !data.enabled });
        await this.renderInternalWithdrawals(panel, customer);
      }));
      if (data.enabled) {
        const fields = document.createElement('div');
        fields.className = 'flex flex-wrap items-end gap-2';
        fields.innerHTML = '<label class="text-sm">Producto<select class="block border rounded p-2" required></select></label><label class="text-sm">Cantidad<input class="block border rounded p-2 w-24" type="number" min="1" max="10000" step="1" value="1" required></label><label class="text-sm">Alojamiento<input class="block border rounded p-2" type="text" maxlength="150" required></label>';
        const [product, quantity, destination] = fields.querySelectorAll('select,input');
        product.add(new Option('Seleccioná un producto', ''));
        for (const row of db.getProducts().filter(row => row.active && Number(row.caviahue_cost) > 0 && Number(row.sale_to_base_factor) > 0)) {
          product.add(new Option(row.sku + ' · ' + row.name + ' · ' + Formatter.money(row.caviahue_cost * row.sale_to_base_factor), row.id));
        }
        let pending;
        fields.append(button('Registrar retiro', async () => {
          if (![product, quantity, destination].every(input => input.reportValidity()) || !destination.value.trim()) {
            status.textContent = 'Completá el producto, la cantidad y el alojamiento.';
            return;
          }
          const args = { p_product_id: product.value, p_quantity: Number(quantity.value), p_destination: destination.value.trim() };
          const key = JSON.stringify(args);
          if (pending?.key !== key) pending = { key, id: crypto.randomUUID() };
          await request({ ...args, p_request_id: pending.id });
          await this.renderInternalWithdrawals(panel, customer);
        }));
        panel.append(fields);
      }
      const history = document.createElement('ul');
      history.className = 'divide-y text-sm';
      for (const row of data.history) {
        const item = document.createElement('li');
        item.className = 'py-2';
        item.textContent = [new Date(row.date).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
          row.destination, row.quantity + ' ' + (row.unit || 'un.' ) + ' × ' + row.name, Formatter.money(row.total)].join(' · ');
        history.append(item);
      }
      panel.append(history);
    } catch (error) {
      status.textContent = error.message;
    }
  },

  async setStoreCredit(customer, button) {
    const token = getAdminSession()?.access_token || sessionStorage.getItem('stayclean_staff_access_token');
    const enabled = !customer.credit_account_enabled;
    button.disabled = true;
    try {
      const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/stayclean_staff_set_customer_credit', {
        method: 'POST',
        headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({p_customer_id: customer.id, p_enabled: enabled})
      });
      const result = await response.json();
      if (!response.ok || result !== enabled) throw Error(result?.message || 'No se pudo actualizar Cuenta Corriente');
      db.centralSetTable('customers', db.getCustomers().map(row =>
        row.id === customer.id ? {...row, credit_account_enabled: enabled} : row));
      window.app.showNotification(enabled ? 'Cuenta Corriente habilitada' : 'Cuenta Corriente deshabilitada', 'success');
      if (button.isConnected) window.app.navigate('clientes', {viewId: customer.id});
    } catch (error) {
      window.app.showNotification(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  },

  attachListFilters() {
    const search = document.getElementById('searchCustInput');
    const typeSelect = document.getElementById('filterCustomerType');

    const filter = () => {
      const q = (search?.value || '').toLowerCase().trim();
      const tp = typeSelect?.value || 'TODOS';
      const rows = document.querySelectorAll('#customersTableBody tr');

      rows.forEach(r => {
        const text = r.textContent.toLowerCase();
        const matchesQ = text.includes(q);
        const matchesTp = tp === 'TODOS' || r.getAttribute('data-type') === tp;
        r.style.display = matchesQ && matchesTp ? '' : 'none';
      });
    };

    if (search) search.addEventListener('input', filter);
    if (typeSelect) typeSelect.addEventListener('change', filter);
  }
};

window.clientesModule = {
  saveCustomer(e, editId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    const data = {
      name: formData.get('name').trim(),
      cuit_dni: formData.get('cuit_dni').trim(),
      customer_type: formData.get('customer_type'),
      price_list_id: formData.get('price_list_id'),
      special_discount_pct: Number(formData.get('special_discount_pct')) || 0,
      phone: formData.get('phone').trim(),
      whatsapp: formData.get('whatsapp').trim(),
      email: formData.get('email').trim(),
      address: formData.get('address').trim(),
      city: formData.get('city').trim(),
      credit_account_enabled: form.querySelector('#chkCtaCte')?.checked || false,
      credit_limit: Number(formData.get('credit_limit')) || 0,
      notes: formData.get('notes').trim()
    };

    if (editId) data.id = editId;

    try {
      db.saveCustomer(data);
      window.app.showNotification(`Cliente "${data.name}" guardado exitosamente.`, 'success');
      window.app.navigate('clientes');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }
};
