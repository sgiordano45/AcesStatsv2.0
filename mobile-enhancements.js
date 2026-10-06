/**
 * Mobile Enhancements JavaScript
 * Shared functionality for mobile-responsive improvements
 * @version 1.3.1 - Added foreground push notification handler
 */

(function() {
  'use strict';

  // ========================================
  // MOBILE NAVIGATION
  // NOTE: Main toggle handled by nav-component.js
  // This file adds enhancements
  // ========================================

  /**
   * Close mobile menu when clicking outside
   */
  function setupMobileMenuClickOutside() {
    document.addEventListener('click', function(event) {
      const menu = document.getElementById('mobileNavMenu');
      const hamburger = document.getElementById('mobileMenuBtn');
      
      if (!menu || !hamburger) return;
      
      // Check if click is outside menu and hamburger button
      if (menu.classList.contains('open') && 
          !menu.contains(event.target) && 
          !hamburger.contains(event.target)) {
        menu.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }

  /**
   * Close mobile menu when navigation link is clicked
   */
  function setupMobileMenuAutoClose() {
    // Use event delegation since menu items are dynamically added
    document.addEventListener('click', function(event) {
      if (event.target.classList.contains('mobile-nav-item')) {
        const menu = document.getElementById('mobileNavMenu');
        if (menu && menu.classList.contains('open')) {
          // Small delay to allow navigation to start
          setTimeout(() => {
            menu.classList.remove('open');
            document.body.style.overflow = '';
          }, 200);
        }
      }
    });
  }

  // ========================================
  // BACK TO TOP BUTTON
  // ========================================

  /**
   * Create and manage Back to Top button
   */
  function setupBackToTop() {
    // Only on mobile
    if (window.innerWidth > 768) return;

    // Create button if it doesn't exist
    let btn = document.getElementById('backToTopBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'backToTopBtn';
      btn.className = 'back-to-top-btn';
      btn.setAttribute('aria-label', 'Back to top');
      btn.innerHTML = '↑ Top';
      document.body.appendChild(btn);
    }

    // Show/hide based on scroll position
    const toggleVisibility = () => {
      if (window.scrollY > 400) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    };

    // Scroll to top when clicked
    btn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    });

    // Listen for scroll with throttle
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          toggleVisibility();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    // Initial check
    toggleVisibility();
    console.log('✅ Back to Top button initialized');
  }

  // ========================================
  // PWA INSTALL BANNER
  // ========================================

  let deferredPrompt = null;
  const PWA_DISMISS_KEY = 'pwa_install_dismissed';
  const PWA_DISMISS_DAYS = 7;

  /**
   * Check if PWA install banner should be shown
   */
  function shouldShowPWABanner() {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('📱 App already installed (standalone mode)');
      return false;
    }

    // Check iOS standalone
    if (window.navigator.standalone === true) {
      console.log('📱 App already installed (iOS standalone)');
      return false;
    }

    // Check dismiss timestamp
    const dismissedAt = localStorage.getItem(PWA_DISMISS_KEY);
    if (dismissedAt) {
      const dismissedDate = new Date(parseInt(dismissedAt, 10));
      const now = new Date();
      const daysSinceDismiss = (now - dismissedDate) / (1000 * 60 * 60 * 24);
      
      if (daysSinceDismiss < PWA_DISMISS_DAYS) {
        console.log(`📱 PWA banner dismissed ${Math.floor(daysSinceDismiss)} days ago, waiting ${PWA_DISMISS_DAYS} days`);
        return false;
      } else {
        // Clear old dismissal
        localStorage.removeItem(PWA_DISMISS_KEY);
      }
    }

    return true;
  }

  /**
   * Detect if user is on iOS Safari
   */
  function isIOSSafari() {
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua);
    const webkit = /WebKit/.test(ua);
    const notChrome = !/CriOS/.test(ua);
    const notFirefox = !/FxiOS/.test(ua);
    return iOS && webkit && notChrome && notFirefox;
  }

  /**
   * Create PWA install banner
   */
  function createPWABanner() {
    // Only on mobile
    if (window.innerWidth > 768) return;

    if (!shouldShowPWABanner()) return;

    // Create banner element
    const banner = document.createElement('div');
    banner.id = 'pwaInstallBanner';
    banner.className = 'pwa-install-banner';
    
    const isIOS = isIOSSafari();
    
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <div class="pwa-banner-icon">⚾</div>
        <div class="pwa-banner-text">
          <strong>Install Mountainside Aces</strong>
          <span>${isIOS ? 'Add to your home screen for quick access' : 'Get the app for a better experience'}</span>
        </div>
        <div class="pwa-banner-actions">
          <button class="pwa-install-btn" id="pwaInstallBtn">
            ${isIOS ? 'How to Install' : 'Install'}
          </button>
          <button class="pwa-dismiss-btn" id="pwaDismissBtn" aria-label="Dismiss">×</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Show banner with animation
    requestAnimationFrame(() => {
      banner.classList.add('visible');
    });

    // Handle install button
    const installBtn = document.getElementById('pwaInstallBtn');
    installBtn.addEventListener('click', () => {
      if (isIOS) {
        showIOSInstallInstructions();
      } else if (deferredPrompt) {
        // Chrome/Edge install prompt
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('✅ User accepted PWA install');
            hidePWABanner();
          } else {
            console.log('❌ User dismissed PWA install');
          }
          deferredPrompt = null;
        });
      } else {
        // Fallback: show manual instructions
        showManualInstallInstructions();
      }
    });

    // Handle dismiss button
    const dismissBtn = document.getElementById('pwaDismissBtn');
    dismissBtn.addEventListener('click', () => {
      dismissPWABanner();
    });

    console.log('✅ PWA install banner created');
  }

  /**
   * Show iOS-specific install instructions
   */
  function showIOSInstallInstructions() {
    const modal = document.createElement('div');
    modal.id = 'pwaInstallModal';
    modal.className = 'pwa-install-modal';
    modal.innerHTML = `
      <div class="pwa-modal-content">
        <button class="pwa-modal-close" id="pwaModalClose">×</button>
        <h3>📱 Install on iPhone/iPad</h3>
        <ol class="pwa-install-steps">
          <li>Tap the <strong>Share</strong> button <span class="ios-share-icon">⬆️</span> at the bottom of Safari</li>
          <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          <li>Tap <strong>"Add"</strong> in the top right</li>
        </ol>
        <p class="pwa-install-note">The app will appear on your home screen like a regular app!</p>
        <button class="pwa-modal-btn" id="pwaModalDone">Got it!</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Show with animation
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });

    // Close handlers
    const closeModal = () => {
      modal.classList.remove('visible');
      setTimeout(() => modal.remove(), 300);
    };

    document.getElementById('pwaModalClose').addEventListener('click', closeModal);
    document.getElementById('pwaModalDone').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  /**
   * Show manual install instructions for other browsers
   */
  function showManualInstallInstructions() {
    const modal = document.createElement('div');
    modal.id = 'pwaInstallModal';
    modal.className = 'pwa-install-modal';
    modal.innerHTML = `
      <div class="pwa-modal-content">
        <button class="pwa-modal-close" id="pwaModalClose">×</button>
        <h3>📱 Install the App</h3>
        <p>To install Mountainside Aces:</p>
        <ol class="pwa-install-steps">
          <li>Open the <strong>browser menu</strong> (⋮ or ⋯)</li>
          <li>Look for <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></li>
          <li>Follow the prompts to install</li>
        </ol>
        <button class="pwa-modal-btn" id="pwaModalDone">Got it!</button>
      </div>
    `;
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });

    const closeModal = () => {
      modal.classList.remove('visible');
      setTimeout(() => modal.remove(), 300);
    };

    document.getElementById('pwaModalClose').addEventListener('click', closeModal);
    document.getElementById('pwaModalDone').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  /**
   * Hide PWA banner (after install)
   */
  function hidePWABanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) {
      banner.classList.remove('visible');
      setTimeout(() => banner.remove(), 300);
    }
  }

  /**
   * Dismiss PWA banner (user clicked X)
   */
  function dismissPWABanner() {
    localStorage.setItem(PWA_DISMISS_KEY, Date.now().toString());
    hidePWABanner();
    console.log(`📱 PWA banner dismissed for ${PWA_DISMISS_DAYS} days`);
  }

  /**
   * Setup PWA install prompt capture
   */
  function setupPWAInstall() {
    // Capture the beforeinstallprompt event (Chrome/Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      console.log('✅ PWA install prompt captured');
      
      // Show banner if conditions are met
      if (shouldShowPWABanner()) {
        createPWABanner();
      }
    });

    // For iOS or if beforeinstallprompt doesn't fire, show banner after delay
    setTimeout(() => {
      if (!deferredPrompt && shouldShowPWABanner() && window.innerWidth <= 768) {
        createPWABanner();
      }
    }, 3000); // 3 second delay to not interrupt initial page load

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA was installed');
      hidePWABanner();
      deferredPrompt = null;
    });
  }

  /**
   * Public function to trigger install (for nav menu link)
   */
  window.triggerPWAInstall = function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('✅ User accepted PWA install from menu');
        }
        deferredPrompt = null;
      });
    } else if (isIOSSafari()) {
      showIOSInstallInstructions();
    } else {
      showManualInstallInstructions();
    }
  };

  /**
   * Check if app is installed (for hiding menu option)
   */
  window.isPWAInstalled = function() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
  };

  // ========================================
  // KEYBOARD OVERLAP FIX
  // ========================================

  /**
   * Fix input fields being hidden by mobile keyboard
   */
  function setupKeyboardOverlapFix() {
    // Only on mobile
    if (window.innerWidth > 768) return;

    // Track focused input
    let focusedInput = null;

    // Listen for focus on inputs and textareas
    document.addEventListener('focusin', (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        focusedInput = target;
        
        // Delay to allow keyboard to appear
        setTimeout(() => {
          scrollInputIntoView(target);
        }, 300);
      }
    });

    // Clear on blur
    document.addEventListener('focusout', () => {
      focusedInput = null;
    });

    // Handle resize (keyboard appearing/disappearing)
    let lastHeight = window.innerHeight;
    window.addEventListener('resize', () => {
      const currentHeight = window.innerHeight;
      
      // Keyboard appeared (height decreased significantly)
      if (currentHeight < lastHeight - 100 && focusedInput) {
        setTimeout(() => {
          scrollInputIntoView(focusedInput);
        }, 100);
      }
      
      lastHeight = currentHeight;
    });

    console.log('✅ Keyboard overlap fix initialized');
  }

  /**
   * Scroll input element into visible area
   */
  function scrollInputIntoView(element) {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // Check if element is in the bottom half of the screen (likely covered by keyboard)
    if (rect.bottom > viewportHeight * 0.5) {
      // Calculate scroll needed to put element at 1/3 from top
      const targetY = viewportHeight * 0.33;
      const scrollNeeded = rect.top - targetY;
      
      window.scrollBy({
        top: scrollNeeded,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      });
    }

    // Also use native scrollIntoView as backup
    if (element.scrollIntoView) {
      element.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center'
      });
    }
  }

  // ========================================
  // TABLE ENHANCEMENTS
  // ========================================

  /**
   * Add touch scroll indicators to tables
   */
  function addTableScrollIndicators() {
    const tables = document.querySelectorAll('.standings-table, .schedule-table, .bracket-table, table');
    
    tables.forEach(table => {
      // Check if table is wider than its container
      const tableWidth = table.scrollWidth;
      const containerWidth = table.parentElement.clientWidth;
      
      if (tableWidth > containerWidth && window.innerWidth <= 768) {
        // Add visual indicator that table is scrollable
        table.style.cursor = 'grab';
        
        // Add scroll shadow effect
        const wrapper = table.parentElement;
        wrapper.addEventListener('scroll', function() {
          const scrollLeft = wrapper.scrollLeft;
          const scrollWidth = wrapper.scrollWidth;
          const clientWidth = wrapper.clientWidth;
          
          // Add/remove shadow classes based on scroll position
          if (scrollLeft > 0) {
            wrapper.classList.add('scroll-shadow-left');
          } else {
            wrapper.classList.remove('scroll-shadow-left');
          }
          
          if (scrollLeft + clientWidth < scrollWidth - 5) {
            wrapper.classList.add('scroll-shadow-right');
          } else {
            wrapper.classList.remove('scroll-shadow-right');
          }
        });
      }
    });
  }

  /**
   * Enable smooth touch scrolling for tables
   */
  function enableTouchScrolling() {
    const tables = document.querySelectorAll('.standings-table, .schedule-table, .bracket-table, table');
    
    tables.forEach(table => {
      let isDown = false;
      let startX;
      let scrollLeft;
      const wrapper = table.parentElement;

      table.addEventListener('mousedown', (e) => {
        if (window.innerWidth > 768) return; // Only on mobile
        isDown = true;
        table.style.cursor = 'grabbing';
        startX = e.pageX - wrapper.offsetLeft;
        scrollLeft = wrapper.scrollLeft;
      });

      table.addEventListener('mouseleave', () => {
        isDown = false;
        table.style.cursor = 'grab';
      });

      table.addEventListener('mouseup', () => {
        isDown = false;
        table.style.cursor = 'grab';
      });

      table.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - wrapper.offsetLeft;
        const walk = (x - startX) * 2;
        wrapper.scrollLeft = scrollLeft - walk;
      });
    });
  }

  // ========================================
  // SEARCH ENHANCEMENTS
  // ========================================

  /**
   * Setup mobile search with clear button
   */
  function setupMobileSearch() {
    const searchInput = document.getElementById('globalSearch');
    const clearButton = document.getElementById('clearSearch');
    
    if (searchInput && clearButton) {
      // Show/hide clear button based on input
      searchInput.addEventListener('input', function() {
        if (this.value.length > 0) {
          clearButton.style.display = 'block';
        } else {
          clearButton.style.display = 'none';
        }
      });
      
      // Clear search when button clicked
      clearButton.addEventListener('click', function() {
        searchInput.value = '';
        clearButton.style.display = 'none';
        searchInput.focus();
        
        // Trigger input event to update search results
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
      });
    }
  }

  // ========================================
  // VIEWPORT & ORIENTATION DETECTION
  // ========================================

  /**
   * Detect orientation changes and adjust layout
   */
  function handleOrientationChange() {
    const handleChange = () => {
      // Re-initialize table scrolling on orientation change
      setTimeout(() => {
        addTableScrollIndicators();
      }, 300);
    };

    window.addEventListener('orientationchange', handleChange);
    window.addEventListener('resize', handleChange);
  }

  /**
   * Check if device is in landscape mode
   */
  function isLandscape() {
    return window.innerWidth > window.innerHeight;
  }

  // ========================================
  // PERFORMANCE OPTIMIZATIONS
  // ========================================

  /**
   * Debounce function for performance
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Lazy load images on mobile
   */
  function setupLazyLoading() {
    if ('IntersectionObserver' in window && window.innerWidth <= 768) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              imageObserver.unobserve(img);
            }
          }
        });
      });

      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  // ========================================
  // ACCESSIBILITY
  // ========================================

  /**
   * Add keyboard navigation support
   */
  function setupKeyboardNavigation() {
    // Close mobile menu with Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const menu = document.getElementById('mobileNavMenu');
        if (menu && menu.classList.contains('open')) {
          menu.classList.remove('open');
          document.body.style.overflow = '';
          document.getElementById('mobileMenuBtn')?.focus();
        }
        
        // Also close PWA modal
        const modal = document.getElementById('pwaInstallModal');
        if (modal) {
          modal.classList.remove('visible');
          setTimeout(() => modal.remove(), 300);
        }
      }
    });
  }

  /**
   * Announce screen reader messages
   */
  function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.classList.add('sr-only');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  // ========================================
  // TOUCH GESTURES
  // ========================================

  /**
   * Add swipe gestures for navigation
   */
  function setupSwipeGestures() {
    if (window.innerWidth > 768) return; // Only on mobile

    let touchStartX = 0;
    let touchEndX = 0;
    const swipeThreshold = 80;

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const menu = document.getElementById('mobileNavMenu');
      if (!menu) return;

      // Swipe right to open menu (if closed)
      if (touchEndX > touchStartX + swipeThreshold && !menu.classList.contains('open')) {
        if (touchStartX < 50) { // Only if swipe started from left edge
          const btn = document.getElementById('mobileMenuBtn');
          if (btn) btn.click();
        }
      }
      
      // Swipe left to close menu (if open)
      if (touchStartX > touchEndX + swipeThreshold && menu.classList.contains('open')) {
        menu.classList.remove('open');
        document.body.style.overflow = '';
      }
    }
  }

  // ========================================
  // SHARE FUNCTIONALITY
  // ========================================

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - 'success', 'error', or 'info'
   * @param {number} duration - Duration in ms (default 3000)
   */
  function showToast(message, type = 'success', duration = 3000) {
    // Remove any existing toast
    const existingToast = document.querySelector('.share-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `share-toast share-toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span class="toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    // Auto-remove
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Check if Web Share API is available
   */
  function canUseWebShare() {
    return navigator.share !== undefined;
  }

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} Success status
   */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      return false;
    }
  }

  /**
   * Share content using Web Share API or fallback to clipboard
   * @param {Object} options - Share options
   * @param {string} options.url - URL to share (defaults to current page)
   * @param {string} options.title - Title for share (defaults to document title)
   * @param {string} options.text - Optional description text
   * @returns {Promise<boolean>} Success status
   */
  async function sharePage(options = {}) {
    const url = options.url || window.location.href;
    const title = options.title || document.title;
    const text = options.text || '';

    // Try Web Share API first (mobile native sharing)
    if (canUseWebShare()) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: url
        });
        // Don't show toast on successful native share (user sees native UI)
        return true;
      } catch (err) {
        // User cancelled or error - fall through to clipboard
        if (err.name === 'AbortError') {
          return false; // User cancelled, no message needed
        }
        console.log('Web Share failed, falling back to clipboard');
      }
    }

    // Fallback: Copy to clipboard
    const success = await copyToClipboard(url);
    if (success) {
      showToast('Link copied to clipboard!', 'success');
    } else {
      showToast('Failed to copy link', 'error');
    }
    return success;
  }

  /**
   * Get page-specific share metadata
   */
  function getPageShareMeta() {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    // Player page
    if (path.includes('player.html')) {
      const playerName = document.getElementById('playerName')?.textContent;
      if (playerName && playerName !== 'Player Name' && playerName !== 'Loading...') {
        return {
          title: `${playerName} - Mountainside Aces Stats`,
          text: `Check out ${playerName}'s stats on Mountainside Aces!`
        };
      }
    }
    
    // Team page
    if (path.includes('team.html')) {
      const teamName = document.getElementById('team-name')?.textContent;
      if (teamName && teamName !== 'Loading...') {
        return {
          title: `${teamName} - Mountainside Aces`,
          text: `Check out ${teamName}'s stats on Mountainside Aces!`
        };
      }
    }
    
    // Game preview
    if (path.includes('game-preview.html')) {
      const home = document.getElementById('homeTeamName')?.textContent;
      const away = document.getElementById('awayTeamName')?.textContent;
      if (home && away && home !== '--' && away !== '--') {
        return {
          title: `${away} @ ${home} - Game Preview`,
          text: `Check out the preview for ${away} @ ${home}!`
        };
      }
    }
    
    // Season page
    if (path.includes('season.html')) {
      const year = params.get('year');
      const season = params.get('season');
      if (year && season) {
        return {
          title: `${year} ${season} Season - Mountainside Aces`,
          text: `Check out the ${year} ${season} season stats!`
        };
      }
    }
    
    // Current season team
    if (path.includes('current-season-team.html')) {
      const header = document.querySelector('h1')?.textContent;
      if (header) {
        return {
          title: header + ' - Mountainside Aces',
          text: `Check out the team page on Mountainside Aces!`
        };
      }
    }
    
    // Default
    return {
      title: document.title || 'Mountainside Aces',
      text: 'Check out this page on Mountainside Aces!'
    };
  }

  /**
   * Create and inject floating share button
   */
  function setupShareButton() {
    // Skip pages where sharing doesn't make sense
    const path = window.location.pathname;
    const skipPages = ['signin.html', 'signup.html', 'reset-password.html', 'verify-email.html',
                       'admin-', 'link-player.html',
                       'roster-management.html', 'photo-upload.html', 'approve-links.html'];
    
    if (skipPages.some(skip => path.includes(skip))) {
      return;
    }
    
    // Don't duplicate
    if (document.getElementById('floatingShareBtn')) return;
    
    // Create floating share button
    const btn = document.createElement('button');
    btn.id = 'floatingShareBtn';
    btn.className = 'floating-share-btn';
    btn.setAttribute('aria-label', 'Share this page');
    btn.innerHTML = `
      <svg class="share-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"></circle>
        <circle cx="6" cy="12" r="3"></circle>
        <circle cx="18" cy="19" r="3"></circle>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
      </svg>
    `;
    
    btn.addEventListener('click', () => {
      const meta = getPageShareMeta();
      sharePage(meta);
    });
    
    document.body.appendChild(btn);
    
    // Show after small delay (let page content load for better metadata)
    setTimeout(() => {
      btn.classList.add('visible');
    }, 1000);
    
    console.log('✅ Share button initialized');
  }

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  /**
   * Check if device is mobile
   */
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Get viewport width
   */
  function getViewportWidth() {
    return Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  }

  /**
   * Get viewport height
   */
  function getViewportHeight() {
    return Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  }

  /**
   * Detect if user prefers reduced motion
   */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  
  /**
   * Optimize animations and transitions for mobile
   */
  function optimizePerformanceForMobile() {
    if (window.innerWidth <= 768) {
      // Reduce animation complexity on mobile
      document.querySelectorAll('.card').forEach(card => {
        card.style.transition = 'transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease';
      });
      
      // Simplify news banner animation if needed
      const newsContent = document.querySelector('.news-content');
      if (newsContent) {
        newsContent.style.animationDuration = '60s';
      }
      
      console.log('Performance optimizations applied for mobile');
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  /**
   * Initialize all mobile enhancements
   */
  function initializeMobileEnhancements() {
    // Navigation enhancements (toggle is handled by nav-component.js)
    setupMobileMenuClickOutside();
    setupMobileMenuAutoClose();
    
    // Tables
    addTableScrollIndicators();
    enableTouchScrolling();
    
    // Search
    setupMobileSearch();
    
    // Orientation
    handleOrientationChange();
    
    // Performance
    setupLazyLoading();
    optimizePerformanceForMobile();
    
    // Accessibility
    setupKeyboardNavigation();
    
    // Touch
    setupSwipeGestures();
    
    // NEW: Back to Top button
    setupBackToTop();
    
    // NEW: PWA Install prompt
    setupPWAInstall();
    
    // NEW: Keyboard overlap fix
    setupKeyboardOverlapFix();
    
    // NEW: Share button
    setupShareButton();
    
    // Log initialization (can be removed in production)
    if (window.innerWidth <= 768) {
      console.log('Mobile enhancements initialized (v1.3.1)');
    }
  }

  /**
   * Re-initialize on dynamic content load
   */
  window.reinitializeMobileEnhancements = function() {
    addTableScrollIndicators();
    setupMobileMenuAutoClose();
  };

  // ========================================
  // AUTO-INITIALIZE
  // ========================================

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMobileEnhancements);
  } else {
    initializeMobileEnhancements();
  }

  // Re-initialize on window resize (debounced)
  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth <= 768) {
      addTableScrollIndicators();
    }
  }, 250));

  // Export utilities for use in other scripts
  window.MobileUtils = {
    isMobileDevice,
    getViewportWidth,
    getViewportHeight,
    isLandscape,
    prefersReducedMotion,
    announceToScreenReader,
    debounce,
    triggerPWAInstall: window.triggerPWAInstall,
    isPWAInstalled: window.isPWAInstalled,
    // Share utilities
    showToast,
    sharePage,
    copyToClipboard,
    canUseWebShare,
    getPageShareMeta
  };

  // ========================================
  // SERVICE WORKER AUTO-UPDATE
  // ========================================

  /**
   * Register service worker and auto-update when new version available
   * Updates silently in background - no user interaction needed
   */
  function setupServiceWorkerAutoUpdate() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return;
    }

    const AUTO_UPDATE_DELAY_MS = 1000; // 1 second

    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(registration => {
        console.log('✅ Service Worker registered');

        // Clear any stale update timestamp (if update completed)
        const swUpdateKey = 'sw_update_time';
        if (sessionStorage.getItem(swUpdateKey) && !registration.waiting) {
          console.log('✅ SW update completed successfully');
          sessionStorage.removeItem(swUpdateKey);
        }

        // Force check for updates (Safari doesn't always check automatically)
        registration.update().then(() => {
          console.log('🔍 Update check complete');
        });

        // If there's already a waiting worker, activate it
        if (registration.waiting) {
          console.log('🔄 Update waiting - activating');
          activateUpdate(registration);
          return;
        }

        // Listen for new updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 Service Worker update found');

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New version ready - activating');
              activateUpdate(registration);
            }
          });
        });

        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // Clear app badge when PWA is opened (iOS)
        if (registration.active && 'clearAppBadge' in navigator) {
          navigator.clearAppBadge().catch(() => {});
        }
      })
      .catch(error => {
        console.error('❌ Service Worker registration failed:', error);
      });

    function activateUpdate(registration) {
      // Prevent reload loops - check if we recently reloaded for SW update
      const swUpdateKey = 'sw_update_time';
      const lastUpdate = sessionStorage.getItem(swUpdateKey);
      const now = Date.now();
      
      // If we reloaded within the last 10 seconds, skip to prevent loop
      if (lastUpdate && (now - parseInt(lastUpdate, 10)) < 10000) {
        console.log('🔄 SW update reload was recent, skipping to prevent loop');
        return;
      }

      let hasReloaded = false;

      function doReload() {
        if (hasReloaded) return;
        hasReloaded = true;
        sessionStorage.setItem(swUpdateKey, now.toString());
        console.log('✅ New SW in control - reloading');
        window.location.reload();
      }

      // Listen for controllerchange - fires when new SW takes control
      navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true });

      // Trigger the update after delay
      setTimeout(() => {
        if (registration.waiting) {
          console.log('📤 Sending SKIP_WAITING to service worker');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          
          // Fallback: if controllerchange doesn't fire within 3 seconds,
          // check if the waiting SW is gone (update succeeded)
          setTimeout(() => {
            if (hasReloaded) return;
            // Re-check registration state
            navigator.serviceWorker.getRegistration().then(reg => {
              if (reg && !reg.waiting) {
                // No more waiting SW = update succeeded, safe to reload
                console.log('✅ SW update confirmed (no waiting), reloading');
                doReload();
              } else if (reg && reg.waiting) {
                console.log('⚠️ SW still waiting after 3s - may need manual refresh');
              }
            });
          }, 3000);
        }
      }, AUTO_UPDATE_DELAY_MS);
    }
  }

  // Initialize service worker (runs on all pages)
  setupServiceWorkerAutoUpdate();

  // ========================================
  // FOREGROUND PUSH NOTIFICATIONS
  // ========================================
  
  /**
   * Set up foreground notification handler so push notifications
   * show even when the site is open in a browser tab
   */
  function setupForegroundNotifications() {
    // Use dynamic import since this is not an ES6 module
    import('./firebase-messaging.js')
      .then(({ onForegroundMessage }) => {
        onForegroundMessage((payload) => {
          console.log('📬 Foreground notification received:', payload);
          
          // Dispatch custom event so pages can react if needed
          window.dispatchEvent(new CustomEvent('acesNotification', { 
            detail: payload 
          }));
        });
        console.log('✅ Foreground notification handler initialized');
      })
      .catch(error => {
        // Silently fail - messaging may not be supported (Safari) or user not logged in
        console.log('ℹ️ Foreground notifications not available:', error.message);
      });
  }
  
  // Initialize foreground notifications after a short delay
  // (allows firebase-messaging.js to initialize first)
  setTimeout(setupForegroundNotifications, 1000);

})();
