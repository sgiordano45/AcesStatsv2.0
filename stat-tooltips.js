/**
 * stat-tooltips.js
 * Centralized stat tooltip system for AcesStats.
 * Auto-detects stat headers by text pattern on any page.
 * Works with both static HTML and dynamically rendered content.
 */
(function () {

  // ── Stat Definitions ────────────────────────────────────────────────────────

  const STATS = {
    ab: {
      name: 'At Bats (AB)',
      description: 'A plate appearance that results in a hit, out, or strikeout.',
      note: 'Walks and sacrifice flies do not count as at bats.'
    },
    ba: {
      name: 'Batting Average (BA)',
      description: 'Measures how often a batter gets a hit per at bat.',
      note: 'Formula: Hits ÷ At Bats'
    },
    obp: {
      name: 'On-Base Percentage (OBP)',
      description: 'Measures how often a batter reaches base per plate appearance.',
      note: 'Formula: (Hits + Walks) ÷ (At Bats + Walks)'
    },
    era: {
      name: 'ERA (Earned Run Average)',
      description: 'Estimates runs a pitcher allows per 7-inning game.',
      note: 'Formula: (Runs Allowed ÷ Innings Pitched) × 7'
    },
    acesbpi: {
      name: 'AcesBPI',
      description: 'Aces Baseball Performance Index — a custom rating centered at 50 (league average). Above 50 is above average, below 50 is below average.',
      note: 'Weighted: 50% BA · 30% Runs/PA · 10% OBP · 10% Games played'
    }
  };

  // ── Text Pattern Matching ────────────────────────────────────────────────────
  // Strips emojis/whitespace from element text, then tests against known patterns.

  const PATTERNS = [
    { key: 'ab',      tests: [/^AB$/i, /^At Bats$/i] },
    { key: 'ba',      tests: [/^BA$/i, /^AVG$/i, /batting average/i, /batting avg/i] },
    { key: 'obp',     tests: [/^OBP$/i, /on-base percentage/i, /on-base %/i] },
    { key: 'era',     tests: [/^ERA$/i, /best era/i] },
    { key: 'acesbpi', tests: [/acesbpi/i] }
  ];

  function cleanText(el) {
    // Strip emojis, non-ASCII decorations, extra whitespace
    return (el.textContent || '')
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[^\w\s\-()./%]/g, '')
      .trim();
  }

  function detectStat(el) {
    const text = cleanText(el);
    for (const { key, tests } of PATTERNS) {
      if (tests.some(t => t.test(text))) return key;
    }
    return null;
  }

  // ── CSS ──────────────────────────────────────────────────────────────────────

  const CSS = `
    .stat-tip-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      margin-left: 5px;
      border-radius: 50%;
      background: var(--primary-color, #2d5016);
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      font-style: normal;
      line-height: 1;
      cursor: pointer;
      vertical-align: middle;
      flex-shrink: 0;
      user-select: none;
      opacity: 0.75;
      transition: opacity 0.15s;
    }
    .stat-tip-icon:hover {
      opacity: 1;
    }
    .stat-tip-bubble {
      position: fixed;
      z-index: 99999;
      max-width: 260px;
      background: #1a1a2e;
      color: #f0f0f0;
      border-radius: 8px;
      padding: 10px 13px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      font-family: Inter, system-ui, sans-serif;
      font-size: 12.5px;
      line-height: 1.5;
      pointer-events: none;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.15s, transform 0.15s;
    }
    .stat-tip-bubble.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .stat-tip-bubble strong {
      display: block;
      font-size: 13px;
      margin-bottom: 4px;
      color: #ffd700;
    }
    .stat-tip-bubble .tip-desc {
      margin: 0 0 5px;
    }
    .stat-tip-bubble .tip-note {
      color: #a0c4a0;
      font-size: 11.5px;
      border-top: 1px solid rgba(255,255,255,0.1);
      padding-top: 5px;
      margin: 0;
    }
    [data-theme="dark"] .stat-tip-icon {
      background: var(--accent-color, #ffd700);
      color: #1a1a1a;
    }
  `;

  // ── Tooltip Element ──────────────────────────────────────────────────────────

  let bubble = null;
  let activeIcon = null;

  function createBubble() {
    bubble = document.createElement('div');
    bubble.className = 'stat-tip-bubble';
    document.body.appendChild(bubble);
  }

  function showBubble(icon, statKey) {
    if (!bubble) createBubble();
    const stat = STATS[statKey];
    if (!stat) return;

    bubble.innerHTML = `
      <strong>${stat.name}</strong>
      <p class="tip-desc">${stat.description}</p>
      <p class="tip-note">${stat.note}</p>
    `;

    // Position: prefer above the icon, fall back to below
    bubble.classList.remove('visible');
    bubble.style.left = '-9999px';
    bubble.style.top = '-9999px';

    // Allow a frame for the browser to size the bubble before positioning
    requestAnimationFrame(() => {
      const iconRect = icon.getBoundingClientRect();
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;

      let top = iconRect.top - bh - 8;
      if (top < 8) top = iconRect.bottom + 8; // flip below

      let left = iconRect.left + (iconRect.width / 2) - (bw / 2);
      if (left < 8) left = 8;
      if (left + bw > window.innerWidth - 8) left = window.innerWidth - bw - 8;

      bubble.style.left = left + 'px';
      bubble.style.top = top + 'px';
      bubble.classList.add('visible');
    });

    activeIcon = icon;
  }

  function hideBubble() {
    if (bubble) bubble.classList.remove('visible');
    activeIcon = null;
  }

  // ── Attach Tooltip to Element ────────────────────────────────────────────────

  function attachTooltip(el, statKey) {
    if (el.dataset.statTipAttached) return;
    el.dataset.statTipAttached = '1';

    const icon = document.createElement('i');
    icon.className = 'stat-tip-icon';
    icon.setAttribute('aria-label', `Info about ${STATS[statKey]?.name}`);
    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    icon.textContent = 'i';
    icon.dataset.statKey = statKey;

    // Desktop: hover
    icon.addEventListener('mouseenter', () => showBubble(icon, statKey));
    icon.addEventListener('mouseleave', hideBubble);

    // Mobile / keyboard: tap/click toggles
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeIcon === icon && bubble?.classList.contains('visible')) {
        hideBubble();
      } else {
        showBubble(icon, statKey);
      }
    });

    el.appendChild(icon);
  }

  // ── DOM Scanning ─────────────────────────────────────────────────────────────

  const SELECTORS = 'th, h4, .stat-label';

  function scanAndAttach(root) {
    root.querySelectorAll(SELECTORS).forEach(el => {
      if (el.dataset.statTipAttached) return;
      const key = detectStat(el);
      if (key) attachTooltip(el, key);
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Initial scan
    scanAndAttach(document);

    // Watch for dynamically added content (leaderboards, etc.)
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            scanAndAttach(node);
            // Also check the node itself if it matches
            if (node.matches && node.matches(SELECTORS) && !node.dataset.statTipAttached) {
              const key = detectStat(node);
              if (key) attachTooltip(node, key);
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Close on outside click or scroll
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.stat-tip-icon')) hideBubble();
    });
    document.addEventListener('scroll', hideBubble, { passive: true, capture: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
