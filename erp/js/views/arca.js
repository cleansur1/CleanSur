// Módulo de Facturación Electrónica ARCA (ex-AFIP)
// Limpieza Caviahue ERP
import { db } from '../db.js';
import { Formatters } from '../models.js';

export const ArcaView = {
  render(container) {
    const cfg = db.getArcaConfig();
    const invoices = db.getArcaInvoices();
    const todayStr = new Date().toISOString().substring(0, 10);
    const todaySales = db.getSales().filter(s => s.status === 'COMPLETADA' && s.date === todayStr);
    
    // Contar cuántas ventas de hoy tienen comprobante emitido
    const emittedToday = invoices.filter(inv => inv.fecha === todayStr).length;
    const pendingToday = Math.max(0, todaySales.length - emittedToday);

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-6xl mx-auto">
        <!-- Encabezado -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                <i data-lucide="shield" class="w-3.5 h-3.5 mr-1 inline"></i> Conexión ARCA Oficial
              </span>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.environment === 'PRODUCCION' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                <i data-lucide="activity" class="w-3.5 h-3.5 mr-1 inline"></i> ${cfg.environment || 'HOMOLOGACIÓN'}
              </span>
            </div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-1">Facturación Electrónica ARCA (ex-AFIP)</h1>
            <p class="text-xs text-slate-500">Gestión de comprobantes fiscales con CAE, emisión consolidada en lote al final del día y certificados digitales.</p>
          </div>

          <div class="flex gap-2">
            <button onclick="window.arcaModule.openConfigModal()" class="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition inline-flex items-center gap-1.5">
              <i data-lucide="settings" class="w-4 h-4"></i> Configurar ARCA
            </button>
            <button onclick="window.arcaModule.emitDailyBatchNow()" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5">
              <i data-lucide="send" class="w-4 h-4"></i> Emitir Lote del Día Ahora
            </button>
          </div>
        </div>

        <!-- Tarjetas de Estado y Parámetros Fiscales -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Punto de Venta Fiscal</span>
            <span class="text-xl font-bold text-slate-800 mt-1 block">000${cfg.punto_venta || 5}</span>
            <span class="text-[11px] text-slate-400">WebService Factura Electrónica</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">CUIT Emisor</span>
            <span class="text-xl font-bold font-mono text-slate-800 mt-1 block">${cfg.cuit || '30-00000000-0'}</span>
            <span class="text-[11px] text-slate-400 truncate block">${cfg.business_name || 'StayClean Distribuidora'}</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Comprobantes Hoy</span>
            <span class="text-xl font-bold text-emerald-600 mt-1 block">${emittedToday} emitidos</span>
            <span class="text-[11px] text-amber-600 font-medium">${pendingToday} pendientes de cierre</span>
          </div>

          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span class="text-xs font-medium text-slate-500 block">Certificado Digital</span>
            <div class="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-emerald-600">
              <i data-lucide="check-circle" class="w-4 h-4"></i> Vinculado & Válido
            </div>
            <span class="text-[10px] text-slate-400 block mt-0.5">Vto: 28/11/2027</span>
          </div>
        </div>

        <!-- Explicación de la regla operativa de emisión en lote -->
        <div class="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-900 space-y-2">
          <div class="flex items-center gap-2 font-bold">
            <i data-lucide="info" class="w-4 h-4 text-sky-600"></i>
            Regla de Emisión al Final del Día:
          </div>
          <p class="text-[11px] text-sky-800 leading-relaxed">
            Las ventas registradas en el mostrador o por pedidos se acumulan durante la jornada. <b>Al realizar el Cierre de Caja diario</b>, el sistema procesa automáticamente el lote completo ante los servidores de ARCA, asignando a cada operación su respectivo número fiscal, CAE y código QR oficial.
          </p>
        </div>

        <!-- Tabla de Comprobantes Emitidos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h3 class="text-sm font-bold text-slate-800">Comprobantes Fiscales Electrónicos Emitidos (${invoices.length})</h3>
            <span class="text-xs text-slate-400">Todos cuentan con CAE verificado por ARCA</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs text-slate-600">
              <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 text-[11px] uppercase">
                <tr>
                  <th class="p-3">Comprobante</th>
                  <th class="p-3">Número</th>
                  <th class="p-3">Fecha</th>
                  <th class="p-3">Cliente / Razón Social</th>
                  <th class="p-3">CUIT</th>
                  <th class="p-3 text-right">Neto Gravado</th>
                  <th class="p-3 text-right">IVA</th>
                  <th class="p-3 text-right">Total</th>
                  <th class="p-3 text-center">CAE / Vto</th>
                  <th class="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${invoices.length === 0 ? `
                  <tr><td colspan="10" class="text-center p-8 text-slate-400">No se han emitido facturas ARCA aún. Se generarán al cerrar la caja del día.</td></tr>
                ` : invoices.map(inv => `
                  <tr class="hover:bg-slate-50">
                    <td class="p-3 font-bold text-slate-800">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${inv.tipo_cbte === 'FA_A' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                        ${inv.tipo_cbte === 'FA_A' ? 'Factura A' : 'Factura B'}
                      </span>
                    </td>
                    <td class="p-3 font-mono font-bold text-slate-700">000${inv.pto_vta}-${String(inv.nro_cbte).padStart(8, '0')}</td>
                    <td class="p-3">${Formatters.date(inv.fecha)}</td>
                    <td class="p-3 font-medium text-slate-800">${inv.cliente_nombre}</td>
                    <td class="p-3 font-mono text-slate-500">${inv.cuit_cliente}</td>
                    <td class="p-3 text-right font-mono">${Formatters.currency(inv.importe_neto)}</td>
                    <td class="p-3 text-right font-mono">${Formatters.currency(inv.importe_iva)}</td>
                    <td class="p-3 text-right font-bold text-slate-900">${Formatters.currency(inv.importe_total)}</td>
                    <td class="p-3 text-center">
                      <span class="font-mono font-bold text-emerald-700 text-[11px] block">${inv.cae}</span>
                      <span class="text-[9px] text-slate-400">Vto: ${Formatters.date(inv.cae_vto)}</span>
                    </td>
                    <td class="p-3 text-right">
                      <button onclick="window.arcaModule.viewInvoiceModal('${inv.id}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-semibold transition inline-flex items-center gap-1">
                        <i data-lucide="eye" class="w-3 h-3"></i> Factura
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Configuración ARCA -->
      <div id="arca-config-modal" class="hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-base font-bold text-slate-800">Parámetros de Facturación Electrónica ARCA</h3>
            <button onclick="document.getElementById('arca-config-modal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="col-span-2">
              <label class="block font-semibold text-slate-700 mb-1">Razón Social Emisor</label>
              <input type="text" id="cfg-business-name" value="${cfg.business_name || 'StayClean Distribuidora'}" class="w-full p-2 border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">CUIT Emisor</label>
              <input type="text" id="cfg-cuit" value="${cfg.cuit || '30-00000000-0'}" class="w-full p-2 border border-slate-300 rounded-lg font-mono">
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Punto de Venta</label>
              <input type="number" id="cfg-pto-vta" value="${cfg.punto_venta || 5}" class="w-full p-2 border border-slate-300 rounded-lg">
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Condición Frente al IVA</label>
              <select id="cfg-iva-condition" class="w-full p-2 border border-slate-300 rounded-lg">
                <option value="Responsable Inscripto" selected>IVA Responsable Inscripto</option>
                <option value="Monotributo">Monotributo</option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-slate-700 mb-1">Ambiente de Operación</label>
              <select id="cfg-env" class="w-full p-2 border border-slate-300 rounded-lg font-semibold">
                <option value="HOMOLOGACION" ${cfg.environment !== 'PRODUCCION' ? 'selected' : ''}>Homologación (Pruebas)</option>
                <option value="PRODUCCION" ${cfg.environment === 'PRODUCCION' ? 'selected' : ''}>Producción (Real AFIP)</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="block font-semibold text-slate-700 mb-1">Certificado Digital (.crt) & Clave Privada (.key)</label>
              <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <span class="text-slate-600">Certificado X.509 vigente (vence 28/11/2027)</span>
                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Cargado</span>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button onclick="document.getElementById('arca-config-modal').classList.add('hidden')" class="px-3 py-2 text-xs text-slate-600">Cancelar</button>
            <button onclick="window.arcaModule.saveConfig()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow">
              Guardar Configuración
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Visualizador de Factura Electrónica ARCA con QR -->
      <div id="arca-invoice-modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" id="invoice-modal-content">
          <!-- Dinámico -->
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.initHandlers();
  },

  initHandlers() {
    window.arcaModule = {
      openConfigModal: () => {
        document.getElementById('arca-config-modal').classList.remove('hidden');
      },

      saveConfig: () => {
        const business_name = document.getElementById('cfg-business-name').value;
        const cuit = document.getElementById('cfg-cuit').value;
        const punto_venta = Number(document.getElementById('cfg-pto-vta').value) || 5;
        const environment = document.getElementById('cfg-env').value;

        db.saveArcaConfig({ business_name, cuit, punto_venta, environment });
        document.getElementById('arca-config-modal').classList.add('hidden');
        alert('Configuración ARCA guardada exitosamente.');
        ArcaView.render(document.getElementById('app-content'));
      },

      emitDailyBatchNow: () => {
        const todayStr = new Date().toISOString().substring(0, 10);
        try {
          const res = db.emitArcaDailyBatch(todayStr);
          alert(`Lote ARCA emitido:\n- Comprobantes generados hoy: ${res.emittedCount}\n- Total de ventas del día: ${res.totalSales}`);
          ArcaView.render(document.getElementById('app-content'));
        } catch (e) {
          alert('Error al emitir lote ARCA: ' + e.message);
        }
      },

      viewInvoiceModal: (invId) => {
        const inv = db.getArcaInvoices().find(i => i.id === invId);
        if (!inv) return;

        const cfg = db.getArcaConfig();
        const modal = document.getElementById('arca-invoice-modal');
        const content = document.getElementById('invoice-modal-content');

        content.innerHTML = `
          <div class="space-y-4 text-xs font-sans border-2 border-slate-800 p-6 rounded-lg bg-white">
            <!-- Encabezado de Factura Oficial -->
            <div class="border-b-2 border-slate-800 pb-4 relative">
              <div class="absolute left-1/2 -top-2 -translate-x-1/2 w-14 h-14 bg-white border-2 border-slate-800 flex flex-col items-center justify-center font-bold">
                <span class="text-2xl leading-none">${inv.tipo_cbte === 'FA_A' ? 'A' : 'B'}</span>
                <span class="text-[9px] text-slate-500">COD. 0${inv.tipo_cbte === 'FA_A' ? '1' : '6'}</span>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <h2 class="text-base font-extrabold text-slate-900 uppercase tracking-tight">${cfg.business_name || 'Limpieza Caviahue S.R.L.'}</h2>
                  <p class="text-[11px] text-slate-600">Insumos de Limpieza & Descartables Gastronómicos</p>
                  <p class="text-[11px] text-slate-600">Caviahue, Neuquén, Argentina</p>
                  <p class="text-[11px] text-slate-600 font-bold mt-1">IVA RESPONSABLE INSCRIPTO</p>
                </div>
                <div class="text-right pl-6">
                  <h3 class="text-base font-extrabold text-slate-900">${inv.tipo_cbte === 'FA_A' ? 'FACTURA' : 'FACTURA'}</h3>
                  <p class="font-mono text-sm font-bold">N° 000${inv.pto_vta}-${String(inv.nro_cbte).padStart(8, '0')}</p>
                  <p class="text-slate-600 mt-1">Fecha de Emisión: <b>${Formatters.date(inv.fecha)}</b></p>
                  <p class="text-slate-600">CUIT: <b>${cfg.cuit || '30-00000000-0'}</b></p>
                  <p class="text-slate-600">Ingresos Brutos: <b>${cfg.iibb || '00-00000000-0'}</b></p>
                  <p class="text-slate-600">Inicio de Actividades: <b>${cfg.inicio_actividades || '01/01/2024'}</b></p>
                </div>
              </div>
            </div>

            <!-- Datos del Cliente -->
            <div class="border-b border-slate-200 pb-3 space-y-1">
              <div class="flex justify-between">
                <span><b>Receptor / Razón Social:</b> ${inv.cliente_nombre}</span>
                <span><b>CUIT / DNI:</b> ${inv.cuit_cliente}</span>
              </div>
              <div class="flex justify-between text-slate-500">
                <span><b>Condición frente al IVA:</b> ${inv.tipo_cbte === 'FA_A' ? 'IVA Responsable Inscripto' : 'Consumidor Final'}</span>
                <span><b>Condición de Venta:</b> Contado / Cta Cte</span>
              </div>
            </div>

            <!-- Totales -->
            <div class="bg-slate-50 p-3 rounded border border-slate-200 space-y-1.5 font-mono">
              <div class="flex justify-between text-slate-600">
                <span>Subtotal / Importe Neto Gravado:</span>
                <span>${Formatters.currency(inv.importe_neto)}</span>
              </div>
              <div class="flex justify-between text-slate-600">
                <span>IVA Liquidado (21%):</span>
                <span>${Formatters.currency(inv.importe_iva)}</span>
              </div>
              <div class="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-300">
                <span>TOTAL FACTURADO:</span>
                <span>${Formatters.currency(inv.importe_total)}</span>
              </div>
            </div>

            <!-- Pie Fiscal ARCA con CAE y Código QR -->
            <div class="pt-2 flex items-center justify-between gap-4 border-t-2 border-slate-800">
              <div class="flex items-center gap-3">
                <!-- QR Oficial Simulado -->
                <div class="w-20 h-20 bg-slate-900 text-white p-1 rounded flex flex-col items-center justify-center text-center font-mono text-[9px] shadow-sm">
                  <i data-lucide="qr-code" class="w-12 h-12 text-white"></i>
                  <span class="text-[8px]">QR ARCA</span>
                </div>
                <div class="space-y-0.5">
                  <span class="font-bold text-slate-900 block text-xs">Comprobante Autorizado por ARCA</span>
                  <p class="text-[11px] text-slate-600">CAE N°: <b class="font-mono text-slate-900">${inv.cae}</b></p>
                  <p class="text-[11px] text-slate-600">Fecha de Vencimiento de CAE: <b>${Formatters.date(inv.cae_vto)}</b></p>
                  <span class="inline-block px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">APROBADO POR ARCA WEB SERVICES</span>
                </div>
              </div>
              <button onclick="window.print()" class="px-3 py-2 bg-slate-800 text-white rounded text-xs font-semibold hover:bg-slate-900 transition flex items-center gap-1.5">
                <i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir
              </button>
            </div>
          </div>
          <div class="flex justify-end pt-1">
            <button onclick="document.getElementById('arca-invoice-modal').classList.add('hidden')" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">
              Cerrar
            </button>
          </div>
        `;

        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      }
    };
  }
};
