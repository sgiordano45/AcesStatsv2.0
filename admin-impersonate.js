// admin-impersonate.js - User Impersonation Service for Admin Testing
// Allows admins to view the site from another user's perspective

import { db } from './firebase-data.js';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { isAdmin } from './firebase-auth.js';

// ========================================
// CONSTANTS
// ========================================

const IMPERSONATION_KEY = 'aces_impersonated_user';
const REAL_USER_KEY = 'aces_real_admin_user';

// ========================================
// IMPERSONATION STATE MANAGEMENT
// ========================================

/**
 * Check if impersonation mode is currently active
 * @returns {boolean}
 */
export function isImpersonating() {
  return sessionStorage.getItem(IMPERSONATION_KEY) !== null;
}

/**
 * Get the impersonated user profile (or null if not impersonating)
 * @returns {Object|null}
 */
export function getImpersonatedUser() {
  const stored = sessionStorage.getItem(IMPERSONATION_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error parsing impersonated user:', e);
    return null;
  }
}

/**
 * Get the real admin user profile (stored when impersonation started)
 * @returns {Object|null}
 */
export function getRealAdminUser() {
  const stored = sessionStorage.getItem(REAL_USER_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error parsing real admin user:', e);
    return null;
  }
}

/**
 * Get the effective user profile for display purposes
 * Returns impersonated user if active, otherwise the real user
 * @param {Object} realUserProfile - The actual authenticated user's profile
 * @returns {Object}
 */
export function getEffectiveUserProfile(realUserProfile) {
  if (isImpersonating()) {
    return getImpersonatedUser();
  }
  return realUserProfile;
}

/**
 * Start impersonating a user (admin only)
 * @param {Object} adminProfile - The admin's actual profile
 * @param {string} targetUserId - The user ID to impersonate
 * @returns {Promise<{success: boolean, message: string, user?: Object}>}
 */
export async function startImpersonation(adminProfile, targetUserId) {
  // Security check - only admins can impersonate
  if (!isAdmin(adminProfile)) {
    return { 
      success: false, 
      message: 'Only administrators can use impersonation mode' 
    };
  }
  
  // Can't impersonate yourself
  if (adminProfile.uid === targetUserId) {
    return { 
      success: false, 
      message: 'Cannot impersonate yourself' 
    };
  }
  
  try {
    // Fetch target user's profile
    const userDoc = await getDoc(doc(db, 'users', targetUserId));
    
    if (!userDoc.exists()) {
      return { 
        success: false, 
        message: 'User not found' 
      };
    }
    
    const targetUser = {
      uid: targetUserId,
      ...userDoc.data()
    };
    
    // Store real admin for reference
    sessionStorage.setItem(REAL_USER_KEY, JSON.stringify({
      uid: adminProfile.uid,
      displayName: adminProfile.displayName,
      email: adminProfile.email,
      userRole: adminProfile.userRole
    }));
    
    // Store impersonated user
    sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(targetUser));
    
    console.log(`🎭 Impersonation started: Viewing as ${targetUser.displayName || targetUser.email}`);
    
    return { 
      success: true, 
      message: `Now viewing as ${targetUser.displayName || targetUser.email}`,
      user: targetUser
    };
    
  } catch (error) {
    console.error('Error starting impersonation:', error);
    return { 
      success: false, 
      message: 'Error loading user profile' 
    };
  }
}

/**
 * Stop impersonation and return to admin view
 */
export function stopImpersonation() {
  const impersonatedUser = getImpersonatedUser();
  
  sessionStorage.removeItem(IMPERSONATION_KEY);
  sessionStorage.removeItem(REAL_USER_KEY);
  
  if (impersonatedUser) {
    console.log(`🎭 Impersonation ended: No longer viewing as ${impersonatedUser.displayName || impersonatedUser.email}`);
  }
  
  return { success: true, message: 'Returned to admin view' };
}

// ========================================
// UI COMPONENTS
// ========================================

/**
 * Create and inject the impersonation banner into the page
 * Call this on page load if you want the banner to appear
 */
export function injectImpersonationBanner() {
  // Remove any existing banner first
  const existing = document.getElementById('impersonation-banner');
  if (existing) existing.remove();
  
  if (!isImpersonating()) return;
  
  const impersonatedUser = getImpersonatedUser();
  const realAdmin = getRealAdminUser();
  
  if (!impersonatedUser) return;
  
  const banner = document.createElement('div');
  banner.id = 'impersonation-banner';
  banner.innerHTML = `
    <div class="impersonation-banner-content">
      <span class="impersonation-icon">🎭</span>
      <span class="impersonation-text">
        <strong>View As Mode:</strong> 
        ${impersonatedUser.displayName || impersonatedUser.email || 'Unknown User'}
        <span class="impersonation-role">(${formatRole(impersonatedUser.userRole)})</span>
      </span>
      <button id="exit-impersonation" class="impersonation-exit-btn">
        ✕ Exit View As
      </button>
    </div>
  `;
  
  // Inject styles if not already present
  if (!document.getElementById('impersonation-styles')) {
    const styles = document.createElement('style');
    styles.id = 'impersonation-styles';
    styles.textContent = `
      #impersonation-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
        color: white;
        padding: 10px 20px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .impersonation-banner-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        max-width: 1200px;
        margin: 0 auto;
        flex-wrap: wrap;
      }
      
      .impersonation-icon {
        font-size: 1.3em;
      }
      
      .impersonation-text {
        font-size: 0.95rem;
      }
      
      .impersonation-role {
        opacity: 0.9;
        font-size: 0.85em;
      }
      
      .impersonation-exit-btn {
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.4);
        color: white;
        padding: 6px 14px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        transition: all 0.2s ease;
      }
      
      .impersonation-exit-btn:hover {
        background: rgba(255,255,255,0.3);
        border-color: white;
      }
      
      /* Push page content down when banner is showing */
      body.impersonation-active {
        padding-top: 50px !important;
      }
      
      /* Mobile adjustments */
      @media (max-width: 600px) {
        #impersonation-banner {
          padding: 8px 12px;
        }
        
        .impersonation-banner-content {
          font-size: 0.85rem;
          gap: 8px;
        }
        
        .impersonation-exit-btn {
          padding: 5px 10px;
          font-size: 0.8rem;
        }
      }
    `;
    document.head.appendChild(styles);
  }
  
  // Add banner to page
  document.body.insertBefore(banner, document.body.firstChild);
  document.body.classList.add('impersonation-active');
  
  // Add exit handler
  document.getElementById('exit-impersonation').addEventListener('click', () => {
    stopImpersonation();
    window.location.reload();
  });
}

/**
 * Format role for display
 */
function formatRole(role) {
  const roleLabels = {
    'admin': '👑 Admin',
    'league-staff': '⚙️ League Staff',
    'captain': '🎯 Captain',
    'team-staff': '📋 Team Staff',
    'player': '🥎 Player',
    'fan': '📣 Fan',
    'family': '👨‍👩‍👧 Family'
  };
  return roleLabels[role] || role || 'Unknown';
}

// ========================================
// USER LIST FOR ADMIN SELECTION
// ========================================

/**
 * Fetch all users for admin selection dropdown
 * Excludes migrated/legacy profiles - only returns real authenticated users
 * @returns {Promise<Array>}
 */
export async function fetchAllUsersForImpersonation() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const users = [];
    
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      
      // Filter criteria for real authenticated users:
      // 1. Must have email (all Firebase auth users have this)
      // 2. Must not be marked as migrated
      // 3. Document ID must be a Firebase UID (long alphanumeric, no underscores)
      const hasEmail = !!data.email;
      const notMigrated = !data.migrated;
      const isFirebaseUID = docSnap.id.length > 20 && !docSnap.id.includes('_');
      
      if (hasEmail && notMigrated && isFirebaseUID) {
        users.push({
          uid: docSnap.id,
          displayName: data.displayName || 'No Name',
          email: data.email,
          userRole: data.userRole || 'fan',
          linkedPlayer: data.linkedPlayer,
          linkedTeam: data.linkedTeam,
          isCaptain: data.isCaptain,
          teamRoles: data.teamRoles || {},
          createdAt: data.createdAt
        });
      }
    });
    
    // Sort by display name
    users.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    
    return users;
    
  } catch (error) {
    console.error('Error fetching users for impersonation:', error);
    return [];
  }
}

// ========================================
// AUTO-INJECT ON PAGE LOAD
// ========================================

// Automatically inject banner when this module loads if impersonation is active
if (typeof document !== 'undefined') {
  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectImpersonationBanner);
  } else {
    injectImpersonationBanner();
  }
}
