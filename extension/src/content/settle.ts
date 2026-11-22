/**
 * Waits until the page has settled before features are extracted, with the same rules as the
 * crawler that collected the training pages (`load` up to 10 s, then network idle up to 3 s),
 * so the extension sees DOMs like the ones the model was trained on.
 *
 * "Idle" = no new resource loads for QUIET_MS, observed through the Resource Timing API
 * (the content script cannot see the network directly), capped at MAX_SETTLE_MS.
 */
export const LOAD_TIMEOUT_MS = 10_000;
export const QUIET_MS = 500;
export const MAX_SETTLE_MS = 3_000;

function waitForLoad(timeoutMs: number): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    window.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function waitForQuiet(quietMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;
    let observer: PerformanceObserver | undefined;
    const done = () => {
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      observer?.disconnect();
      resolve();
    };
    const maxTimer = setTimeout(done, maxMs);
    const restart = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(done, quietMs);
    };
    try {
      observer = new PerformanceObserver(restart);
      observer.observe({ type: 'resource' });
    } catch {
      // No Resource Timing: fall back to a fixed quiet period.
    }
    restart();
  });
}

export async function pageSettled(): Promise<void> {
  await waitForLoad(LOAD_TIMEOUT_MS);
  await waitForQuiet(QUIET_MS, MAX_SETTLE_MS);
}
