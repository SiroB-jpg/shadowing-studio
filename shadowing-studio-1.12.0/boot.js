(() => {
  const theme = localStorage.getItem('v08theme') || 'sage';
  document.documentElement.setAttribute('data-theme', theme);

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  window.addEventListener('load', async () => {
    let refreshing = false;
    let applyingUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!applyingUpdate || refreshing) return;
      refreshing = true;
      location.reload();
    });

    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      const showUpdate = () => {
        const notice = document.getElementById('updateNotice');
        const button = document.getElementById('applyUpdate');
        if (!notice || !button || !registration.waiting) return;
        notice.classList.remove('hidden');
        button.onclick = () => {
          applyingUpdate = true;
          button.disabled = true;
          button.textContent = 'Updating…';
          registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        };
      };

      if (registration.waiting) showUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
      registration.update().catch(() => {});
    } catch {
      // The app still works without installability or offline caching.
    }
  });
})();
