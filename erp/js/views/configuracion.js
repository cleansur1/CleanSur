// Módulo de Configuración & Usuarios para Limpieza Caviahue / StayClean ERP
// Selector de roles, respaldo integral V2 para Supabase y verificador de integridad de datos.

import { db } from '../db.js?v=6.0';
import { exportFullBackupV2, verifyBackupV2 } from '../backup_verifier.js?v=6.0';

export const ConfiguracionView = {
  render(container) {
    const currentUser = db.getCurrentUser();
    const users = db.getTable('users') || [];

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-5xl mx-auto">
        <div class="flex items-center justify-between bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Configuración del Sistema ERP</h1>
            <p class="text-xs text-slate-500">Parámetros de Caviahue, usuarios, control de roles y copias de seguridad para migración a Supabase.</p>
          </div>
        </div>

        <!-- 1. Perfil y Switch de Usuario/Rol -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">1. Usuario Activo & Control de Roles</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${users.map(u => {
              const isCurrent = u.id === currentUser.id;
              let roleBadge = 'bg-slate-100 text-slate-800';
              if (u.role === 'ADMINISTRADOR') roleBadge = 'bg-rose-100 text-rose-800';
              if (u.role === 'VENDEDOR') roleBadge = 'bg-emerald-100 text-emerald-800';
              if (u.role === 'DEPÓSITO') roleBadge = 'bg-blue-100 text-blue-800';

              return `
                <div class="p-4 rounded-xl border ${isCurrent ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white'} space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-900 text-sm">${u.name}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded ${roleBadge}">${u.role}</span>
                  </div>
                  <p class="text-[11px] text-slate-500">
                    ${u.role === 'ADMINISTRADOR' ? 'Acceso completo a costos, compras, márgenes y configuración.' : ''}
                    ${u.role === 'VENDEDOR' ? 'Ventas de mostrador, pedidos, clientes y consulta de precios.' : ''}
                    ${u.role === 'DEPÓSITO' ? 'Control de stock físico, recepción de compras y preparación.' : ''}
                  </p>
                  <div>
                    ${isCurrent ? `
                      <span class="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        <i data-lucide="check" class="w-4 h-4"></i> Rol Activo
                      </span>
                    ` : `
                      <button onclick="window.configModule.switchUser('${u.id}')" class="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold">
                        Activar este Usuario
                      </button>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 2. Respaldo Integral V2 (Fase 1 Migración Supabase) -->
        <div class="bg-white p-5 rounded-xl border-2 border-indigo-200 shadow-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                  FASE 1 — MIGRACIÓN A SUPABASE
                </span>
                <span class="text-xs font-bold text-slate-600">Esquema V2.0 Verificable</span>
              </div>
              <h2 class="text-base font-bold text-slate-900 mt-1">Respaldo Integral 100% de la Base de Datos</h2>
            </div>
            <span class="text-xs text-indigo-700 font-semibold bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-200">
              Incluye ARCA, Caja, Stock, Compras, Ventas y Tienda
            </span>
          </div>

          <div class="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
            <div class="flex items-center gap-2 font-bold text-amber-800">
              <i data-lucide="alert-triangle" class="w-4 h-4 text-amber-600 shrink-0"></i>
              Advertencia de Seguridad y Protección de Datos
            </div>
            <p class="leading-relaxed">
              El respaldo integral contiene información fiscal sensible, números de CUIT, precios de compra mayorista, saldos de cuentas corrientes y datos de entrega de clientes de Caviahue.
              <strong>Guardá el archivo descargado en una carpeta privada y segura fuera del proyecto</strong>. No lo compartas públicamente ni lo subas a repositorios abiertos.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Tarjeta Descargar V2 -->
            <div class="p-4 bg-gradient-to-br from-indigo-50/80 to-blue-50/80 rounded-xl border border-indigo-200 space-y-3">
              <div>
                <span class="font-extrabold text-indigo-950 text-sm block">Exportar Respaldo Completo V2</span>
                <p class="text-xs text-slate-600 mt-1">Genera un snapshot exhaustivo con las 24 entidades, sumas de control (checksums) y metadatos relacionales listos para Supabase.</p>
              </div>
              <button onclick="window.configModule.downloadBackupV2()" class="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition">
                <i data-lucide="download-cloud" class="w-4 h-4"></i>
                Descargar Respaldo Integral V2 (.json)
              </button>
            </div>

            <!-- Tarjeta Verificar V2 -->
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div>
                <span class="font-extrabold text-slate-800 text-sm block">Verificar Integridad de Respaldo</span>
                <p class="text-xs text-slate-600 mt-1">Ejecuta una auditoría de conteos, sumas de control, integridad referencial y conciliación contable sin alterar datos.</p>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <input type="file" id="verifyBackupFileInput" accept=".json" class="hidden" onchange="window.configModule.handleVerifyFile(event)">
                <button onclick="document.getElementById('verifyBackupFileInput').click()" class="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition">
                  <i data-lucide="file-check-2" class="w-4 h-4"></i> Verificar Archivo JSON
                </button>
                <button onclick="window.configModule.verifyCurrentInMemory()" class="flex-1 py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition">
                  <i data-lucide="activity" class="w-4 h-4"></i> Verificar Memoria Actual
                </button>
              </div>
            </div>
          </div>

          <!-- Panel de Resultados de Verificación (Inyectado dinámicamente) -->
          <div id="verifyResultsSlot" class="hidden"></div>
        </div>

        <!-- 3. Respaldos Legacy y Restauración -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 class="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">3. Opciones Tradicionales & Restauración</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span class="font-bold text-slate-800 text-sm block">Restaurar Base de Datos desde JSON</span>
              <p class="text-xs text-slate-600">Carga un archivo JSON previamente exportado para recuperar la información en el navegador.</p>
              <input type="file" id="importJsonFileInput" accept=".json" class="hidden" onchange="window.configModule.handleFileImport(event)">
              <button onclick="document.getElementById('importJsonFileInput').click()" class="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
                <i data-lucide="upload" class="w-4 h-4"></i> Seleccionar Archivo a Restaurar
              </button>
            </div>

            <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span class="font-bold text-slate-800 text-sm block">Exportación Básica V1 (Legacy)</span>
              <p class="text-xs text-slate-600">Exportación histórica simple de 16 tablas sin metadatos de conciliación ni ARCA.</p>
              <button onclick="window.configModule.downloadBackupLegacy()" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition">
                <i data-lucide="download" class="w-4 h-4"></i> Descargar Respaldo V1
              </button>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-200">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span class="font-bold text-rose-700 text-xs block">Restablecer Sistema a CERO (Modo Limpio)</span>
                <p class="text-[11px] text-slate-500">Pone en 0 todos los valores, indicadores y stock. Elimina ventas, compras y clientes simulados, conservando el catálogo base.</p>
              </div>
              <button onclick="window.configModule.resetDemoData()" class="px-3.5 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition shrink-0">
                Reiniciar Todo a Cero
              </button>
            </div>
          </div>
        </div>

        <!-- 4. Parámetros Regionales -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3 text-xs text-slate-600">
          <h2 class="font-bold text-slate-700 uppercase tracking-wider border-b pb-2">4. Parámetros Regionales de Caviahue</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><span class="text-slate-400">Moneda Base:</span> <div class="font-bold text-slate-800">ARS ($ Pesos Argentinos)</div></div>
            <div><span class="text-slate-400">Formato Fecha:</span> <div class="font-bold text-slate-800">DD/MM/AAAA</div></div>
            <div><span class="text-slate-400">Zona Horaria:</span> <div class="font-bold text-slate-800">Argentina (UTC-3)</div></div>
            <div><span class="text-slate-400">Flete Caviahue Predeterminado:</span> <div class="font-bold text-blue-800">Expreso Neuquén-Zapala</div></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.configModule = {
  switchUser(userId) {
    const users = db.getTable('users') || [];
    const u = users.find(user => user.id === userId);
    if (!u) return;
    db.setCurrentUser(u);
    window.app.updateUserHeader();
    window.app.showNotification(`Usuario cambiado a ${u.name} (${u.role}).`, 'info');
    window.app.navigate('configuracion');
  },

  // Exportación Integral V2
  downloadBackupV2() {
    try {
      const backupObj = exportFullBackupV2(db);
      const jsonStr = JSON.stringify(backupObj, null, 2);
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}`;
      const filename = `stayclean_full_backup_v2_${datePart}_${timePart}.json`;

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      if (window.app && window.app.showNotification) {
        window.app.showNotification(`¡Respaldo V2 descargado (${filename})! Guardalo fuera de la carpeta pública del proyecto.`, 'success');
      } else {
        alert(`Respaldo V2 descargado como ${filename}. Guardalo fuera de la carpeta pública.`);
      }
    } catch (err) {
      console.error('Error generando respaldo V2:', err);
      alert('Error al generar el respaldo: ' + err.message);
    }
  },

  // Exportación Legacy V1
  downloadBackupLegacy() {
    const json = db.exportDatabaseJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_limpieza_caviahue_${new Date().toISOString().substring(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.app && window.app.showNotification) {
      window.app.showNotification('Copia de seguridad V1 descargada.', 'success');
    }
  },

  // Verificar la memoria actual del ERP
  verifyCurrentInMemory() {
    try {
      const currentBackup = exportFullBackupV2(db);
      const report = verifyBackupV2(currentBackup);
      this.renderVerificationReport(report, 'Base de Datos Actual en Memoria (localStorage)');
    } catch (err) {
      alert('Error al verificar los datos en memoria: ' + err.message);
    }
  },

  // Verificar un archivo JSON seleccionado
  handleVerifyFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const report = verifyBackupV2(event.target.result);
        this.renderVerificationReport(report, `Archivo: ${file.name}`);
      } catch (err) {
        alert('Error al procesar el archivo para verificación: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  },

  // Renderizar informe de verificación en el panel
  renderVerificationReport(report, sourceLabel) {
    const slot = document.getElementById('verifyResultsSlot');
    if (!slot) return;

    slot.classList.remove('hidden');

    let statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">✓ VÁLIDO PARA MIGRACIÓN</span>';
    if (!report.valid) {
      statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">✕ ERRORES CRÍTICOS ENCONTRADOS</span>';
    } else if (report.warnings.length > 0) {
      statusBadge = '<span class="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">⚠️ VÁLIDO CON ADVERTENCIAS</span>';
    }

    slot.innerHTML = `
      <div class="mt-4 p-5 rounded-2xl bg-white border border-slate-300 shadow-md space-y-4 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-extrabold text-slate-800">Resultado de Verificación de Integridad</h3>
              ${statusBadge}
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Origen: <strong>${sourceLabel}</strong> | Esquema: <code class="font-mono text-indigo-700">${report.schema_version}</code> | Fecha: ${report.exported_at}</p>
          </div>
          <button onclick="document.getElementById('verifyResultsSlot').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Indicadores Resumen -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span class="text-slate-400 block text-[10px] font-bold uppercase">Entidades Evaluadas</span>
            <strong class="text-base text-slate-800 font-mono">${report.summary.total_entities}</strong>
          </div>
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span class="text-slate-400 block text-[10px] font-bold uppercase">Registros Totales</span>
            <strong class="text-base text-slate-800 font-mono">${report.summary.total_records}</strong>
          </div>
          <div class="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <span class="text-emerald-700 block text-[10px] font-bold uppercase">Pruebas Aprobadas</span>
            <strong class="text-base text-emerald-800 font-mono">${report.summary.checks_passed}</strong>
          </div>
          <div class="p-3 ${report.warnings.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'} rounded-xl border">
            <span class="${report.warnings.length > 0 ? 'text-amber-800' : 'text-slate-400'} block text-[10px] font-bold uppercase">Advertencias</span>
            <strong class="text-base ${report.warnings.length > 0 ? 'text-amber-900' : 'text-slate-800'} font-mono">${report.summary.checks_warned}</strong>
          </div>
        </div>

        <!-- Detalle de Evaluaciones -->
        <div class="space-y-2">
          <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Matriz de Chequeos</h4>
          <div class="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            ${report.checks.map(c => {
              let icon = '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>';
              let badge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">PASS</span>';
              if (c.status === 'WARN') {
                icon = '<i data-lucide="alert-circle" class="w-4 h-4 text-amber-600"></i>';
                badge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">WARN</span>';
              } else if (c.status === 'FAIL') {
                icon = '<i data-lucide="x-circle" class="w-4 h-4 text-rose-600"></i>';
                badge = '<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">FAIL</span>';
              }

              return `
                <div class="p-3 flex items-start justify-between gap-3 text-xs bg-white">
                  <div class="flex items-start gap-2.5">
                    <span class="mt-0.5 shrink-0">${icon}</span>
                    <div>
                      <div class="font-bold text-slate-800">${c.name}</div>
                      <div class="text-[11px] text-slate-600 mt-0.5">${c.message}</div>
                    </div>
                  </div>
                  <div class="shrink-0">${badge}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Desglose de Advertencias si existen -->
        ${report.warnings.length > 0 ? `
          <div class="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs space-y-2">
            <div class="font-bold text-amber-900 flex items-center gap-1.5">
              <i data-lucide="info" class="w-4 h-4 text-amber-700"></i>
              Detalle de Advertencias (Registros a revisar antes de migrar):
            </div>
            <ul class="list-disc list-inside space-y-1 text-amber-800 text-[11px]">
              ${report.warnings.map(w => `<li>${w}</li>`).join('')}
            </ul>
            <p class="text-[10px] text-amber-700 italic pt-1 border-t border-amber-200">
              * Ningún dato ha sido alterado automáticamente. Las advertencias contables y de stock se reportan con fines de auditoría previa.
            </p>
          </div>
        ` : ''}

        ${report.errors.length > 0 ? `
          <div class="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-xs space-y-2">
            <div class="font-bold text-rose-900 flex items-center gap-1.5">
              <i data-lucide="alert-octagon" class="w-4 h-4 text-rose-700"></i>
              Errores Críticos que Bloquean la Migración:
            </div>
            <ul class="list-disc list-inside space-y-1 text-rose-800 text-[11px]">
              ${report.errors.map(e => `<li>${e}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        db.importDatabaseJSON(event.target.result);
        window.app.showNotification('Base de datos restaurada correctamente.', 'success');
        window.location.reload();
      } catch (err) {
        alert('Error al importar el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  resetDemoData() {
    if (confirm('¿Seguro de reiniciar el sistema a cero? Se pondrá el stock de todos los productos en 0 y se eliminarán ventas, compras y clientes simulados. Se conservarán las listas de precios reales de proveedores.')) {
      db.resetToCleanData();
      window.app.showNotification('Sistema reiniciado a cero con catálogo limpio.', 'info');
      window.location.reload();
    }
  }
};
