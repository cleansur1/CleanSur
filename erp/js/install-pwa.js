// Capture the browser's installation offer even before the ERP session loads.
(() => {
  let installPrompt;
  let installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const updateButton = () => {
    const button = document.getElementById('btnInstallPWA');
    if (!button) return;
    button.disabled = installed;
    button.querySelector('span').textContent = installed
      ? 'App instalada en este dispositivo'
      : 'Instalar App en este Dispositivo';
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installed = false;
    updateButton();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    updateButton();
  });

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('../order-push-worker.js', document.currentScript.src))
      .catch(error => console.warn('Registro de CleanSur PWA:', error));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('btnInstallPWA');
    updateButton();
    button?.addEventListener('click', async () => {
      if (installed) return;
      if (installPrompt) {
        const prompt = installPrompt;
        installPrompt = null;
        try {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === 'accepted') {
            installed = true;
            updateButton();
          }
          return;
        } catch {
          // If the native prompt is no longer available, show browser instructions.
        }
      }
      const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const android = /Android/i.test(navigator.userAgent);
      alert(ios
        ? 'En Safari, tocá Compartir → Agregar a pantalla de inicio → Agregar. Activá Abrir como app web si aparece esa opción.'
        : android
          ? 'En Chrome, abrí el menú ⋮ y elegí Instalar aplicación o Agregar a pantalla principal.'
          : 'En Chrome o Edge, usá el icono de instalación de la barra de direcciones o el menú del navegador → Instalar CleanSur. Si ya la instalaste, buscá CleanSur entre tus aplicaciones.');
    });
  });
})();
