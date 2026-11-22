import { describe, expect, it, vi } from 'vitest';
import {
  isNewPath,
  listenForNavigations,
  onCommittedDecision,
  onHistoryStateDecision,
  type CommitDetails,
  type NavigationDecision,
} from './navigation.js';

const main = (url: string, extra: Partial<CommitDetails> = {}): CommitDetails => ({
  tabId: 7,
  frameId: 0,
  url,
  documentLifecycle: 'active',
  ...extra,
});

describe('full navigations (onCommitted)', () => {
  it.each<[string, CommitDetails, NavigationDecision]>([
    [
      'https page in the main frame',
      main('https://example.com/login'),
      { action: 'analyse', tabId: 7, url: 'https://example.com/login', reason: 'navigation' },
    ],
    [
      'http page',
      main('http://example.com/'),
      { action: 'analyse', tabId: 7, url: 'http://example.com/', reason: 'navigation' },
    ],
    ['subframe', main('https://ads.example/', { frameId: 3 }), { action: 'ignore' }],
    [
      'prerendering document',
      main('https://example.com/', { documentLifecycle: 'prerender' }),
      { action: 'ignore' },
    ],
    ['non-tab (tabId -1)', main('https://example.com/', { tabId: -1 }), { action: 'ignore' }],
    ['chrome:// page', main('chrome://settings/'), { action: 'clear', tabId: 7 }],
    ['file:// page', main('file:///home/me/a.html'), { action: 'clear', tabId: 7 }],
    ['about:blank', main('about:blank'), { action: 'clear', tabId: 7 }],
    ['extension page', main('chrome-extension://abc/settings.html'), { action: 'clear', tabId: 7 }],
    ['data: URL', main('data:text/html,<p>x'), { action: 'clear', tabId: 7 }],
    ['view-source', main('view-source:https://example.com/'), { action: 'clear', tabId: 7 }],
  ])('%s', (_, details, expected) => {
    expect(onCommittedDecision(details)).toEqual(expected);
  });

  it('analyses a reload of the same URL again (no cache)', () => {
    const d = main('https://example.com/a');
    expect(onCommittedDecision(d).action).toBe('analyse');
    expect(onCommittedDecision(d).action).toBe('analyse');
  });

  it('analyses a full navigation that only changes the query', () => {
    expect(onCommittedDecision(main('https://example.com/a?page=2')).action).toBe('analyse');
  });
});

describe('SPA URL changes (onHistoryStateUpdated)', () => {
  const prev = 'https://app.example.com/inbox?folder=1#top';
  it.each<[string, string, string | undefined, NavigationDecision['action']]>([
    ['new path', 'https://app.example.com/settings', prev, 'analyse'],
    ['query-only change', 'https://app.example.com/inbox?folder=2', prev, 'ignore'],
    ['fragment-only change', 'https://app.example.com/inbox?folder=1#bottom', prev, 'ignore'],
    ['query and fragment change', 'https://app.example.com/inbox', prev, 'ignore'],
    ['trailing slash makes a new path', 'https://app.example.com/inbox/', prev, 'analyse'],
    ['unknown previous URL', 'https://app.example.com/inbox', undefined, 'analyse'],
    ['non-http URL', 'about:blank', prev, 'ignore'],
  ])('%s → %s', (_, url, previous, action) => {
    expect(onHistoryStateDecision(main(url), previous).action).toBe(action);
  });

  it('ignores subframes', () => {
    expect(onHistoryStateDecision(main('https://x.example/new', { frameId: 2 }), prev)).toEqual({
      action: 'ignore',
    });
  });

  it('isNewPath compares origin and path only', () => {
    expect(isNewPath('https://a.example/x?1', 'https://a.example/x?2')).toBe(false);
    expect(isNewPath('https://a.example/x', 'http://a.example/x')).toBe(true);
    expect(isNewPath('https://a.example/x', 'https://b.example/x')).toBe(true);
    expect(isNewPath('garbage', 'https://a.example/')).toBe(true);
  });
});

describe('listenForNavigations', () => {
  function mockWebNavigation() {
    const listeners = {
      committed: [] as ((d: CommitDetails) => void)[],
      history: [] as ((d: CommitDetails) => void)[],
    };
    return {
      api: {
        onCommitted: {
          addListener: (l: (d: CommitDetails) => void) => void listeners.committed.push(l),
        },
        onHistoryStateUpdated: {
          addListener: (l: (d: CommitDetails) => void) => void listeners.history.push(l),
        },
      },
      commit: (d: CommitDetails) => listeners.committed.forEach((l) => l(d)),
      history: (d: CommitDetails) => listeners.history.forEach((l) => l(d)),
    };
  }

  it('forwards only actionable decisions, using the stored previous URL', async () => {
    const nav = mockWebNavigation();
    const handle = vi.fn();
    const previousUrl = vi.fn((tabId: number) =>
      Promise.resolve(tabId === 7 ? 'https://app.example.com/inbox' : undefined),
    );
    listenForNavigations(nav.api, previousUrl, handle);

    nav.commit(main('https://app.example.com/inbox'));
    nav.commit(main('https://ads.example/', { frameId: 1 }));
    nav.commit(main('chrome://newtab/'));
    nav.history(main('https://app.example.com/inbox?x=1'));
    nav.history(main('https://app.example.com/sent'));
    nav.history(main('https://app.example.com/frame', { frameId: 4 }));

    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(3));
    expect(handle.mock.calls.map(([d]) => d)).toEqual([
      { action: 'analyse', tabId: 7, url: 'https://app.example.com/inbox', reason: 'navigation' },
      { action: 'clear', tabId: 7 },
      { action: 'analyse', tabId: 7, url: 'https://app.example.com/sent', reason: 'spa' },
    ]);
    expect(previousUrl).toHaveBeenCalledTimes(2); // not consulted for subframes
  });
});
