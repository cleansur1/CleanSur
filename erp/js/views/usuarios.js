// Módulo de Gestión de Perfiles, Usuarios & Control de Accesos para Limpieza Caviahue
import { db } from '../db.js';
import { DEFAULT_PERMISSIONS } from '../seed_data.js';

export const UsuariosView = {
  render(container) {
    const users = db.getUsers();
    const currentUser = db.getCurrentUser();
    const central = window.app.centralReadOnly;

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-5xl mx-auto">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                <i data-lucide="shield-check" class="w-3.5 h-3.5 mr-1 inline"></i> Seguridad & Accesos
              </span>
            </div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-1">Gestión de Perfiles y Permisos</h1>
            <p class="text-xs text-slate-500">${central ? 'Elegí cómo se muestra tu perfil en esta sesión del ERP.' : 'Configurá quién tiene acceso a ventas, compras, costos sensibles, caja o tienda online.'}</p>
          </div>
          ${central ? '' : `<button onclick="window.usuariosModule.openUserModal()" class="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
            <i data-lucide="user-plus" class="w-4 h-4"></i> + Nuevo Perfil / Usuario
          </button>`}
        </div>

        <!-- Tarjetas de Usuarios Registrados -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${users.map(u => {
            const isCurrent = u.id === currentUser.id;
            let roleColor = 'bg-slate-100 text-slate-800';
            if (u.role === 'ADMINISTRADOR') roleColor = 'bg-rose-100 text-rose-800 border-rose-200';
            if (u.role === 'VENDEDOR') roleColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
            if (u.role === 'DEPÓSITO') roleColor = 'bg-blue-100 text-blue-800 border-blue-200';

            const perms = u.permissions || DEFAULT_PERMISSIONS[u.role] || {};
            const allowedCount = Object.values(perms).filter(v => v === true).length;
            const totalCount = Object.keys(perms).length || 20;

            return `
              <div class="bg-white p-5 rounded-xl border ${isCurrent ? 'border-indigo-600 shadow-md ring-2 ring-indigo-600/20' : 'border-slate-200 shadow-sm'} space-y-4 flex flex-col justify-between">
                <div>
                  <div class="flex items-start justify-between">
                    <div>
                      <div class="w-10 h-10 rounded-xl ${isCurrent ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-white'} flex items-center justify-center font-bold text-sm shadow-sm">
                        ${u.name.substring(0, 2).toUpperCase()}
                      </div>
                      <h3 class="text-base font-bold text-slate-800 mt-2">${u.name}</h3>
                      <p class="text-xs text-slate-400 font-mono">@${u.username || u.name.toLowerCase()}</p>
                    </div>
                    <span class="text-[10px] font-bold px-2.5 py-1 rounded-full border ${roleColor}">
                      ${u.role}
                    </span>
                  </div>

                  <div class="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                    <div class="flex justify-between text-slate-600">
                      <span>Módulos habilitados:</span>
                      <span class="font-bold text-indigo-700">${allowedCount} de ${totalCount}</span>
                    </div>
                    <div class="flex justify-between text-slate-600">
                      <span>Acceso a Costos/Márgenes:</span>
                      <span class="font-bold ${perms.costos_margenes ? 'text-emerald-600' : 'text-slate-400'}">
                        ${perms.costos_margenes ? 'Sí (Habilitado)' : 'No (Restringido)'}
                      </span>
                    </div>
                    <div class="flex justify-between text-slate-600">
                      <span>Email / Contacto:</span>
                      <span class="truncate max-w-[130px] text-slate-500">${u.email || '-'}</span>
                    </div>
                  </div>
                </div>

                <div class="pt-3 border-t border-slate-100 flex items-center gap-2">
                  ${!isCurrent && central && u.id !== window.app.centralDisplayProfileId ? '<span class="text-xs text-slate-500">Perfil de otra función</span>' : !isCurrent ? `
                    <button type="button" ${central ? 'data-central-display-profile' : ''} onclick="window.usuariosModule.switchActive('${u.id}')" class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold">
                      ${central ? 'Usar mi perfil' : 'Activar Perfil'}
                    </button>
                  ` : `
                    <span class="flex-1 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold text-center border border-indigo-200">
                      ✓ Perfil en Uso
                    </span>
                  `}
                  ${central ? '' : `<button onclick="window.usuariosModule.openUserModal('${u.id}')" title="Editar Permisos" class="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200">
                    <i data-lucide="edit-3" class="w-4 h-4"></i>
                  </button>`}
                  ${!central && u.id !== 'usr-admin' ? `
                    <button onclick="window.usuariosModule.deleteUser('${u.id}')" title="Eliminar Perfil" class="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Tabla Informativa de Permisos por Rol -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h2 class="text-sm font-bold text-slate-800">Guía de Restricción de Roles en Limpieza Caviahue</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="font-bold text-rose-800 block mb-1">ADMINISTRADOR</span>
              Acceso completo sin restricciones a compras, costos reales de flete Caviahue, márgenes, caja, gastos, auditoría y modificación de usuarios.
            </div>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="font-bold text-emerald-800 block mb-1">VENDEDOR / CAJA</span>
              Habilitado para registrar ventas POS, pedidos, caja diaria, clientes y tienda nube. <strong>Costos de compra, márgenes de ganancia y gastos quedan ocultos</strong>.
            </div>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span class="font-bold text-blue-800 block mb-1">DEPÓSITO</span>
              Control físico de inventario, ajustes manuales, preparación de pedidos y recepción de mercadería de proveedores. No ve precios de venta ni finanzas.
            </div>
          </div>
        </div>
      </div>

      <!-- Modal de Creación / Edición de Usuario y Permisos -->
      <div id="userModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 class="text-base font-bold text-slate-800" id="userModalTitle">Crear o Editar Perfil</h3>
            <button onclick="document.getElementById('userModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="window.usuariosModule.submitUserForm(event)" class="space-y-4 text-xs">
            <input type="hidden" id="modalUserId">

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Nombre Completo *</label>
                <input type="text" id="modalUserName" required placeholder="Ej: Juan Vendedor" class="w-full border border-slate-300 rounded-lg p-2 font-medium">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Nombre de Usuario (Login) *</label>
                <input type="text" id="modalUserUsername" required placeholder="juan" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Rol Predeterminado *</label>
                <select id="modalUserRole" onchange="window.usuariosModule.onRoleChange(this.value)" class="w-full border border-slate-300 rounded-lg p-2 bg-white">
                  <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                  <option value="VENDEDOR">VENDEDOR</option>
                  <option value="DEPÓSITO">DEPÓSITO</option>
                </select>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">PIN / Clave de Acceso</label>
                <input type="password" id="modalUserPin" placeholder="1234" class="w-full border border-slate-300 rounded-lg p-2 font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Email</label>
                <input type="email" id="modalUserEmail" placeholder="correo@caviahue.com" class="w-full border border-slate-300 rounded-lg p-2">
              </div>
            </div>

            <!-- Matriz de Permisos Específicos -->
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div class="flex items-center justify-between border-b pb-2">
                <span class="font-bold text-slate-800 text-xs">Permisos Modulares y Restricción de Pantallas</span>
                <button type="button" onclick="window.usuariosModule.toggleAllPerms(true)" class="text-indigo-600 hover:text-indigo-800 font-semibold text-[11px]">
                  Marcar Todos
                </button>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]" id="permissionsCheckboxesContainer">
                <!-- Se llena con checkboxes dinámicos -->
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onclick="document.getElementById('userModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg">Cancelar</button>
              <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm">Guardar Perfil</button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.usuariosModule = {
  PERMISSIONS_LIST: [
    { key: 'dashboard', label: 'Dashboard & Indicadores' },
    { key: 'ventas', label: 'Ventas (POS Mostrador)' },
    { key: 'pedidos', label: 'Pedidos de Clientes' },
    { key: 'caja', label: 'Caja Diaria & Cierres' },
    { key: 'compras', label: 'Compras & Fletes Caviahue' },
    { key: 'ocr_facturas', label: 'Carga Facturas con Foto' },
    { key: 'gastos', label: 'Gastos Operativos' },
    { key: 'productos', label: 'Productos & Catálogo' },
    { key: 'costos_margenes', label: 'Ver Costos y Márgenes ($ y %)' },
    { key: 'stock', label: 'Inventario & Ajustes de Stock' },
    { key: 'reposicion', label: 'Reposición Sugerida' },
    { key: 'clientes', label: 'Clientes & Fichas' },
    { key: 'cuentas_corrientes', label: 'Cuentas Corrientes & Cobros' },
    { key: 'precios', label: 'Precios & Rentabilidad' },
    { key: 'proveedores', label: 'Directorio de Proveedores' },
    { key: 'comparador', label: 'Comparador de Costos' },
    { key: 'ordenes_compra', label: 'Órdenes de Compra' },
    { key: 'reportes', label: 'Reportes Financieros' },
    { key: 'estacionalidad', label: 'Estacionalidad de Caviahue' },
    { key: 'tienda', label: 'Tienda Online Clientes' },
    { key: 'arca', label: 'Facturación ARCA (ex-AFIP)' },
    { key: 'usuarios', label: 'Gestión de Perfiles' },
    { key: 'auditoria', label: 'Registro de Auditoría' }
  ],

  openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const container = document.getElementById('permissionsCheckboxesContainer');
    if (!modal) return;

    const user = userId ? db.getUser(userId) : null;
    document.getElementById('modalUserId').value = user ? user.id : '';
    document.getElementById('modalUserName').value = user ? user.name : '';
    document.getElementById('modalUserUsername').value = user ? user.username : '';
    document.getElementById('modalUserRole').value = user ? user.role : 'VENDEDOR';
    document.getElementById('modalUserPin').value = user ? user.pin || '' : '';
    document.getElementById('modalUserEmail').value = user ? user.email || '' : '';

    title.textContent = user ? `Editar Perfil: ${user.name}` : 'Crear Nuevo Perfil / Usuario';

    const activePerms = user ? (user.permissions || DEFAULT_PERMISSIONS[user.role] || {}) : DEFAULT_PERMISSIONS.VENDEDOR;

    container.innerHTML = this.PERMISSIONS_LIST.map(p => `
      <label class="flex items-center gap-2 p-1.5 bg-white rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
        <input type="checkbox" id="perm_${p.key}" ${activePerms[p.key] ? 'checked' : ''} class="w-3.5 h-3.5 text-indigo-600 rounded">
        <span class="truncate">${p.label}</span>
      </label>
    `).join('');

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  onRoleChange(role) {
    const defaultPerms = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.VENDEDOR;
    this.PERMISSIONS_LIST.forEach(p => {
      const chk = document.getElementById(`perm_${p.key}`);
      if (chk) chk.checked = !!defaultPerms[p.key];
    });
  },

  toggleAllPerms(val) {
    this.PERMISSIONS_LIST.forEach(p => {
      const chk = document.getElementById(`perm_${p.key}`);
      if (chk) chk.checked = val;
    });
  },

  submitUserForm(e) {
    e.preventDefault();
    const id = document.getElementById('modalUserId')?.value;
    const name = document.getElementById('modalUserName')?.value.trim();
    const username = document.getElementById('modalUserUsername')?.value.trim();
    const role = document.getElementById('modalUserRole')?.value;
    const pin = document.getElementById('modalUserPin')?.value.trim();
    const email = document.getElementById('modalUserEmail')?.value.trim();

    if (!name || !username) {
      alert('Ingresá nombre y usuario.');
      return;
    }

    const permissions = {};
    this.PERMISSIONS_LIST.forEach(p => {
      const chk = document.getElementById(`perm_${p.key}`);
      permissions[p.key] = chk ? chk.checked : false;
    });

    try {
      db.saveUser({
        id: id || undefined,
        name,
        username,
        role,
        pin,
        email,
        permissions
      });

      document.getElementById('userModal').classList.add('hidden');
      window.app.updateUserHeader();
      window.app.applyRolePermissions();
      window.app.showNotification(`Perfil de ${name} guardado con éxito.`, 'success');
      window.app.navigate('usuarios');
    } catch (err) {
      alert(err.message);
    }
  },

  deleteUser(userId) {
    const u = db.getUser(userId);
    if (!u) return;
    if (confirm(`¿Estás seguro de eliminar el usuario ${u.name}?`)) {
      try {
        db.deleteUser(userId);
        window.app.showNotification('Usuario eliminado.', 'info');
        window.app.navigate('usuarios');
      } catch (err) {
        alert(err.message);
      }
    }
  },

  switchActive(userId) {
    const u = db.getUser(userId);
    if (!u) return;
    if (window.app.centralReadOnly) {
      if (!window.app.activateCentralDisplayProfile(userId)) return;
    } else {
      db.setCurrentUser(u);
    }
    window.app.updateUserHeader();
    window.app.applyRolePermissions();
    window.app.showNotification(`Perfil activo cambiado a ${u.name} (${u.role}).`, 'success');
    window.app.navigate('usuarios');
  }
};
