// js/core/preview-guard.js
// Loaded on every page. On the live domain it does nothing.
// On the preview it:
//   1. adds <meta name="robots" content="noindex"> so search engines skip the copy
//   2. shows a small PREVIEW badge. With the sandbox switch on (env.js), it
//      also says whether this page's writes are guarded.
//
// A page is "guarded" when it loads js/core/firebase.js, which routes writes to
// _test collections. Legacy pages that set up Firebase themselves still write
// to live collections, and the badge turns red to say so.

import { IS_PREVIEW, SANDBOX_ACTIVE } from './env.js';

if (IS_PREVIEW) {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);

  const render = () => {
    const guarded = globalThis.__acesWriteGuard === true;
    let badge = document.getElementById('aces-preview-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'aces-preview-badge';
      badge.setAttribute('role', 'status');
      Object.assign(badge.style, {
        position: 'fixed', left: '8px', bottom: '8px', zIndex: '2147483647',
        padding: '4px 10px', borderRadius: '999px',
        font: '600 11px/1.4 system-ui, -apple-system, sans-serif', letterSpacing: '0.04em',
        color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', cursor: 'default', opacity: '0.9'
      });
      document.body.appendChild(badge);
    }
    if (!SANDBOX_ACTIVE) {
      badge.textContent = 'PREVIEW';
      badge.title = 'v2.0 preview: reads and writes live data';
      badge.style.background = '#2d5016';
      return;
    }
    badge.textContent = guarded ? 'PREVIEW \u00b7 test writes' : 'PREVIEW \u00b7 LIVE writes';
    badge.title = guarded
      ? 'v2.0 preview: writes from this page go to _test collections'
      : 'v2.0 preview: this page has not moved to core/firebase.js yet, so its writes hit live data';
    badge.style.background = guarded ? '#2d5016' : '#b91c1c';
  };

  // Wait for 'load' so every static module (core/firebase.js included) has run.
  if (document.readyState === 'complete') render();
  else window.addEventListener('load', render, { once: true });

  // core/firebase.js announces itself, which also covers dynamic imports after load.
  window.addEventListener('aces:write-guard', () => {
    if (document.body) render();
  });
}
