/**
 * Warning banner (PLAN 4.7, FR7, FR8, D26, D30): a non-blocking bar pinned to the top of the
 * page, shown only for flagged pages.
 *
 * - Isolation: the bar lives in a shadow root; the host element resets every property with
 *   inline `!important` declarations (which beat any page stylesheet), so page CSS can neither
 *   restyle nor hide it, and the banner's CSS cannot leak into the page.
 * - Non-blocking: `position: fixed` over the top of the page; it doesn't move page content.
 *   The host is attached to <html>, not <body>, so body transforms or filters can't displace it.
 * - Buttons react only to real user input (`event.isTrusted`), so page scripts can't dismiss
 *   the warning or trust themselves.
 * - Dismiss only hides it for this visit; the next visit shows it again (D30).
 * - Guarded (PLAN 5.2): if the page removes or moves the banner, changes the host's attributes
 *   (inline style, `hidden`, `inert`, …) or edits the shadow content, it is restored. A page
 *   that keeps fighting gets at most MAX_RESTORES restorations, so the two can't loop forever;
 *   the toolbar badge, which pages can't touch, still shows the verdict.
 */
import { confidenceText } from '../common/format.js';

export const BANNER_TAG = 'phisheck-banner';

export interface BannerActions {
  onTrust: () => Promise<void>;
}

/** Restorations allowed per banner before giving up on a page that keeps removing it. */
export const MAX_RESTORES = 20;

const HOST_STYLE: Record<string, string> = {
  all: 'initial',
  display: 'block',
  position: 'fixed',
  top: '0',
  left: '0',
  right: '0',
  width: '100%',
  'z-index': '2147483647',
  margin: '0',
  padding: '0',
  border: '0',
  transform: 'none',
  filter: 'none',
  opacity: '1',
  visibility: 'visible',
  'pointer-events': 'auto',
};

const CSS = `
:host { all: initial; }
.bar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  background: #b3261e;
  color: #fff;
  font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  box-shadow: 0 2px 8px rgb(0 0 0 / 35%);
  text-align: left;
}
.icon { flex: none; font-size: 20px; line-height: 1; }
.text { flex: 1 1 auto; min-width: 0; }
.title { font-weight: 700; }
.detail { opacity: 0.95; }
.actions { flex: none; display: flex; gap: 8px; }
button {
  all: initial;
  box-sizing: border-box;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 4px;
  font: 600 13px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  border: 1px solid #fff;
  color: #fff;
  background: transparent;
  white-space: nowrap;
}
button.primary { background: #fff; color: #b3261e; }
button:focus-visible { outline: 3px solid #ffd54f; outline-offset: 2px; }
button:disabled { opacity: 0.6; cursor: default; }
@media (max-width: 600px) {
  .bar { flex-wrap: wrap; }
  .actions { width: 100%; justify-content: flex-end; }
}
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

declare global {
  /**
   * Stops guarding the banner currently shown. Kept on the isolated world's global object
   * because each injection of content.js (one per SPA navigation) has its own module scope.
   */
  var __phisheckStopBanner: (() => void) | undefined;
}

export function removeBanner(): void {
  globalThis.__phisheckStopBanner?.();
  globalThis.__phisheckStopBanner = undefined;
  for (const node of document.querySelectorAll(BANNER_TAG)) node.remove();
}

/** Fills the shadow root with the bar; returns its two buttons. */
function render(root: ShadowRoot, probability: number) {
  const style = el('style');
  style.textContent = CSS;
  const bar = el('div', { class: 'bar', role: 'alert', 'aria-live': 'assertive' });
  const text = el('div', { class: 'text' });
  text.append(
    el(
      'div',
      { class: 'title' },
      `Phisheck: likely phishing — ${confidenceText(probability)} confidence`,
    ),
    el(
      'div',
      { class: 'detail' },
      "This page looks like a phishing page. Don't enter passwords, codes or payment details.",
    ),
  );
  const dismiss = el('button', { type: 'button', 'data-action': 'dismiss' }, 'Dismiss');
  const trust = el(
    'button',
    { type: 'button', class: 'primary', 'data-action': 'trust' },
    'Trust this URL',
  );
  const buttons = el('div', { class: 'actions' });
  buttons.append(dismiss, trust);
  bar.append(el('div', { class: 'icon', 'aria-hidden': 'true' }, '⚠'), text, buttons);
  root.replaceChildren(style, bar);
  return { dismiss, trust };
}

export function showBanner(probability: number, actions: BannerActions): HTMLElement {
  removeBanner();
  const host = document.createElement(BANNER_TAG);
  for (const [prop, value] of Object.entries(HOST_STYLE)) {
    host.style.setProperty(prop, value, 'important');
  }
  const hostStyle = host.getAttribute('style') ?? '';
  const root = host.attachShadow({ mode: 'open' });

  let restores = 0;
  let stopped = false;
  const observers: MutationObserver[] = [];
  const stop = () => {
    stopped = true;
    for (const o of observers) o.disconnect();
  };
  /** Runs `fix` for a change the page made, unless the page has used up its restorations. */
  const restore = (fix: () => void) => {
    if (stopped) return;
    if (restores >= MAX_RESTORES) {
      stop();
      return;
    }
    restores++;
    fix();
    for (const o of observers) o.takeRecords(); // our own changes are not the page's
  };

  const wire = () => {
    const { dismiss, trust } = render(root, probability);
    dismiss.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      stop();
      host.remove();
    });
    trust.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      trust.disabled = true;
      dismiss.disabled = true;
      shadowObserver.takeRecords(); // our own change
      actions.onTrust().then(
        () => {
          stop();
          host.remove();
        },
        () => {
          trust.disabled = false;
          dismiss.disabled = false;
          shadowObserver.takeRecords();
        },
      );
    });
  };

  // Removed or moved (also when the page replaces <html> itself).
  const placeObserver = new MutationObserver(() => {
    if (host.parentNode === document.documentElement) return;
    restore(() => {
      document.documentElement.append(host);
      placeObserver.observe(document.documentElement, { childList: true });
    });
  });
  // Restyled or hidden through its attributes.
  const hostObserver = new MutationObserver(() => {
    restore(() => {
      for (const name of host.getAttributeNames()) host.removeAttribute(name);
      host.setAttribute('style', hostStyle);
    });
  });
  // Its content edited through the (open) shadow root.
  const shadowObserver = new MutationObserver(() => restore(wire));
  observers.push(placeObserver, hostObserver, shadowObserver);

  wire();
  document.documentElement.append(host);
  placeObserver.observe(document, { childList: true });
  placeObserver.observe(document.documentElement, { childList: true });
  hostObserver.observe(host, { attributes: true });
  shadowObserver.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  globalThis.__phisheckStopBanner = stop;
  return host;
}
