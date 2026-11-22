export function salesDialog(title, content, action, field) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'm-auto w-[92%] max-w-lg rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/60';
    dialog.setAttribute('aria-labelledby', 'sales-dialog-title');
    dialog.innerHTML = `
      <h2 id="sales-dialog-title" class="bg-[#0E3A6B] px-5 py-4 text-lg font-bold text-white"></h2>
      <form method="dialog" class="space-y-4 p-5 text-sm text-slate-700">
        <div data-sale-dialog-content class="space-y-2"></div>
        <div class="flex justify-end gap-2">
          <button value="cancel" formnovalidate class="rounded-lg border px-4 py-2">${action ? 'Cancelar' : 'Cerrar'}</button>
          ${action ? '<button value="accept" class="rounded-lg bg-[#0E3A6B] px-4 py-2 font-bold text-white"></button>' : ''}
        </div>
      </form>`;
    dialog.querySelector('h2').textContent = title;
    const body = dialog.querySelector('[data-sale-dialog-content]');
    if (typeof content === 'string') body.textContent = content;
    else body.append(content);
    if (field) body.append(field);
    if (action) dialog.querySelector('[value="accept"]').textContent = action;
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue === 'accept' ? (field?.value ?? true) : false;
      dialog.remove();
      resolve(result);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}
