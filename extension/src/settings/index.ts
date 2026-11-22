/**
 * Settings page (PLAN 4.11, FR11): on/off switch, warning threshold, trusted URLs and
 * trusted domains. Every change is saved immediately to chrome.storage.local; the page also
 * re-renders when settings change elsewhere (banner, popup, another settings tab).
 */
import {
  addTrustedDomain,
  getSettings,
  InvalidEntryError,
  onSettingsChanged,
  removeTrustedDomain,
  removeTrustedUrl,
  setEnabled,
  setThreshold,
  type Settings,
} from '../common/settings.js';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`settings.html has no #${id}`);
  return node as T;
}

const enabled = byId<HTMLInputElement>('enabled');
const threshold = byId<HTMLInputElement>('threshold');
const thresholdValue = byId<HTMLOutputElement>('threshold-value');
const trustedUrls = byId<HTMLUListElement>('trusted-urls');
const trustedUrlsEmpty = byId('trusted-urls-empty');
const trustedDomains = byId<HTMLUListElement>('trusted-domains');
const trustedDomainsEmpty = byId('trusted-domains-empty');
const domainForm = byId<HTMLFormElement>('domain-form');
const domainInput = byId<HTMLInputElement>('domain-input');
const domainSubdomains = byId<HTMLInputElement>('domain-subdomains');
const domainError = byId('domain-error');

const percent = (value: number) => `${Math.round(value * 100)}%`;

function listItem(text: string, tag: string | undefined, label: string, onRemove: () => void) {
  const li = document.createElement('li');
  const entry = document.createElement('span');
  entry.className = 'entry';
  entry.textContent = text;
  if (tag !== undefined) {
    const small = document.createElement('span');
    small.className = 'tag';
    small.textContent = tag;
    entry.append(small);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', label);
  remove.addEventListener('click', onRemove);
  li.append(entry, remove);
  return li;
}

function render(settings: Settings): void {
  enabled.checked = settings.enabled;
  // Don't move the slider under the user's finger while they drag it.
  if (document.activeElement !== threshold) {
    threshold.value = String(Math.round(settings.threshold * 100));
  }
  thresholdValue.value = percent(Number(threshold.value) / 100);

  trustedUrls.replaceChildren(
    ...settings.trustedUrls.map((url) =>
      listItem(url, undefined, `Remove ${url}`, () => void removeTrustedUrl(url)),
    ),
  );
  trustedUrlsEmpty.hidden = settings.trustedUrls.length > 0;

  trustedDomains.replaceChildren(
    ...settings.trustedDomains.map((d) =>
      listItem(
        d.domain,
        d.includeSubdomains ? 'and subdomains' : 'this domain only',
        `Remove ${d.domain}`,
        () => void removeTrustedDomain(d.domain),
      ),
    ),
  );
  trustedDomainsEmpty.hidden = settings.trustedDomains.length > 0;
}

enabled.addEventListener('change', () => void setEnabled(enabled.checked));
threshold.addEventListener('input', () => {
  thresholdValue.value = percent(Number(threshold.value) / 100);
});
threshold.addEventListener('change', () => void setThreshold(Number(threshold.value) / 100));

domainForm.addEventListener('submit', (event) => {
  event.preventDefault();
  domainError.textContent = '';
  addTrustedDomain(domainInput.value, domainSubdomains.checked).then(
    () => {
      domainInput.value = '';
      domainSubdomains.checked = true;
    },
    (error: unknown) => {
      domainError.textContent =
        error instanceof InvalidEntryError
          ? 'Enter a domain name such as example.com.'
          : 'Could not save the domain. Please try again.';
      domainInput.setAttribute('aria-invalid', 'true');
      domainInput.focus();
    },
  );
});
domainInput.addEventListener('input', () => {
  domainError.textContent = '';
  domainInput.removeAttribute('aria-invalid');
});

onSettingsChanged((settings) => render(settings));
void getSettings().then(render);
