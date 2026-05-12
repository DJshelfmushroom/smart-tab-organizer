const OLLAMA_URL = 'http://localhost:11434/api/embeddings';
const OLLAMA_MODEL = 'nomic-embed-text';
const EMBED_TIMEOUT_MS = 3000;

const NOISE_SUFFIX_RE = /\s*[-–|]\s*(Google Search|YouTube|MDN.*|Stack Overflow|Wikipedia.*|Mozilla Firefox|Google Chrome|Microsoft Edge|Safari)\s*$/i;

const embeddingCache = new Map();
let _localPipeline = null;
let _localPipelineLoading = null;

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

// --- Ollama backend ---

async function embedOllama(text) {
  console.log('[TabOrg] embed ollama:', text);
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
      console.warn('[TabOrg] Ollama HTTP error:', response.status, response.statusText);
      return null;
    }
    const data = await response.json();
    const vector = data.embedding;
    if (!Array.isArray(vector)) {
      console.warn('[TabOrg] Ollama unexpected response shape:', data);
      return null;
    }
    console.log('[TabOrg] Ollama embed ok:', text, `(${vector.length}d)`);
    return vector;
  } catch (e) {
    if (e.name === 'AbortError') console.warn('[TabOrg] Ollama embed timed out for:', text);
    else console.warn('[TabOrg] Ollama embed error:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- Local (transformers.js) backend ---

async function loadLocalPipeline() {
  if (_localPipeline) return _localPipeline;
  if (_localPipelineLoading) return _localPipelineLoading;

  _localPipelineLoading = (async () => {
    console.log('[TabOrg] Loading local pipeline…');

    const { pipeline, env } = window.TransformersJS;
    env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('lib/');
    env.backends.onnx.wasm.numThreads = 1;
    env.allowRemoteModels = true;

    console.log('[TabOrg] Downloading/loading Xenova/all-MiniLM-L6-v2 (first run may take a moment)…');
    await storageSet('localModelStatus', 'loading');

    _localPipeline = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }
    );

    await storageSet('localModelStatus', 'ready');
    console.log('[TabOrg] Local pipeline ready');
    return _localPipeline;
  })();

  try {
    return await _localPipelineLoading;
  } catch (e) {
    _localPipelineLoading = null;
    await storageSet('localModelStatus', 'error');
    throw e;
  }
}

async function embedLocal(text) {
  try {
    const pipe = await loadLocalPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    console.log('[TabOrg] Local embed ok:', text, `(${output.data.length}d)`);
    return Array.from(output.data);
  } catch (e) {
    console.warn('[TabOrg] Local embed error:', e.message);
    return null;
  }
}

// --- Unified embed ---

async function embed(text) {
  if (!text) return null;
  if (embeddingCache.has(text)) {
    console.log('[TabOrg] embed cache hit:', text);
    return embeddingCache.get(text);
  }

  const backend = await storageGet('embeddingBackend', 'ollama');
  let vector = null;

  if (backend === 'local') {
    vector = await embedLocal(text);
  } else if (backend === 'ollama') {
    vector = await embedOllama(text);
  }

  if (vector) embeddingCache.set(text, vector);
  return vector;
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
