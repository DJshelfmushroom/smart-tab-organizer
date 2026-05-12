const _browser = typeof browser !== 'undefined' ? browser : chrome;

_browser.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'TAB_ORG_TOAST') return;

  const prev = document.getElementById('__tab-org-toast__');
  if (prev) prev.remove();

  const host = document.createElement('div');
  host.id = '__tab-org-toast__';
  host.style.cssText = 'all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .toast {
      font: 13px/1.5 system-ui, -apple-system, sans-serif;
      background: rgba(24,24,24,0.93);
      color: #f0f0f0;
      padding: 10px 14px;
      border-radius: 10px;
      max-width: 300px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 180ms ease, transform 180ms ease;
      backdrop-filter: blur(6px);
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .tag {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .07em;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 3px;
    }
    .reason { font-size: 11px; color: #aaa; margin-top: 3px; }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';

  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = 'Tab Organizer';

  const body = document.createElement('div');
  body.textContent = 'Moved next to: ' + msg.neighborTitle;

  toast.appendChild(tag);
  toast.appendChild(body);

  if (msg.reason) {
    const reasonEl = document.createElement('div');
    reasonEl.className = 'reason';
    reasonEl.textContent = msg.reason;
    toast.appendChild(reasonEl);
  }

  shadow.appendChild(style);
  shadow.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

  setTimeout(() => {
    toast.style.transition = 'opacity 250ms ease, transform 250ms ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => host.remove(), 260);
  }, 3500);
});
