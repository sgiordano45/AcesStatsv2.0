// js/core/env.js
// Where is this page running? One source of truth for the preview/live split.
//
// Fail-safe: only the real domain counts as live. The GitHub Pages preview,
// localhost and any other host are treated as preview, so a page opened
// anywhere unexpected can never write to live collections through core/.

export const LIVE_HOSTS = ['acessoftballreference.com', 'www.acessoftballreference.com'];

export const IS_LIVE = LIVE_HOSTS.includes(globalThis.location?.hostname);
export const IS_PREVIEW = !IS_LIVE;

// Sandbox switch. OFF: the preview reads and writes live data, same as the
// live site (writes show up on both). ON: core/firebase.js sends preview
// writes to *_test collections (needs the *_test rules block deployed first).
// Has no effect on the live domain either way.
export const ROUTE_PREVIEW_WRITES = false;

export const SANDBOX_ACTIVE = IS_PREVIEW && ROUTE_PREVIEW_WRITES;

// Suffix for preview write collections (same pattern as aggregatedPlayerStats_test)
export const TEST_SUFFIX = '_test';
