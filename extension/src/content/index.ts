/**
 * Content script (PLAN 4.5): injected by the service worker into the main frame of a page to
 * analyse, in the extension's isolated world. The service worker first sets
 * `globalThis.__phisheckNavigation` to this analysis' token. The script waits for the page to
 * settle, extracts the features with the shared extractor (URL + live DOM, no extra request,
 * FR3), and sends them to the service worker, which runs the model.
 *
 * It may be injected again into the same document (SPA navigation); a newer token makes any
 * older run in progress stop.
 */
import { extract, type FeatureVector } from '@phisheck/shared/features';
import {
  toWire,
  type FeaturesMessage,
  type HideBannerMessage,
  type TrustMessage,
  type VerdictResponse,
} from '../common/messages.js';
import { removeBanner, showBanner } from './banner.js';
import { pageSettled } from './settle.js';

declare global {
  var __phisheckNavigation: string | undefined;
  var __phisheckListening: boolean | undefined;
}

function extractFeatures(url: string): { vector: FeatureVector; domError?: string } {
  try {
    return { vector: extract(url, document) };
  } catch (error) {
    // Missing values must be explicit (FR3): fall back to URL-only, DOM features NaN.
    return { vector: extract(url), domError: String(error) };
  }
}

async function analyse(navigationId: string): Promise<VerdictResponse | undefined> {
  await pageSettled();
  if (globalThis.__phisheckNavigation !== navigationId) return undefined; // superseded
  // An earlier verdict's banner must not be part of the page that is analysed.
  removeBanner();
  const { vector, domError } = extractFeatures(location.href);
  const message: FeaturesMessage = {
    type: 'phisheck:features',
    navigationId,
    url: location.href,
    vector: toWire(vector),
    ...(domError === undefined ? {} : { domError }),
  };
  const response = (await chrome.runtime.sendMessage(message)) as VerdictResponse;
  if (
    globalThis.__phisheckNavigation === navigationId &&
    response.status === 'done' &&
    response.flagged
  ) {
    showBanner(response.probability, { onTrust: () => trust(message.url) });
  }
  return response;
}

async function trust(url: string): Promise<void> {
  const ok = (await chrome.runtime.sendMessage({
    type: 'phisheck:trust',
    url,
  } satisfies TrustMessage)) as boolean | undefined;
  if (ok !== true) throw new Error('could not trust this URL');
}

// One listener per document, even when the script is injected again for an SPA navigation.
if (!globalThis.__phisheckListening) {
  globalThis.__phisheckListening = true;
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if ((message as HideBannerMessage | undefined)?.type === 'phisheck:hide-banner') removeBanner();
    return false;
  });
}

const navigationId = globalThis.__phisheckNavigation;
if (typeof navigationId === 'string') {
  void analyse(navigationId).catch((error: unknown) => {
    // The extension was reloaded or the page is going away: nothing to do.
    console.debug('Phisheck: analysis aborted', error);
  });
}
