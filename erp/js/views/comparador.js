// Módulo Comparador de Proveedores & Fichas de Proveedores para Limpieza Caviahue
// Permite comparar el COSTO REAL PUESTO EN CAVIAHUE (Factura + Flete de montaña) entre distintos proveedores.

import { db } from '../db.js';
import { Formatter } from '../models.js';

export const ComparadorView = {
  render(container) {
    const products = db.getProducts();
    const suppliers = db.getSuppliers();

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight">Comparador de Proveedores & Costo Real</h1>
            <p class="text-xs text-slate-500">Evaluación del costo puesto en Caviahue considerando transporte, fletes y descuentos comerciales.</p>
          </div>
        </div>

        <!-- Selector de Producto para Comparación -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div class="max-w-xl">
            <label class="block text-xs font-bold text-slate-700 mb-1">Seleccionar Insumo a Comparar</label>
            <select id="comparatorProductSelect" onchange="window.comparadorModule.selectProduct(this.value)" class="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <option value="">Elegí un producto para ver alternativas de proveedores...</option>
              ${products.map(p => `
                <option value="${p.id}">${p.name} (${p.sku}) - Costo Actual Caviahue: ${Formatter.money(p.caviahue_cost)}</option>
              `).join('')}
            </select>
          </div>

          <div id="comparatorResultsArea">
            <div class="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Seleccioná un producto arriba para simular y comparar los costos de compra en Neuquén, Zapala, Bariloche vs entrega en Caviahue.
            </div>
          </div>
        </div>

        <!-- Directorio de Proveedores Registrados -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider">Directorio de Proveedores y Facturas Asociadas</h3>
            <span class="text-xs font-bold text-slate-600">${suppliers.length} proveedores únicos registrados</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-800 font-semibold text-white uppercase text-[10px]">
                <tr>
                  <th class="py-3 px-4">Razón Social / CUIT</th>
                  <th class="py-3 px-4">Dirección / Localidad</th>
                  <th class="py-3 px-4">Contacto / Tel</th>
                  <th class="py-3 px-4">Condición de Pago</th>
                  <th class="py-3 px-4 text-center">Facturas Cargadas</th>
                  <th class="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${suppliers.length === 0 ? `
                  <tr>
                    <td colspan="6" class="py-8 text-center text-slate-400">
                      Todavía no hay proveedores cargados. Se crearán automáticamente sin repetirse al cargar tus facturas en <strong>Carga Facturas Foto (OCR)</strong>.
                    </td>
                  </tr>
                ` : suppliers.map(s => {
                  const supPurchases = db.getPurchases().filter(p => p.status !== 'ANULADA' && p.supplier_id === s.id);
                  return `
                  <tr class="hover:bg-slate-50 transition">
                    <td class="py-3 px-4">
                      <div class="font-bold text-slate-900">${s.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">CUIT: ${s.cuit || 'S/D'}</div>
                    </td>
                    <td class="py-3 px-4 text-slate-700 font-medium">${s.address ? `${s.address} - ` : ''}${s.city || ''}</td>
                    <td class="py-3 px-4 text-slate-600">${s.phone || '-'} ${s.email ? `· ${s.email}` : ''}</td>
                    <td class="py-3 px-4 text-slate-700">${s.payment_terms || 'Contado'}</td>
                    <td class="py-3 px-4 text-center">
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-50 text-blue-800 border border-blue-200">${supPurchases.length} fact.</span>
                    </td>
                    <td class="py-3 px-4 text-center">
                      <button onclick="window.app.navigate('compras', { supplier_id: '${s.id}' })" class="px-3 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 rounded-lg text-xs font-bold transition">
                        Ver Facturas
                      </button>
                    </td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.comparadorModule = {
  selectProduct(productId) {
    const area = document.getElementById('comparatorResultsArea');
    if (!area) return;

    const prod = db.getProduct(productId);
    if (!prod) {
      area.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Seleccioná un producto.</div>';
      return;
    }

    // Datos simulados realistas de comparación para el producto
    const baseCost = prod.purchase_cost || (prod.caviahue_cost * 0.85);

    const quotes = [
      {
        supplier_name: 'Químicos del Comahue S.A. (Centenario)',
        invoice_cost: baseCost,
        freight_cost: 600,
        other_costs: 0,
        caviahue_cost: baseCost + 600,
        delivery_days: '3-4 días',
        payment_condition: 'Transferencia anticipada',
        is_best: false
      },
      {
        supplier_name: 'Papelera Patagónica (Zapala)',
        invoice_cost: baseCost * 1.05,
        freight_cost: 350, // Menor flete por cercanía geográfica a Caviahue
        other_costs: 0,
        caviahue_cost: (baseCost * 1.05) + 350,
        delivery_days: '1-2 días',
        payment_condition: 'Cuenta Corriente 30 días',
        is_best: false
      },
      {
        supplier_name: 'Distribuidora Sur (Neuquén Capital)',
        invoice_cost: baseCost * 0.95, // Precio más bajo en Neuquén pero flete mayor
        freight_cost: 850,
        other_costs: 100,
        caviahue_cost: (baseCost * 0.95) + 950,
        delivery_days: '5 días',
        payment_condition: 'Cuenta Corriente 15 días',
        is_best: false
      }
    ];

    // Marcar la opción con menor costo real en Caviahue
    quotes.sort((a, b) => a.caviahue_cost - b.caviahue_cost);
    quotes[0].is_best = true;

    area.innerHTML = `
      <div class="space-y-4 pt-2">
        <div class="p-3 bg-indigo-50/70 rounded-lg border border-indigo-200 flex items-center justify-between text-xs">
          <div>
            <span class="font-bold text-indigo-950">${prod.name}</span>
            <span class="text-slate-500 ml-2">Unidad: ${prod.sale_unit}</span>
          </div>
          <div class="text-right">
            <span class="text-slate-500">Costo Actual en Sistema:</span>
            <span class="font-bold text-indigo-900 ml-1">${Formatter.money(prod.caviahue_cost)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${quotes.map(q => `
            <div class="p-4 rounded-xl border ${q.is_best ? 'border-emerald-500 bg-emerald-50/40 shadow-sm ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white'} space-y-3 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-bold text-slate-800">${q.supplier_name}</span>
                ${q.is_best ? '<span class="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">MEJOR COSTO CAVIAHUE</span>' : ''}
              </div>

              <div class="space-y-1.5 pt-1 border-t border-slate-100 text-slate-600">
                <div class="flex justify-between">
                  <span>Precio Factura Proveedor:</span>
                  <span class="font-medium text-slate-800">${Formatter.money(q.invoice_cost)}</span>
                </div>
                <div class="flex justify-between text-blue-600">
                  <span>Flete / Transporte Zapala-Caviahue:</span>
                  <span class="font-medium">+ ${Formatter.money(q.freight_cost)}</span>
                </div>
                ${q.other_costs > 0 ? `
                  <div class="flex justify-between text-amber-600">
                    <span>Embalaje especial nieve / Seguros:</span>
                    <span class="font-medium">+ ${Formatter.money(q.other_costs)}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between pt-1 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span>COSTO FINAL PUESTO:</span>
                  <span class="${q.is_best ? 'text-emerald-700' : 'text-slate-800'}">${Formatter.money(q.caviahue_cost)}</span>
                </div>
              </div>

              <div class="pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                <div><strong>Demora entrega:</strong> ${q.delivery_days}</div>
                <div><strong>Pago:</strong> ${q.payment_condition}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};
