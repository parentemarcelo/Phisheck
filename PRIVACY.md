# Phisheck privacy policy

Effective date: 2026-11-22

Phisheck is a Chrome extension that warns you when a page you open looks like phishing. It is
built so that **nothing you browse ever leaves your computer**.

## Summary

- Phisheck collects **no** personal data and **no** browsing data.
- All analysis runs on your computer. Phisheck makes no network requests: no servers, no
  analytics, no cloud lookups, no remote model updates.
- Your settings and trusted pages are stored only on this computer, in your Chrome profile.
- Nothing is sold, shared or transferred to anyone.

## What Phisheck processes, and where

| Data | What happens to it | Where it is kept | For how long |
|---|---|---|---|
| The address (URL) and content of each page you open: links, forms, resources and similar signals | Turned into numbers and scored by a machine-learning model bundled in the extension | In memory, on your computer | Only while the page is analysed |
| The result for each tab (phishing probability, the page's URL) | Used to show the warning banner, the toolbar badge and the popup | Chrome's session storage, in memory, on your computer | Until the tab closes or Chrome exits |
| Your settings: on/off, warning threshold, trusted pages and trusted domains | Used to decide which pages to check and when to warn | Chrome's local extension storage, on your computer, never synced | Until you change them or remove the extension |

Phisheck doesn't read cookies, passwords or anything you type, your history or other tabs, and it
doesn't keep a log of the pages you visit.

## Incognito windows

Phisheck runs in incognito windows only if you turn on **Allow in Incognito** in
`chrome://extensions`. It then checks pages there in the same way. Results are kept in memory
and dropped when the tab closes.

**If you click "Trust this URL" in an incognito window, that page's URL is saved in your
trusted list, the same list used by normal windows. It stays there after you close the
incognito window, until you remove it in Phisheck's Settings.** Like all settings, it is
stored only on your computer and never sent anywhere.

## Permissions

Phisheck asks only for what it needs to check pages on your computer:

- **webNavigation:** to notice when a tab opens a new page.
- **scripting** and access to **http and https sites:** to run the check inside the pages you open.
- **storage:** to keep your settings and each tab's current result.

Phisheck doesn't request access to cookies, history, downloads, network traffic or other
extensions, and its files can't be loaded or detected by web pages.

## Removing your data

Remove trusted pages and domains in Phisheck's Settings at any time. Removing the extension
deletes all its data from your computer.

## Children

Phisheck collects no data from anyone, including children.

## Changes

Any change to this policy will be published in this file with a new effective date. Phisheck
will never start collecting data without a new, clearly announced version of the extension and
of this policy.

## Contact

Questions and reports: <https://github.com/parentemarcelo/Phisheck/issues>
