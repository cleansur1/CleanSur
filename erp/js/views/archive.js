export function isCancelled(status) {
  return /^(anulad[oa]s?|cancelad[oa]s?|eliminad[oa]s?|borrad[oa]s?)$/i.test(String(status ?? '').trim());
}

export function bindArchive(container, namespace) {
  const rows = [...container.querySelectorAll('[data-archive-id]')];
  if (!rows.length) return;
  const key = 'cleansur.archive.' + namespace;
  let archived;
  try {
    archived = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    archived = new Set();
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mb-3 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700';
  container.prepend(toggle);
  let showArchive = false;
  const update = () => {
    const count = rows.filter(row => archived.has(row.dataset.archiveId)).length;
    toggle.textContent = showArchive ? 'Volver al listado' : 'Ver eliminados (' + count + ')';
    toggle.setAttribute('aria-pressed', String(showArchive));
    for (const row of container.querySelectorAll('[data-archive-row]')) {
      const id = row.dataset.archiveId;
      row.style.display = showArchive !== Boolean(id && archived.has(id)) ? 'none' : '';
    }
    for (const row of rows) {
      const button = row.querySelector('[data-archive-action]');
      const label = archived.has(row.dataset.archiveId) ? 'Volver al listado principal' : 'Mover a eliminados';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = archived.has(row.dataset.archiveId)
        ? '<i data-lucide="rotate-ccw" class="h-4 w-4"></i>'
        : '<i data-lucide="trash-2" class="h-4 w-4"></i>';
    }
    window.lucide?.createIcons();
  };
  toggle.onclick = () => { showArchive = !showArchive; update(); };
  for (const row of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-flex items-center rounded border p-2 text-rose-700 hover:bg-rose-50';
    button.dataset.archiveAction = '';
    row.querySelector('[data-archive-actions]').append(button);
    button.onclick = () => {
      const id = row.dataset.archiveId;
      const next = new Set(archived);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(key, JSON.stringify([...next]));
        archived = next;
        update();
      } catch {
        window.app.showNotification('No se pudo guardar el cambio en este navegador.', 'error');
      }
    };
  }
  update();
}
