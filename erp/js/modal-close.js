(() => {
  const overlaySelector = 'dialog, [id$="Modal"].fixed, [id$="Dialog"].fixed';
  const closeSelector = 'button[aria-label="Cerrar"], button[title="Cerrar"], button[onclick*="close"], button.close-purchase-detail, button[id$="Close"], button:has([data-lucide="x"])';
  function enhance(modal) {
    if (modal.matches('dialog') ? !modal.open : modal.classList.contains('hidden')) return;
    const panel = modal.matches('dialog') ? modal : modal.firstElementChild;
    if (!panel) return;
    const existing = panel.querySelector(closeSelector);
    if (existing) {
      existing.setAttribute('data-cs-modal-close','');
      existing.setAttribute('aria-label','Cerrar ventana');
      existing.setAttribute('type','button');
      if (existing.closest('form[method="dialog"]')) existing.type='submit';
      if (!existing.textContent.trim()) existing.textContent='×';
      return;
    }
    if (panel.querySelector('[data-cs-modal-close]')) return;
    if (getComputedStyle(panel).position==='static') panel.style.position='relative';
    const close = document.createElement('button');
    close.type='button';
    close.setAttribute('data-cs-modal-close','');
    close.setAttribute('aria-label','Cerrar ventana');
    close.textContent='×';
    close.className='cs-modal-close';
    close.addEventListener('click', () => {
      if (modal.matches('dialog')) modal.close();
      else if (modal.id==='assistedCheckoutModal') modal.remove();
      else modal.classList.add('hidden');
    });
    panel.prepend(close);
  }
  function scan(){document.querySelectorAll(overlaySelector).forEach(enhance);}
  let queued=false;
  const observer=new MutationObserver(()=>{
    if (queued) return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;scan();});
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
  scan();
})();
