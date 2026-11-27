/**
 * Offline support, page side: registers the service worker (sw.js), offers
 * the new version when the site has been updated, says when the connection
 * comes and goes, and fills the "App" part of the reading settings (install
 * button, or how to add the site to an iPhone's home screen).
 *
 * The worker keeps a copy of the site itself; the Bible text and study data
 * are saved by js/providers/translation-cache.js as they're opened. So
 * offline, everything already opened on this device works, and the rest
 * waits for a connection. Audio always streams, so it needs one too.
 */
import { t } from './i18n.js';

/** Whether the site runs as an installed app (home-screen icon). */
export const isInstalled = () =>
  globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true;

/**
 * An error's text for the reader: offline, a plain explanation instead of
 * the network error ("Network error while loading data/kjv.json…").
 */
export function errorText(error) {
  if (globalThis.navigator?.onLine === false) return t('offline.notSaved');
  return error?.message ?? String(error);
}

/**
 * @param {object} options
 * @param {{ show: Function }} options.toaster
 * @param {HTMLElement | null} options.appSection  the settings panel's "App" group
 */
export function initOffline({ toaster, appSection }) {
  initAppSection(appSection);

  addEventListener('offline', () => toaster.show(t('offline.now')));
  addEventListener('online', () => toaster.show(t('offline.back')));
  if (navigator.onLine === false) setTimeout(() => toaster.show(t('offline.now')), 600);

  // Service workers need https (or localhost) and aren't in every browser.
  if (!('serviceWorker' in navigator) || !isSecureContext) return;

  // When a newer worker takes over (after "Reload" here or in another tab),
  // the page reloads into the new version. The very first install also
  // takes over the page, but there's nothing to reload then.
  let controlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  const offerUpdate = (worker) =>
    toaster.show(t('offline.update'), {
      action: { label: t('offline.reload'), onClick: () => worker.postMessage({ type: 'skip-waiting' }) },
    });

  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      // An installed app can stay open for days: look for a new version
      // whenever it comes back to the screen.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
      });
    })
    .catch((error) => console.warn('Offline support is unavailable:', error));

  // An installed app asks the browser not to clear its saved text when the
  // device runs low on space (Chrome agrees silently for installed apps).
  if (isInstalled()) navigator.storage?.persist?.().catch(() => {});
}

/**
 * Settings → App: "Works offline…" and, where the browser allows, an
 * Install button; on an iPhone or iPad, how to add the site to the home
 * screen; once installed, just the offline note.
 */
function initAppSection(section) {
  if (!section) return;
  const text = section.querySelector('[data-app-text]');
  const button = section.querySelector('[data-app-install]');
  let prompt = null;

  const setText = (key) => {
    text.dataset.i18n = key; // re-translated with the rest of the page
    text.textContent = t(key);
  };
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function render() {
    button.hidden = !prompt;
    if (isInstalled()) setText('appInstall.installed');
    else if (prompt) setText('appInstall.offline');
    else if (isIos) setText('appInstall.ios');
    else setText('appInstall.offline');
  }

  // Chrome, Edge, Samsung Internet: the browser's own install dialog.
  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
    render();
  });
  addEventListener('appinstalled', () => {
    prompt = null;
    render();
  });
  button.addEventListener('click', async () => {
    if (!prompt) return;
    const current = prompt;
    prompt = null;
    await current.prompt();
    await current.userChoice.catch(() => null);
    render();
  });

  section.hidden = !('serviceWorker' in navigator);
  render();
}
