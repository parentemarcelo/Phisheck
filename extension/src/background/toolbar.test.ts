import { describe, expect, it, vi } from 'vitest';
import type { TabState } from '../common/tab-state.js';
import { confidenceText } from '../common/format.js';
import { listenForToolbarClicks, updateToolbar, type ActionLike } from './toolbar.js';

function mockAction() {
  return {
    setBadgeText: vi.fn<ActionLike['setBadgeText']>(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn<ActionLike['setBadgeBackgroundColor']>(() => Promise.resolve()),
    setTitle: vi.fn<ActionLike['setTitle']>(() => Promise.resolve()),
    setPopup: vi.fn<ActionLike['setPopup']>(() => Promise.resolve()),
  };
}

const done = (flagged: boolean, probability: number): TabState => ({
  status: 'done',
  url: 'https://x.example/',
  navigationId: 'n',
  probability,
  threshold: 0.8,
  flagged,
  analysedAt: 0,
});

describe('updateToolbar', () => {
  it('shows the badge and confidence only on flagged tabs', async () => {
    const action = mockAction();
    await updateToolbar(action, 3, done(true, 0.947));
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '!' });
    expect(action.setPopup).toHaveBeenCalledWith({ tabId: 3, popup: 'popup.html' });
    expect(action.setTitle).toHaveBeenCalledWith({
      tabId: 3,
      title: 'Phisheck: likely phishing (94% confidence)',
    });
  });

  it.each<[string, TabState | undefined]>([
    ['benign verdict', done(false, 0.3)],
    [
      'pending (new navigation)',
      { status: 'pending', url: 'https://x/', navigationId: 'n', startedAt: 0 },
    ],
    ['skipped', { status: 'skipped', url: 'https://x/', navigationId: 'n', reason: 'trusted' }],
    ['error', { status: 'error', url: 'https://x/', navigationId: 'n', message: 'x' }],
    ['cleared', undefined],
  ])('clears the badge for %s', async (_, state) => {
    const action = mockAction();
    await updateToolbar(action, 3, state);
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 3, text: '' });
    expect(action.setPopup).toHaveBeenCalledWith({ tabId: 3, popup: '' });
    expect(action.setTitle).toHaveBeenCalledWith({ tabId: 3, title: 'Phisheck' });
  });

  it('ignores a tab closed in the meantime', async () => {
    const action = mockAction();
    action.setBadgeText.mockRejectedValue(new Error('No tab with id: 3'));
    await expect(updateToolbar(action, 3, undefined)).resolves.toBeUndefined();
  });

  it('never rounds a confidence up past what the model said', () => {
    expect(confidenceText(0.999)).toBe('99%');
    expect(confidenceText(0.8)).toBe('80%');
    expect(confidenceText(1)).toBe('100%');
  });
});

describe('listenForToolbarClicks', () => {
  it('opens Settings when the button is clicked on a tab without popup', () => {
    let click: (() => void) | undefined;
    const openSettings = vi.fn(() => Promise.resolve());
    listenForToolbarClicks({ addListener: (cb) => (click = cb) }, openSettings);
    expect(openSettings).not.toHaveBeenCalled();
    click?.();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
