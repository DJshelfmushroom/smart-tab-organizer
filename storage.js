const _usesPromises = (() => {
  const r = browser.storage.local.get({});
  return r != null && typeof r.then === 'function';
})();

function storageGet(key, defaultValue) {
  if (_usesPromises) {
    return browser.storage.local.get({ [key]: defaultValue })
      .then(items => items[key] ?? defaultValue);
  }
  return new Promise((resolve, reject) => {
    browser.storage.local.get({ [key]: defaultValue }, items => {
      if (browser.runtime.lastError) reject(browser.runtime.lastError);
      else resolve(items[key] ?? defaultValue);
    });
  });
}

function storageSet(key, value) {
  if (_usesPromises) {
    return browser.storage.local.set({ [key]: value });
  }
  return new Promise((resolve, reject) => {
    browser.storage.local.set({ [key]: value }, () => {
      if (browser.runtime.lastError) reject(browser.runtime.lastError);
      else resolve();
    });
  });
}
