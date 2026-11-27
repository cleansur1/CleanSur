(() => {
  const overlays = 'dialog, [id$="Modal"].fixed, [id$="Dialog"].fixed';
  const closeControls = 'button[aria-label^="Cerrar"], button[title="Cerrar"], button[onclick*="close"], button.close-purchase-detail, button[id$="Close"], button[data-close], button:has([data-lucide="x"])';

  function enhance(modal) {
    const native = modal.matches('dialog');
    if (native ? !modal.open : modal.classList.contains('hidden')) return;
    const panel = native ? modal : modal.firstElementChild;
    if (!panel) return;

    const toolbar = panel.querySelector(':scope > .cs-modal-toolbar');
    if (toolbar) return;

    const original = Array.from(panel.querySelectorAll(closeControls)).find(button =>
      button.closest(overlays) === modal
    );
    if (original) {
      original.dataset.csModalClose = '';
      if (!original.textContent.trim()) original.textContent = '×';
    }

    const bar = document.createElement('div');
    bar.className = 'cs-modal-toolbar';
    const close = document.createElement('button');
    close.type = 'button';
    close.dataset.csModalClose = '';
    close.setAttribute('aria-label', 'Cerrar ventana');
    close.className = 'cs-modal-close';
    close.textContent = '×';
    close.addEventListener('click', () => {
      if (original?.isConnected && !original.disabled) {
        original.click();
      } else if (native) {
        const cancel = new Event('cancel', {cancelable:true});
        if (modal.dispatchEvent(cancel)) modal.close('cancel');
      } else if (modal.id === 'assistedCheckoutModal') {
        modal.remove();
      } else {
        modal.classList.add('hidden');
      }
    });
    if (original && /^(?:×|✕|x)$/i.test(original.textContent.trim())) original.hidden = true;
    bar.append(close);
    panel.classList.add('cs-modal-scroll');
    panel.prepend(bar);
  }

  function scan() { document.querySelectorAll(overlays).forEach(enhance); }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
  scan();
})();
