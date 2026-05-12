document.addEventListener('DOMContentLoaded', async () => {
  const toggle    = document.getElementById('enableToggle');
  const dot       = document.getElementById('ollamaDot');
  const ollamaText = document.getElementById('ollamaText');
  const tokenCount = document.getElementById('tokenCount');
  const matrixSize = document.getElementById('matrixSize');
  const clearBtn  = document.getElementById('clearBtn');

  const enabled = await storageGet('enabled', true);
  toggle.checked = enabled;
  toggle.addEventListener('change', e => storageSet('enabled', e.target.checked));

  const overlayToggle = document.getElementById('overlayToggle');
  overlayToggle.checked = await browser.permissions.contains({ origins: ['<all_urls>'] });
  overlayToggle.addEventListener('change', async e => {
    if (e.target.checked) {
      const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
      overlayToggle.checked = granted;
    } else {
      await browser.permissions.remove({ origins: ['<all_urls>'] });
    }
  });

  (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const r = await fetch('http://localhost:11434', { signal: controller.signal });
      clearTimeout(timer);
      if (r.status < 500) {
        dot.classList.add('online');
        ollamaText.textContent = 'Online';
      } else {
        dot.classList.add('offline');
        ollamaText.textContent = 'Error';
      }
    } catch {
      clearTimeout(timer);
      dot.classList.add('offline');
      ollamaText.textContent = 'Offline';
    }
  })();

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
