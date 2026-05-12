const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','was','has','had',
  'have','this','that','with','from','they','will','one','been','were','their',
  'said','what','when','who','which','how','its','also','than','then','into',
  'more','some','these','about','after','other','could','would','should','there',
  'each','just','like','only','over','such','very','even','most','both','much',
  'use','used','using','well','also','back','good','new','first','last','long',
  'get','her','him','his','our','out','see','way','may','now','any',
]);

let matrix = {};
let matrixDirty = false;

function extractTokens(title) {
  if (!title) return [];
  const words = title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
  const seen = new Set();
  const tokens = [];
  for (const w of words) {
    if (w.length >= 3 && !STOP_WORDS.has(w) && !seen.has(w)) {
      seen.add(w);
      tokens.push(w);
    }
  }
  return tokens;
}

async function loadMatrix() {
  matrix = await storageGet('habitMatrix', {});
  matrixDirty = false;
  const tokenCount = Object.keys(matrix).length;
  let entryCount = 0;
  for (const t of Object.keys(matrix)) entryCount += Object.keys(matrix[t]).length;
  console.log(`[TabOrg] Matrix loaded: ${tokenCount} tokens, ${entryCount} entries`);
}

async function saveMatrix() {
  if (!matrixDirty) return;
  await storageSet('habitMatrix', matrix);
  matrixDirty = false;
  console.log('[TabOrg] Matrix saved');
}

function recordCooccurrence(titleA, titleB, weight = 1) {
  const tokensA = extractTokens(titleA);
  const tokensB = extractTokens(titleB);
  if (tokensA.length === 0 || tokensB.length === 0) return;

  for (const a of tokensA) {
    if (!matrix[a]) matrix[a] = {};
    for (const b of tokensB) {
      if (a === b) continue;
      matrix[a][b] = (matrix[a][b] ?? 0) + weight;
    }
  }
  for (const b of tokensB) {
    if (!matrix[b]) matrix[b] = {};
    for (const a of tokensA) {
      if (a === b) continue;
      matrix[b][a] = (matrix[b][a] ?? 0) + weight;
    }
  }
  matrixDirty = true;
}

function habitBonus(titleA, titleB) {
  const tokensA = extractTokens(titleA);
  const tokensB = extractTokens(titleB);
  let score = 0;
  for (const a of tokensA)
    for (const b of tokensB)
      score += matrix[a]?.[b] ?? 0;
  return Math.tanh(score / 10);
}

async function pruneMatrix() {
  let pruned = false;
  for (const a of Object.keys(matrix)) {
    for (const b of Object.keys(matrix[a])) {
      if (matrix[a][b] < 2) {
        delete matrix[a][b];
        pruned = true;
      }
    }
    if (Object.keys(matrix[a]).length === 0) {
      delete matrix[a];
    }
  }
  if (pruned) {
    matrixDirty = true;
    await saveMatrix();
    console.log('[TabOrg] Matrix pruned');
  }
}
