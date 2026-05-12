document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle   = document.getElementById('enableToggle');
  const overlayToggle  = document.getElementById('overlayToggle');
  const backendSelect  = document.getElementById('backendSelect');
  const ollamaRow      = document.getElementById('ollamaRow');
  const ollamaDot      = document.getElementById('ollamaDot');
  const ollamaText     = document.getElementById('ollamaText');
  const localRow       = document.getElementById('localRow');
  const localDot       = document.getElementById('localDot');
  const localText      = document.getElementById('localText');
  const localHint      = document.getElementById('localHint');
  const tokenCount     = document.getElementById('tokenCount');
  const matrixSize     = document.getElementById('matrixSize');
  const clearBtn       = document.getElementById('clearBtn');

  // Enable toggle
  enableToggle.checked = await storageGet('enabled', true);
  enableToggle.addEventListener('change', e => storageSet('enabled', e.target.checked));

  // Overlay toggle
  overlayToggle.checked = await browser.permissions.contains({ origins: ['<all_urls>'] });
  overlayToggle.addEventListener('change', async e => {
    if (e.target.checked) {
      const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
      overlayToggle.checked = granted;
    } else {
      await browser.permissions.remove({ origins: ['<all_urls>'] });
    }
  });

  // Backend selector
  const currentBackend = await storageGet('embeddingBackend', 'ollama');
  backendSelect.value = currentBackend;
  await showBackendStatus(currentBackend);

  backendSelect.addEventListener('change', async e => {
    const backend = e.target.value;
    await storageSet('embeddingBackend', backend);

    if (backend === 'ollama') {
      const hasLocalhost = await browser.permissions.contains({ origins: ['http://localhost/*'] });
      if (!hasLocalhost) {
        const granted = await browser.permissions.request({ origins: ['http://localhost/*'] });
        if (!granted) { backendSelect.value = 'none'; await storageSet('embeddingBackend', 'none'); }
      }
    }

    if (backend !== 'ollama') {
      await browser.permissions.remove({ origins: ['http://localhost/*'] });
    }

    await showBackendStatus(backend);
  });

  async function showBackendStatus(backend) {
    ollamaRow.style.display = backend === 'ollama' ? '' : 'none';
    localRow.style.display  = backend === 'local'  ? '' : 'none';
    localHint.style.display = backend === 'local'  ? '' : 'none';

    if (backend === 'ollama') await refreshOllamaStatus();
    if (backend === 'local')  await refreshLocalStatus();
  }

  async function refreshOllamaStatus() {
    ollamaDot.className = 'dot';
    ollamaText.textContent = 'Checking…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const r = await fetch('http://localhost:11434', { signal: controller.signal });
      clearTimeout(timer);
      ollamaDot.classList.add(r.status < 500 ? 'online' : 'offline');
      ollamaText.textContent = r.status < 500 ? 'Online' : 'Error';
    } catch {
      clearTimeout(timer);
      ollamaDot.classList.add('offline');
      ollamaText.textContent = 'Offline';
    }
  }

  async function refreshLocalStatus() {
    const status = await storageGet('localModelStatus', 'not loaded');
    localDot.className = 'dot';
    if (status === 'ready') {
      localDot.classList.add('online');
      localText.textContent = 'Ready';
    } else if (status === 'loading') {
      localDot.classList.add('loading');
      localText.textContent = 'Downloading…';
    } else if (status === 'error') {
      localDot.classList.add('offline');
      localText.textContent = 'Error';
    } else {
      localDot.classList.add('disabled');
      localText.textContent = 'Not downloaded';
    }
  }

  // Habit stats
  async function refreshStats() {
    const matrix = await storageGet('habitMatrix', {});
    const tokens = Object.keys(matrix);
    let entries = 0;
    for (const t of tokens) entries += Object.keys(matrix[t]).length;
    tokenCount.textContent = tokens.length;
    matrixSize.textContent = entries;
  }

  await refreshStats();

  clearBtn.addEventListener('click', async () => {
    await storageSet('habitMatrix', {});
    await refreshStats();
  });
});
