const SCORE_THRESHOLD = 0.35;

const pendingTabs = new Map();
const programmaticMoves = new Set(); // tabIds we're currently moving — more precise than a counter

const log  = (...a) => console.log( '[TabOrg]', ...a);
const warn = (...a) => console.warn('[TabOrg]', ...a);

function isNewTabUrl(url) {
  return !url || url === 'chrome://newtab/' || url === 'about:newtab' || url === 'about:home';
}

function isIgnoredTab(tab) {
  return tab.url?.startsWith('about:firefoxview') || tab.title === 'Firefox View';
}

async function init() {
  await loadMatrix();
  await pruneMatrix();
  browser.runtime.onSuspend?.addListener(() => saveMatrix());
  log('Initialized. Matrix loaded.');
}

init();

browser.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    browser.tabs.create({ url: browser.runtime.getURL('welcome.html') });
  }
});

browser.tabs.onCreated.addListener(tab => {
  const fromNewTab = isNewTabUrl(tab.url);
  pendingTabs.set(tab.id, {
    fromNewTab,
    openedFromTabId: tab.openerTabId ?? null,
  });
  log(`Tab created #${tab.id} fromNewTab=${fromNewTab} url=${tab.url}`);
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const title = changeInfo.title ?? tab.title;
  if (!title || title === 'New Tab' || title === 'New tab') return;
  if (!pendingTabs.has(tabId)) return;

  const pending = pendingTabs.get(tabId);

  if (!pending.fromNewTab) {
    log(`Tab #${tabId} updated but not from new tab — skipping`);
    pendingTabs.delete(tabId);
    return;
  }
  if (isIgnoredTab(tab)) {
    log(`Tab #${tabId} is Firefox View — skipping`);
    pendingTabs.delete(tabId);
    return;
  }
  if (tab.pinned) {
    log(`Tab #${tabId} is pinned — skipping`);
    pendingTabs.delete(tabId);
    return;
  }

  const enabled = await storageGet('enabled', true);
  if (!enabled) {
    log('Extension disabled — skipping reposition');
    pendingTabs.delete(tabId);
    return;
  }

  log(`Tab #${tabId} navigated to "${tab.title}" — starting reposition`);
  pendingTabs.delete(tabId);
  await repositionTab(tab);
});

browser.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  if (programmaticMoves.has(tabId)) {
    log(`Tab #${tabId} moved programmatically — skipping habit recording`);
    return;
  }

  log(`Tab #${tabId} moved by user: index ${moveInfo.fromIndex} → ${moveInfo.toIndex}`);

  const movedTab = await browser.tabs.get(tabId);
  if (movedTab.pinned) return;

  const allTabs = await browser.tabs.query({ windowId: moveInfo.windowId, pinned: false });
  const newIndex = moveInfo.toIndex;

  const leftNeighbor  = allTabs.find(t => t.index === newIndex - 1 && t.id !== tabId);
  const rightNeighbor = allTabs.find(t => t.index === newIndex + 1 && t.id !== tabId);

  const myClean = preprocessTitle(movedTab.title, movedTab.url);
  if (leftNeighbor) {
    log(`Recording co-occurrence: "${myClean}" ↔ "${preprocessTitle(leftNeighbor.title, leftNeighbor.url)}"`);
    recordCooccurrence(myClean, preprocessTitle(leftNeighbor.title, leftNeighbor.url));
  }
  if (rightNeighbor) {
    log(`Recording co-occurrence: "${myClean}" ↔ "${preprocessTitle(rightNeighbor.title, rightNeighbor.url)}"`);
    recordCooccurrence(myClean, preprocessTitle(rightNeighbor.title, rightNeighbor.url));
  }

  await saveMatrix();
});

browser.tabs.onRemoved.addListener(tabId => {
  if (pendingTabs.has(tabId)) {
    pendingTabs.delete(tabId);
    log(`Tab #${tabId} closed before navigation completed — cleaned up`);
  }
});

async function notifyMoved(movedTitle, neighborTitle, reason) {
  const hasOverlay = await browser.permissions.contains({ origins: ['<all_urls>'] });
  log(`notifyMoved: hasOverlay=${hasOverlay} neighbor="${neighborTitle}" reason="${reason}"`);
  if (hasOverlay) {
    notifyOverlay(movedTitle, neighborTitle, reason);
  } else {
    notifySystem(movedTitle, neighborTitle, reason);
  }
}

function notifyOverlay(movedTitle, neighborTitle, reason) {
  browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    if (!tabs[0]) { warn('notifyOverlay: no active tab'); return; }
    browser.tabs.sendMessage(tabs[0].id, {
      type: 'TAB_ORG_TOAST',
      neighborTitle,
      reason: reason || '',
    }).catch(e => {
      warn('sendMessage failed, falling back to system notification:', e.message);
      notifySystem(movedTitle, neighborTitle, reason);
    });
  });
}

function notifySystem(movedTitle, neighborTitle, reason) {
  const id = `tab-organizer-${Date.now()}`;
  browser.notifications.create(id, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('icon-48.png'),
    title: 'Tab Organizer',
    message: `Moved "${movedTitle}" next to "${neighborTitle}"${reason ? ` (${reason})` : ''}`,
  });
  setTimeout(() => browser.notifications.clear(id), 4000);
}

async function repositionTab(tab) {
  const allTabs = await browser.tabs.query({ windowId: tab.windowId, pinned: false });
  const otherTabs = allTabs.filter(t => t.id !== tab.id && !isIgnoredTab(t));

  if (otherTabs.length === 0) {
    log('No other tabs to compare — skipping');
    return;
  }

  log(`Scoring "${tab.title}" against ${otherTabs.length} candidate(s)…`);

  const scores = await Promise.all(
    otherTabs.map(async candidate => ({
      tab: candidate,
      score: await scoreTabPair(tab.title, tab.url, candidate.title, candidate.url),
    }))
  );

  scores.sort((a, b) => b.score - a.score);
  for (const { tab: c, score } of scores) {
    log(`  ${score.toFixed(3)}  "${c.title}"`);
  }

  let bestTab = null;
  let bestScore = SCORE_THRESHOLD;
  for (const { tab: candidate, score } of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestTab = candidate;
    }
  }

  if (!bestTab) {
    log(`No candidate above threshold (${SCORE_THRESHOLD}) — trying domain fallback`);
    await domainFallback(tab, otherTabs);
    return;
  }

  log(`Best match: "${bestTab.title}" (score ${bestScore.toFixed(3)})`);
  await moveAdjacentTo(tab, bestTab);

  const myClean = preprocessTitle(tab.title, tab.url);
  recordCooccurrence(myClean, preprocessTitle(bestTab.title, bestTab.url));
  await saveMatrix();

  notifyMoved(
    tab.title || myClean,
    bestTab.title || preprocessTitle(bestTab.title, bestTab.url),
    `score ${bestScore.toFixed(2)}`
  );
}

async function domainFallback(tab, otherTabs) {
  let myHost;
  try { myHost = new URL(tab.url).hostname; } catch { return; }

  const sameHost = otherTabs.find(t => {
    try { return new URL(t.url).hostname === myHost; } catch { return false; }
  });

  if (!sameHost) {
    log(`Domain fallback: no match for ${myHost}`);
    return;
  }

  log(`Domain fallback: moving next to "${sameHost.title}" (${myHost})`);
  await moveAdjacentTo(tab, sameHost);
  notifyMoved(tab.title || myHost, sameHost.title || myHost, 'domain match');
}

async function moveAdjacentTo(tab, targetTab) {
  const targetIndex = targetTab.index < tab.index
    ? targetTab.index + 1
    : targetTab.index;

  if (targetIndex === tab.index) {
    log(`Already adjacent to "${targetTab.title}" — no move needed`);
    return;
  }

  log(`Moving tab #${tab.id} from index ${tab.index} → ${targetIndex}`);
  programmaticMoves.add(tab.id);
  try {
    await browser.tabs.move(tab.id, { index: targetIndex });
  } finally {
    programmaticMoves.delete(tab.id);
  }
}
