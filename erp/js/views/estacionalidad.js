// Módulo de Estacionalidad & Preparación de Temporada para Caviahue
// Análisis de temporadas Invierno / Verano / Baja, stock preventivo recomendado y cálculo de capital necesario.
// Permite editar los meses y el factor de demanda ("x cuánto").

import { db } from '../db.js';
import { Formatter } from '../models.js';

let selectedSeasonId = 'seas-invierno';

export const EstacionalidadView = {
  render(container) {
    const seasons = db.getSeasons();
    const activeSeason = seasons.find(s => s.id === selectedSeasonId) || seasons[0];
    const products = db.getProducts();

    // Calcular cálculo de temporada para cada producto
    const prepItems = products.map(p => {
      const multiplier = activeSeason.demand_multiplier;
      const recommendedStock = Math.ceil(p.min_stock * multiplier);
      const diffToBuy = Math.max(0, recommendedStock - p.current_stock);
      const capitalNeeded = diffToBuy * p.caviahue_cost;

      return {
        ...p,
        recommendedStock,
        diffToBuy,
        capitalNeeded
      };
    });

    const totalCapitalNeeded = prepItems.reduce((sum, it) => sum + it.capitalNeeded, 0);

    container.innerHTML = `
      <div class="space-y-6 animate-fade-in max-w-6xl mx-auto">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                <i data-lucide="mountain-snow" class="w-3.5 h-3.5 mr-1 inline"></i> Clima de Montaña & Rutas
              </span>
            </div>
            <h1 class="text-2xl font-bold text-slate-800 tracking-tight mt-1">Estacionalidad Turística & Parámetros</h1>
            <p class="text-xs text-slate-500">Ajustá los meses y el multiplicador de demanda según la temporada de esquí o termal para anticipar compras.</p>
          </div>
          <div class="text-right">
            <span class="text-xs text-slate-500 block">Capital Estimado para Stock Preventivo:</span>
            <span class="text-xl font-extrabold text-indigo-700">${Formatter.money(totalCapitalNeeded)}</span>
          </div>
        </div>

        <!-- Selector y Editor de Temporada Caviahue -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          ${seasons.map(s => {
            const isSel = s.id === selectedSeasonId;
            return `
              <div class="p-5 rounded-xl border transition flex flex-col justify-between ${isSel ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-600/20' : 'border-slate-200 bg-white hover:bg-slate-50'}">
                <div onclick="window.estacionalidadModule.selectSeason('${s.id}')" class="cursor-pointer">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-900 text-base">${s.name}</span>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full ${isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}">
                      x${s.demand_multiplier} Demanda
                    </span>
                  </div>
                  <div class="text-xs font-semibold text-indigo-800 mt-1 flex items-center gap-1">
                    <i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${s.period}
                  </div>
                  <p class="text-xs text-slate-600 mt-2">${s.description}</p>
                </div>

                <div class="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <button onclick="window.estacionalidadModule.selectSeason('${s.id}')" class="text-indigo-600 font-bold hover:underline">
                    ${isSel ? '✓ Seleccionada' : 'Seleccionar'}
                  </button>
                  <button onclick="window.estacionalidadModule.openEditSeasonModal('${s.id}')" class="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-700 font-semibold shadow-xs flex items-center gap-1">
                    <i data-lucide="edit-2" class="w-3 h-3 text-slate-500"></i> Editar Parámetros
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Tabla: Preparación de Temporada -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Plan Preventivo para: <span class="text-indigo-600 font-extrabold">${activeSeason.name} (Multiplicador x${activeSeason.demand_multiplier})</span>
              </h3>
              <p class="text-xs text-slate-500">Estimación de bultos a acopiar antes del cierre de rutas por temporales de nieve en Pino Hachado / Caviahue</p>
            </div>
            <span class="text-xs font-bold bg-amber-50 text-amber-800 px-3 py-1 rounded-full border border-amber-200">
              ${prepItems.filter(i => i.diffToBuy > 0).length} productos requieren compra preventiva
            </span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th class="py-3 px-3">SKU</th>
                  <th class="py-3 px-3">Insumo / Producto</th>
                  <th class="py-3 px-3 text-center">Stock Actual</th>
                  <th class="py-3 px-3 text-center font-bold text-indigo-700">Stock Sugerido</th>
                  <th class="py-3 px-3 text-center font-bold text-amber-700">A Comprar</th>
                  <th class="py-3 px-3 text-right">Costo Caviahue</th>
                  <th class="py-3 px-3 text-right font-bold text-slate-900">Capital Necesario</th>
                  <th class="py-3 px-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${prepItems.map(it => `
                  <tr class="hover:bg-slate-50 transition ${it.diffToBuy > 0 ? 'bg-amber-50/20' : ''}">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${it.sku}</td>
                    <td class="py-2.5 px-3 font-medium text-slate-900">${it.name}</td>
                    <td class="py-2.5 px-3 text-center font-bold text-slate-800">${it.current_stock} ${it.sale_unit}</td>
                    <td class="py-2.5 px-3 text-center font-bold text-indigo-700">${it.recommendedStock} ${it.sale_unit}</td>
                    <td class="py-2.5 px-3 text-center font-bold ${it.diffToBuy > 0 ? 'text-amber-700' : 'text-emerald-700'}">
                      ${it.diffToBuy > 0 ? `+${it.diffToBuy} ${it.sale_unit}` : 'Cubierto ✓'}
                    </td>
                    <td class="py-2.5 px-3 text-right text-slate-600">${Formatter.money(it.caviahue_cost)}</td>
                    <td class="py-2.5 px-3 text-right font-bold text-indigo-900">
                      ${it.diffToBuy > 0 ? Formatter.money(it.capitalNeeded) : '-'}
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      <span class="inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${it.diffToBuy > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                        ${it.diffToBuy > 0 ? 'Invertir' : 'Stock OK'}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Editar Temporada -->
      <div id="editSeasonModal" class="hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 class="text-base font-bold text-slate-800">Editar Parámetros de Temporada</h3>
            <button onclick="document.getElementById('editSeasonModal').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>

          <form onsubmit="window.estacionalidadModule.submitSeason(event)" class="space-y-4 text-xs">
            <input type="hidden" id="seasId" value="">
            
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre de la Temporada</label>
              <input type="text" id="seasName" required class="w-full border border-slate-300 rounded-lg p-2 font-medium">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Meses / Período de Aplicación</label>
              <input type="text" id="seasPeriod" required placeholder="Ej: Junio a Septiembre (Pico de Esquí)" class="w-full border border-slate-300 rounded-lg p-2 font-medium">
              <span class="text-[10px] text-slate-400 mt-0.5 block">Indicá los meses en los que rige esta temporada en Caviahue.</span>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Multiplicador de Demanda ("x cuánto")</label>
              <div class="flex items-center gap-2">
                <span class="font-bold text-indigo-700 text-base">x</span>
                <input type="number" id="seasMultiplier" required min="0.5" max="10" step="0.1" class="w-full border border-indigo-300 rounded-lg p-2 font-bold text-indigo-700 text-sm">
              </div>
              <span class="text-[10px] text-slate-400 mt-0.5 block">Ejemplo: 2.5 significa que se venderá 2.5 veces más que el stock mínimo base.</span>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Descripción / Consideraciones Operativas</label>
              <textarea id="seasDesc" rows="3" class="w-full border border-slate-300 rounded-lg p-2 text-xs"></textarea>
            </div>

            <div class="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onclick="document.getElementById('editSeasonModal').classList.add('hidden')" class="px-4 py-2 border rounded-lg text-slate-600">Cancelar</button>
              <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm">Guardar Parámetros</button>
            </div>
          </form>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }
};

window.estacionalidadModule = {
  selectSeason(seasonId) {
    selectedSeasonId = seasonId;
    EstacionalidadView.render(document.getElementById('app-content'));
  },

  openEditSeasonModal(seasonId) {
    const season = db.getSeasons().find(s => s.id === seasonId);
    if (!season) return;

    document.getElementById('seasId').value = season.id;
    document.getElementById('seasName').value = season.name;
    document.getElementById('seasPeriod').value = season.period;
    document.getElementById('seasMultiplier').value = season.demand_multiplier;
    document.getElementById('seasDesc').value = season.description || '';

    const modal = document.getElementById('editSeasonModal');
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  submitSeason(e) {
    e.preventDefault();
    const id = document.getElementById('seasId').value;
    const name = document.getElementById('seasName').value;
    const period = document.getElementById('seasPeriod').value;
    const demand_multiplier = Number(document.getElementById('seasMultiplier').value) || 1.0;
    const description = document.getElementById('seasDesc').value;

    try {
      db.saveSeason({
        id,
        name,
        period,
        demand_multiplier,
        description
      });

      document.getElementById('editSeasonModal').classList.add('hidden');
      alert(`Parámetros de la temporada "${name}" guardados. Multiplicador ajustado a x${demand_multiplier}.`);
      EstacionalidadView.render(document.getElementById('app-content'));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }
};
