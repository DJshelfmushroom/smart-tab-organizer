# Smart Tab Organizer — Project Plan

## Concept
A browser extension (Firefox-first, Chrome-compatible) that automatically repositions new tabs based on semantic similarity to existing tabs, personalized over time by the user's own tab-moving behavior.

---

## Tech Stack
- **Extension**: WebExtensions API (MV2 for Firefox compatibility)
- **Embeddings**: `all-MiniLM-L6-v2` via Ollama (`nomic-embed-text` is also a good option)
- **Embedding endpoint**: `http://localhost:11434/api/embeddings`
- **Habit store**: `browser.storage.local` (JSON, persisted across sessions)
- **Polyfill**: `webextension-polyfill` for Chrome/Firefox API parity

---

## Architecture

### Files
```
extension/
├── manifest.json
├── background.js        # Core logic — event listeners, tab management
├── embedding.js         # Ollama API calls, cosine similarity
├── habits.js            # Co-occurrence matrix read/write
├── storage.js           # Wrapper around browser.storage.local
└── popup/               # Optional settings UI
    ├── popup.html
    └── popup.js
```

---

## Core Data Structures

### Tab State (in-memory)
```js
// Tracked when a tab is opened
{
  tabId: 123,
  fromNewTab: true,       // was chrome://newtab before navigation?
  openedFromTabId: 456,   // which tab was active when this opened?
}
```

### Habit Store (persisted)
```js
// Co-occurrence matrix: how often tab titles co-occur near each other
// Keyed by "anchor token" (significant words from title)
{
  "claude": { "godot": 12, "blender": 3, "github": 7 },
  "godot": { "claude": 12, "gdscript": 9 },
  // ...
}
```

---

## Logic Flow

### On Tab Navigate (`tabs.onUpdated`)
1. Check if this tab was previously a new tab (tracked at `tabs.onCreated`)
2. Get title of the navigated tab
3. Embed the title via Ollama
4. Query all other open tabs, embed their titles (cache these)
5. Compute similarity scores:
   - **Base score**: cosine similarity of embeddings
   - **Habit bonus**: boost score if co-occurrence matrix shows affinity
6. Find the best-matching tab
7. If score > threshold → `tabs.move()` to sit adjacent to it
8. Update co-occurrence matrix for this pairing

### On Tab Move (manual) (`tabs.onMoved`)
1. Detect if this was a *user-initiated* move (not our own programmatic move)
2. Record the co-occurrence between moved tab and its new neighbors
3. If we previously placed it elsewhere → penalize that pairing slightly

---

## Embedding Strategy

### Title Preprocessing
```js
function preprocessTitle(title) {
  // Strip low-signal suffixes: " - Google Search", " | Wikipedia", etc.
  // Lowercase, trim
  // If title is too short/generic (< 10 chars), fall back to hostname
}
```

### Caching
- Cache embeddings keyed by title string in `sessionStorage` (cleared on browser restart — that's fine, tabs don't persist either)
- Only re-embed if title changes

### Similarity
```js
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}
```

---

## Habit Layer

### Co-occurrence Update
When tab A ends up next to tab B (either by us or by the user):
```js
function recordCooccurrence(titleA, titleB, weight = 1) {
  const tokensA = extractTokens(titleA); // significant words
  const tokensB = extractTokens(titleB);
  for (const a of tokensA)
    for (const b of tokensB)
      matrix[a][b] = (matrix[a][b] ?? 0) + weight;
}
```

### Habit Score Contribution
```js
function habitBonus(titleA, titleB) {
  const tokensA = extractTokens(titleA);
  const tokensB = extractTokens(titleB);
  let score = 0;
  for (const a of tokensA)
    for (const b of tokensB)
      score += matrix[a]?.[b] ?? 0;
  return Math.tanh(score / 10); // normalize to [0, 1]
}
```

### Final Score
```js
const EMBEDDING_WEIGHT = 0.7;
const HABIT_WEIGHT = 0.3;
const score = EMBEDDING_WEIGHT * cosineSim + HABIT_WEIGHT * habitBonus;
```

---

## Edge Cases to Handle
- **Ollama not running**: fall back to pure domain matching, warn in popup
- **New tab with no title yet**: wait for `status === 'complete'` before acting
- **Pinned tabs**: skip — don't move pinned tabs, don't move next to them
- **Tab groups** (Chrome): optionally place within the matching group instead of just adjacent
- **Cold start**: no habits yet, pure embedding similarity works fine as default
- **User undoes move**: could detect rapid manual re-move as negative signal

---

## Manifest (Firefox MV2)
```json
{
  "manifest_version": 2,
  "name": "Smart Tab Organizer",
  "version": "0.1.0",
  "permissions": ["tabs", "storage"],
  "background": {
    "scripts": ["browser-polyfill.js", "storage.js", "habits.js", "embedding.js", "background.js"]
  },
  "browser_action": {
    "default_popup": "popup/popup.html"
  }
}
```

---

## Build Phases

### Phase 1 — Rule-based skeleton
- Track new tabs, detect navigation
- Domain-based grouping (no ML yet)
- Manual move detection + logging

### Phase 2 — Embedding layer
- Ollama integration
- Title preprocessing + cosine similarity
- Embedding cache

### Phase 3 — Habit layer
- Co-occurrence matrix
- Persist to storage
- Blend with embedding score

### Phase 4 — Polish
- Popup UI (toggle on/off, view habit stats, clear data)
- Threshold tuning
- Chrome compatibility pass

---

## Notes for Claude Code
- Start in Phase 1, get the tab tracking solid before adding ML
- `browser.tabs.onMoved` doesn't distinguish user vs programmatic moves — use a flag in background.js to suppress recording when *you* are the one moving
- Ollama must be running locally; the extension fetches `http://localhost:11434` — Firefox allows this by default in extensions, Chrome may need `host_permissions` in MV3
- Keep the habit matrix pruned (e.g. drop tokens with count < 2 older than 30 days) or it'll grow unbounded
