const host = document.querySelector<HTMLElement>('[data-cosmic-environment]');
if (host) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 760px)');
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let cleanup: (() => void) | undefined;
  let request: AbortController | undefined;
  let suspended = false;
  async function update() {
    request?.abort();
    const active = new AbortController();
    request = active;
    cleanup?.();
    cleanup = undefined;
    host!.dataset.mode = 'static';
    if (suspended || document.hidden || reduced.matches || !desktop.matches || device.connection?.saveData || (device.deviceMemory ?? 8) < 4 || (navigator.hardwareConcurrency || 4) < 4) {
      request = undefined;
      return;
    }
    try {
      const { createCosmicScene } = await import('./planet-scene');
      if (active.signal.aborted) return;
      const dispose = await createCosmicScene(host!, active.signal);
      if (active.signal.aborted) dispose();
      else cleanup = dispose;
    } catch {
      if (!active.signal.aborted) host!.dataset.mode = 'static';
    } finally {
      if (request === active) request = undefined;
    }
  }
  reduced.addEventListener('change', update);
  desktop.addEventListener('change', update);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !suspended && !cleanup && !request) update();
  });
  window.addEventListener('pagehide', () => {
    suspended = true;
    request?.abort();
    request = undefined;
    cleanup?.();
    cleanup = undefined;
    host!.dataset.mode = 'static';
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { suspended = false; update(); }
  });
  update();
}
