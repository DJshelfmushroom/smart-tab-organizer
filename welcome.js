const cards = document.querySelectorAll('.backend-card');
const radios = document.querySelectorAll('input[name=backend]');
const details = { ollama: 'detail-ollama', local: 'detail-local', none: 'detail-none' };
const cardIds  = { ollama: 'card-ollama',  local: 'card-local',  none: 'card-none'  };

radios.forEach(r => r.addEventListener('change', () => selectBackend(r.value)));

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

(async () => {
  const el = document.getElementById('ollama-check-status');
  const poll = async () => {
    const state = await checkOllama();
    if (state === 'ok') {
      el.textContent = '✓ Ollama is running';
      el.className = 'status ok';
      return true;
    } else if (state === 'err') {
      el.textContent = '✗ Ollama responded with an error';
      el.className = 'status err';
      return true;
    } else {
      el.textContent = '✗ Ollama not detected — start it with the command above';
      el.className = 'status err';
      return false;
    }
  };

  if (!await poll()) {
    const interval = setInterval(async () => {
      if (await poll()) clearInterval(interval);
    }, 3000);
  }
})();

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
