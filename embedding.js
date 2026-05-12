const OLLAMA_URL = 'http://localhost:11434/api/embeddings';
const OLLAMA_MODEL = 'nomic-embed-text';
const EMBED_TIMEOUT_MS = 3000;

const NOISE_SUFFIX_RE = /\s*[-–|]\s*(Google Search|YouTube|MDN.*|Stack Overflow|Wikipedia.*|Mozilla Firefox|Google Chrome|Microsoft Edge|Safari)\s*$/i;

const embeddingCache = new Map();

function preprocessTitle(title, url) {
  let text = (title || '').trim();

  if (!text || text === 'New Tab' || text === 'New tab') {
    text = '';
  } else {
    text = text.replace(NOISE_SUFFIX_RE, '').trim();
  }

  if (text.length < 10) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return text || '';
    }
  }

  return text;
}

async function embed(text) {
  if (!text) return null;
  if (embeddingCache.has(text)) {
    console.log('[TabOrg] embed cache hit:', text);
    return embeddingCache.get(text);
  }

  console.log('[TabOrg] embed fetch:', text);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn('[TabOrg] embed HTTP error:', response.status, response.statusText);
      return null;
    }
    const data = await response.json();
    const vector = data.embedding;
    if (!Array.isArray(vector)) {
      console.warn('[TabOrg] embed unexpected response shape:', data);
      return null;
    }
    console.log('[TabOrg] embed ok:', text, `(${vector.length}d)`);
    embeddingCache.set(text, vector);
    return vector;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[TabOrg] embed timed out for:', text);
    } else {
      console.warn('[TabOrg] embed error:', e.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function scoreTabPair(titleA, urlA, titleB, urlB) {
  const cleanA = preprocessTitle(titleA, urlA);
  const cleanB = preprocessTitle(titleB, urlB);

  const [embA, embB] = await Promise.all([embed(cleanA), embed(cleanB)]);

  let cosineSim = 0;
  if (embA !== null && embB !== null) {
    cosineSim = Math.max(0, cosineSimilarity(embA, embB));
  } else {
    console.log('[TabOrg] scoreTabPair: missing embedding(s), cosine=0');
  }

  const bonus = habitBonus(cleanA, cleanB);
  const total = 0.7 * cosineSim + 0.3 * bonus;
  console.log(`[TabOrg] score "${cleanA}" vs "${cleanB}": cosine=${cosineSim.toFixed(3)} habit=${bonus.toFixed(3)} total=${total.toFixed(3)}`);
  return total;
}

async function ollamaAvailable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const r = await fetch('http://localhost:11434', { signal: controller.signal });
    return r.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
