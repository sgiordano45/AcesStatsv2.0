/**
 * Platform Detection Utilities
 * Detect device type, screen size, and app context for responsive behavior
 */

/**
 * Get current platform context
 * @returns {Object} Platform information
 */
export function getPlatformContext() {
  const width = window.innerWidth;
  
  return {
    // Mobile app detection
    isMobileApp: window.ReactNativeWebView !== undefined || 
                 window.webkit?.messageHandlers?.iOS !== undefined ||
                 window.Android !== undefined,
    
    // Screen size categories
    isMobileWeb: width < 768 && !window.ReactNativeWebView,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    
    // Specific breakpoints
    width,
    isSmallMobile: width < 375,
    isMediumMobile: width >= 375 && width < 768,
    
    // Connection status
    isOnline: navigator.onLine,
    
    // Touch support
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0
  };
}

/**
 * Hook for reactive platform detection
 * @returns {Object} Current platform context that updates on resize
 */
export function usePlatformContext() {
  const [context, setContext] = React.useState(getPlatformContext());
  
  React.useEffect(() => {
    const handleResize = () => {
      setContext(getPlatformContext());
    };
    
    const handleOnlineChange = () => {
      setContext(getPlatformContext());
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('online', handleOnlineChange);
      window.removeEventListener('offline', handleOnlineChange);
    };
  }, []);
  
  return context;
}

/**
 * Breakpoint constants
 */
export const BREAKPOINTS = {
  MOBILE_SMALL: 375,   // iPhone SE
  MOBILE: 768,         // Phones in general
  TABLET: 1024,        // iPads, show condensed grid
  DESKTOP: 1280        // Full grid
};

/**
 * Determine view mode for fielding section based on screen size
 * @param {number} width - Current screen width
 * @returns {string} 'inning-by-inning' | 'condensed-grid' | 'full-grid'
 */
export function getFieldingViewMode(width) {
  if (width < BREAKPOINTS.MOBILE) {
    return 'inning-by-inning'; // Mobile: one inning at a time
  } else if (width < BREAKPOINTS.TABLET) {
    return 'condensed-grid'; // Tablet: 3 innings visible
  } else {
    return 'full-grid'; // Desktop: all 7 innings
  }
}

/**
 * Get recommended number of innings to show simultaneously
 * @param {number} width - Current screen width
 * @returns {number} Number of innings to display
 */
export function getRecommendedInningColumns(width) {
  if (width < BREAKPOINTS.MOBILE) return 1;
  if (width < BREAKPOINTS.TABLET) return 3;
  return 7; // Full view
}

/**
 * Check if device prefers reduced motion
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get safe area insets for notched devices
 * @returns {Object} Inset values
 */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0'),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0'),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0'),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0')
  };
}
