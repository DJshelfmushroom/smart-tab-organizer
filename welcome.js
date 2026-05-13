const cards = document.querySelectorAll('.backend-card');
const radios = document.querySelectorAll('input[name=backend]');
const details = { ollama: 'detail-ollama', local: 'detail-local', none: 'detail-none' };
const cardIds  = { ollama: 'card-ollama',  local: 'card-local',  none: 'card-none'  };

radios.forEach(r => r.addEventListener('change', () => selectBackend(r.value)));

// Clicking the Ollama card is a user gesture even when it's already selected,
// so attach directly to the label element rather than the radio change event.
document.getElementById('card-ollama').addEventListener('click', ensureLocalhostAndPoll);

function selectBackend(val) {
  cards.forEach(c => c.classList.remove('selected'));
  document.getElementById(cardIds[val]).classList.add('selected');
  Object.entries(details).forEach(([k, id]) => {
    document.getElementById(id).classList.toggle('hidden', k !== val);
  });
}

async function checkOllama() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const r = await fetch('http://localhost:11434', { signal: controller.signal });
    clearTimeout(timer);
    return r.status < 500 ? 'ok' : 'err';
  } catch {
    clearTimeout(timer);
    return 'offline';
  }
}

let _ollamaInterval = null;

function startOllamaPolling() {
  if (_ollamaInterval) return;
  const el = document.getElementById('ollama-check-status');

  const poll = async () => {
    const state = await checkOllama();
    if (state === 'ok') {
      el.textContent = '✓ Ollama is running';
      el.className = 'status ok';
      clearInterval(_ollamaInterval);
      _ollamaInterval = null;
      return true;
    }
    el.textContent = state === 'err'
      ? '✗ Ollama responded with an error'
      : '✗ Ollama not detected — start it with the command above';
    el.className = 'status err';
    return false;
  };

  poll().then(done => {
    if (!done) _ollamaInterval = setInterval(poll, 3000);
  });
}

// Called when Ollama card is selected — the click provides the user gesture
// needed for permissions.request() in Chrome.
async function ensureLocalhostAndPoll() {
  const has = await browser.permissions.contains({ origins: ['http://localhost/*'] });
  if (!has) {
    const granted = await browser.permissions.request({ origins: ['http://localhost/*'] });
    if (!granted) return;
  }
  startOllamaPolling();
}

// On load: if permission is already granted (e.g. reinstall), poll immediately.
browser.permissions.contains({ origins: ['http://localhost/*'] }).then(has => {
  if (has) startOllamaPolling();
});

const overlayToggle = document.getElementById('overlayToggle');
browser.permissions.contains({ origins: ['<all_urls>'] }).then(has => {
  overlayToggle.checked = has;
});
overlayToggle.addEventListener('change', async e => {
  if (e.target.checked) {
    const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
    overlayToggle.checked = granted;
  } else {
    await browser.permissions.remove({ origins: ['<all_urls>'] });
  }
});

document.getElementById('doneBtn').addEventListener('click', async () => {
  const backend = document.querySelector('input[name=backend]:checked').value;
  await storageSet('embeddingBackend', backend);

  if (backend === 'ollama') {
    const granted = await browser.permissions.request({ origins: ['http://localhost/*'] });
    if (!granted) await storageSet('embeddingBackend', 'none');
  }

  window.close();
});
