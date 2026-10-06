/**
 * Theme Toggle - Mountainside Aces
 * Handles dark/light mode switching across the site
 * @version 1.1.0
 * 
 * Usage:
 * 1. Include this script on any page: <script src="theme-toggle.js"></script>
 * 2. Optionally add a toggle button with id="themeToggle"
 * 3. The script will auto-initialize and handle everything
 * 
 * Note: This script injects CSS variables directly via JavaScript,
 * so it works regardless of which stylesheets a page includes.
 */

(function() {
  'use strict';
  
  const STORAGE_KEY = 'aces-theme';
  const DARK_THEME = 'dark';
  const LIGHT_THEME = 'light';
  
  // Theme color definitions - injected via JS for maximum compatibility
  const THEME_COLORS = {
    light: {
      '--primary-color': '#2d5016',
      '--secondary-color': '#1a6b4a',
      '--accent-color': '#ffd700',
      '--bg-primary': '#f7fafc',
      '--bg-secondary': '#edf2f7',
      '--bg-elevated': '#ffffff',
      '--card-bg': '#ffffff',
      '--text-dark': '#2d3748',
      '--text-light': '#718096',
      '--text-muted': '#a0aec0',
      '--border-color': '#e2e8f0',
      '--border-light': '#f0f0f0',
      '--hover-bg': '#f8f9fa',
      '--input-bg': '#ffffff',
      '--input-border': '#e1e5e9',
      '--table-header-bg': '#f2f2f2',
      '--table-header-hover': '#e8e8e8',
      '--table-border': '#ccc',
      '--table-row-hover': '#f9f9f9',
      '--shadow-sm': '0 2px 8px rgba(0,0,0,0.08)',
      '--shadow-md': '0 4px 16px rgba(0,0,0,0.12)',
      '--shadow-lg': '0 12px 32px rgba(0,0,0,0.16)',
      '--overlay-bg': 'rgba(255,255,255,0.95)',
      '--search-highlight': '#fff3cd',
      '--kbd-bg': '#f1f5f9',
      '--kbd-border': '#cbd5e1',
      '--kbd-text': '#64748b'
    },
    dark: {
      '--primary-color': '#4a9d3f',
      '--secondary-color': '#2d8a6e',
      '--accent-color': '#ffd700',
      '--bg-primary': '#0f172a',
      '--bg-secondary': '#1e293b',
      '--bg-elevated': '#334155',
      '--card-bg': '#1e293b',
      '--text-dark': '#f1f5f9',
      '--text-light': '#94a3b8',
      '--text-muted': '#64748b',
      '--border-color': '#334155',
      '--border-light': '#475569',
      '--hover-bg': '#334155',
      '--input-bg': '#1e293b',
      '--input-border': '#475569',
      '--table-header-bg': '#334155',
      '--table-header-hover': '#475569',
      '--table-border': '#475569',
      '--table-row-hover': '#334155',
      '--shadow-sm': '0 2px 8px rgba(0,0,0,0.3)',
      '--shadow-md': '0 4px 16px rgba(0,0,0,0.4)',
      '--shadow-lg': '0 12px 32px rgba(0,0,0,0.5)',
      '--overlay-bg': 'rgba(15,23,42,0.95)',
      '--search-highlight': '#854d0e',
      '--kbd-bg': '#334155',
      '--kbd-border': '#475569',
      '--kbd-text': '#94a3b8'
    }
  };
  
  /**
   * ThemeManager - Singleton class to manage theme state
   */
  class ThemeManager {
    constructor() {
      this.initialized = false;
      this.listeners = [];
    }
    
    /**
     * Initialize the theme system
     */
    init() {
      if (this.initialized) return;
      
      // Apply saved or system preference immediately
      this.applyInitialTheme();
      
      // Set up system preference listener
      this.setupSystemPreferenceListener();
      
      // Set up toggle buttons (existing and future)
      this.setupToggleButtons();
      
      // Watch for dynamically added toggle buttons
      this.setupMutationObserver();
      
      this.initialized = true;
      console.log('🎨 Theme system initialized');
    }
    
    /**
     * Get current theme
     */
    getCurrentTheme() {
      return document.documentElement.getAttribute('data-theme') || LIGHT_THEME;
    }
    
    /**
     * Check if dark mode is active
     */
    isDarkMode() {
      return this.getCurrentTheme() === DARK_THEME;
    }
    
    /**
     * Apply the initial theme based on saved preference or system setting
     */
    applyInitialTheme() {
      const saved = localStorage.getItem(STORAGE_KEY);
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      let theme = LIGHT_THEME;
      
      if (saved) {
        theme = saved;
      } else if (systemDark) {
        theme = DARK_THEME;
      }
      
      this.setTheme(theme, false); // Don't save on initial load
    }
    
    /**
     * Set the theme
     * @param {string} theme - 'dark' or 'light'
     * @param {boolean} save - Whether to save to localStorage
     */
    setTheme(theme, save = true) {
      document.documentElement.setAttribute('data-theme', theme);
      
      // Inject CSS variables directly for maximum compatibility
      this.injectThemeVariables(theme);
      
      if (save) {
        localStorage.setItem(STORAGE_KEY, theme);
      }
      
      // Update all toggle buttons
      this.updateAllToggleIcons();
      
      // Update meta theme-color for mobile browsers
      this.updateMetaThemeColor(theme);
      
      // Notify listeners
      this.notifyListeners(theme);
      
      console.log(`🎨 Theme set to: ${theme}`);
    }
    
    /**
     * Inject CSS variables directly onto the document element
     * This ensures theme works regardless of which stylesheets are loaded
     * @param {string} theme - 'dark' or 'light'
     */
    injectThemeVariables(theme) {
      const colors = THEME_COLORS[theme] || THEME_COLORS.light;
      const root = document.documentElement;
      
      Object.entries(colors).forEach(([property, value]) => {
        root.style.setProperty(property, value);
      });
    }
    
    /**
     * Toggle between dark and light themes
     */
    toggle() {
      const newTheme = this.isDarkMode() ? LIGHT_THEME : DARK_THEME;
      this.setTheme(newTheme);
    }
    
    /**
     * Update the meta theme-color for mobile browser chrome
     */
    updateMetaThemeColor(theme) {
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      
      if (!metaThemeColor) {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.name = 'theme-color';
        document.head.appendChild(metaThemeColor);
      }
      
      // Use dark or light color based on theme
      metaThemeColor.content = theme === DARK_THEME ? '#0f172a' : '#2d5016';
    }
    
    /**
     * Update all toggle button icons on the page
     */
    updateAllToggleIcons() {
      const isDark = this.isDarkMode();
      const icon = isDark ? '☀️' : '🌙';
      
      // Update all toggle icons
      document.querySelectorAll('.theme-toggle-icon').forEach(el => {
        el.textContent = icon;
      });
      
      // Update aria-label for accessibility
      document.querySelectorAll('.theme-toggle, #themeToggle, #mobileThemeToggle').forEach(btn => {
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      });
    }
    
    /**
     * Set up listener for system preference changes
     */
    setupSystemPreferenceListener() {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only auto-switch if user hasn't manually set a preference
        if (!localStorage.getItem(STORAGE_KEY)) {
          this.setTheme(e.matches ? DARK_THEME : LIGHT_THEME, false);
        }
      });
    }
    
    /**
     * Set up click handlers for all toggle buttons
     */
    setupToggleButtons() {
      // Common selectors for toggle buttons
      const selectors = '.theme-toggle, #themeToggle, #mobileThemeToggle, [data-theme-toggle]';
      
      document.querySelectorAll(selectors).forEach(btn => {
        this.attachToggleHandler(btn);
      });
    }
    
    /**
     * Attach toggle handler to a button (with duplicate prevention)
     */
    attachToggleHandler(btn) {
      if (btn.dataset.themeHandlerAttached) return;
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
      
      btn.dataset.themeHandlerAttached = 'true';
    }
    
    /**
     * Watch for dynamically added toggle buttons
     */
    setupMutationObserver() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node is a toggle button
              if (node.matches?.('.theme-toggle, #themeToggle, #mobileThemeToggle, [data-theme-toggle]')) {
                this.attachToggleHandler(node);
                this.updateAllToggleIcons();
              }
              // Check for toggle buttons within the added node
              node.querySelectorAll?.('.theme-toggle, #themeToggle, #mobileThemeToggle, [data-theme-toggle]')
                .forEach(btn => {
                  this.attachToggleHandler(btn);
                });
            }
          });
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    /**
     * Register a callback for theme changes
     * @param {Function} callback - Function to call when theme changes
     */
    onChange(callback) {
      this.listeners.push(callback);
    }
    
    /**
     * Notify all listeners of theme change
     */
    notifyListeners(theme) {
      this.listeners.forEach(callback => {
        try {
          callback(theme, theme === DARK_THEME);
        } catch (e) {
          console.error('Theme change listener error:', e);
        }
      });
      
      // Also dispatch a custom event for other scripts to listen to
      window.dispatchEvent(new CustomEvent('themechange', {
        detail: { theme, isDark: theme === DARK_THEME }
      }));
    }
    
    /**
     * Clear saved preference (reverts to system preference)
     */
    clearPreference() {
      localStorage.removeItem(STORAGE_KEY);
      this.applyInitialTheme();
    }
  }
  
  // Create singleton instance
  const themeManager = new ThemeManager();
  
  // Expose to global scope
  window.ThemeManager = themeManager;
  
  // Convenience methods on window
  window.toggleTheme = () => themeManager.toggle();
  window.setTheme = (theme) => themeManager.setTheme(theme);
  window.isDarkMode = () => themeManager.isDarkMode();
  
  // Initialize immediately if DOM is ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => themeManager.init());
  } else {
    themeManager.init();
  }
  
  // Also ensure icons are updated after full page load
  window.addEventListener('load', () => themeManager.updateAllToggleIcons());
  
})();
