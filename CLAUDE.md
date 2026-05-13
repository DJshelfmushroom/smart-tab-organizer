# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Firefox-first (Chrome-compatible) WebExtensions browser extension that automatically repositions new tabs next to semantically similar ones. Uses Ollama embeddings or a bundled local model (`all-MiniLM-L6-v2` via transformers.js) to score tabs, with a co-occurrence habit layer that personalizes placement over time.

## Build

The first-party JS files require no build step. Run:

```bash
npm install
node build.js
```

`build.js` bundles `@xenova/transformers` via esbuild into `lib/transformers.js`, copies `ort-wasm-simd.wasm`, patches three dead Node.js-only `eval`/`new Function` patterns that AMO prohibits, then produces `firefox.zip` and `chrome.zip`.

## Loading in Firefox

`about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`

Open the background page console via "Inspect" on the extension entry — all logs are prefixed `[TabOrg]`.

## Architecture

**Script load order** (Firefox: declared in `manifest.json` `background.scripts`; Chrome MV3: via `importScripts()` in `background.sw.js`):
```
chrome-compat.js → storage.js → habits.js → lib/transformers.js → embedding.js → background.js
```
Each file depends on globals defined by the previous ones. There is no module system.

**Tab placement flow** (`background.js`):
1. `tabs.onCreated` — records `{ fromNewTab, openerTabId }` in `pendingTabs` Map
2. `tabs.onUpdated` (title change) — triggers `repositionTab()` if tab came from a new tab page
3. `repositionTab()` — scores all non-pinned tabs via `scoreTabPair()`, moves to best match above threshold 0.35, falls back to domain matching if no match or Ollama offline
4. `tabs.onMoved` (user drag) — records co-occurrence with new neighbors into habit matrix

**Scoring** (`embedding.js`): `0.7 * cosineSimilarity + 0.3 * habitBonus`. Backend is `await storageGet('embeddingBackend', 'ollama')` — one of `'ollama'`, `'local'`, or `'none'`.

**Habit matrix** (`habits.js`): symmetric co-occurrence matrix persisted to `browser.storage.local` under key `'habitMatrix'`. `extractTokens()` strips stop words and short tokens. `habitBonus()` returns `Math.tanh(score/10)`. Flushed via `browser.runtime.onSuspend` and on a 30s interval.

**Notifications**: `notifyMoved()` in `background.js` checks `browser.permissions.contains({ origins: ['<all_urls>'] })` — if granted, sends a `TAB_ORG_TOAST` message to the active tab's content script (`content/toast.js`); otherwise falls back to `browser.notifications`. `content/toast.js` injects a Shadow DOM toast.

**Popup** (`popup/`): Loads `chrome-compat.js` and `storage.js` as `<script>` tags (separate HTML context from background). The backend selector requests/revokes `http://localhost/*` as an optional permission.

**Welcome page** (`welcome.html` + `welcome.js`): Opens on `runtime.onInstalled` (first install only). Lets the user pick backend and grant overlay permission before any tabs are processed.

## Key constraints

- **No module system** — all files share a single global scope in the background page. Functions defined in earlier scripts (e.g. `storageGet`, `habitBonus`, `preprocessTitle`) are called by name in later ones.
- **`programmaticMoves`** is a `Set<tabId>` (not a boolean) — prevents concurrent repositions from incorrectly suppressing habit recording on user drags.
- **`pendingTabs.delete(tabId)` happens before `await repositionTab()`** — prevents double-processing since `tabs.onUpdated` fires for both `loading` and title-change events.
- **Content scripts only inject when `<all_urls>` optional permission is granted** — declared in manifest `content_scripts` but Firefox silently skips injection without the permission.
- **`wasm-unsafe-eval` in CSP** is required to instantiate `lib/ort-wasm-simd.wasm`.
- **Firefox 140+ required** due to `data_collection_permissions` in `browser_specific_settings`.

## Chrome/Chromium (MV3)

`manifest.chrome.json` is the Chrome manifest. `background.sw.js` is the service worker entry point. `build.js` produces `chrome.zip` (manifest.chrome.json → manifest.json, plus background.sw.js) alongside `firefox.zip`. Load unpacked from the unzipped `chrome.zip` contents in `chrome://extensions`.

## AMO submission

Extension ID: `smart-tab-organizer@djshelfmushroom`
AMO listing: https://addons.mozilla.org/developers/addon/3012117/versions

Submit two zips: the extension zip and a source zip (containing `package.json`, `build.js`, `BUILD.md` — no `node_modules/`, no `lib/`). The source zip lets reviewers reproduce `lib/` from scratch. See `BUILD.md` for the reviewer notes about the eval patches.
