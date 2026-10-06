/**
 * calendar-subscription.js
 * Frontend module for iCal calendar subscription feature
 * 
 * Usage:
 *   import { CalendarSubscription } from './calendar-subscription.js';
 *   
 *   // Initialize with container element
 *   const cal = new CalendarSubscription('calendar-btn-container');
 *   
 *   // Or for a specific team
 *   const cal = new CalendarSubscription('calendar-btn-container', { team: 'orange' });
 */

// Cloud Function URL - Update after deployment
const CALENDAR_FUNCTION_URL = 'https://us-central1-acessoftballreference-84791.cloudfunctions.net/calendar';

/**
 * CalendarSubscription class
 * Provides UI and functionality for calendar subscriptions
 */
export class CalendarSubscription {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      team: options.team || null,
      season: options.season || null,
      showDropdown: options.showDropdown !== false,
      buttonText: options.buttonText || '📅 Add to Calendar',
      buttonClass: options.buttonClass || 'calendar-btn'
    };
    
    if (this.container) {
      this.render();
    }
  }
  
  /**
   * Generate the subscription URL
   */
  getSubscriptionUrl(options = {}) {
    const params = new URLSearchParams();
    
    const team = options.team || this.options.team;
    const season = options.season || this.options.season;
    
    if (team) params.set('team', team);
    if (season) params.set('season', season);
    
    const queryString = params.toString();
    return queryString ? `${CALENDAR_FUNCTION_URL}?${queryString}` : CALENDAR_FUNCTION_URL;
  }
  
  /**
   * Render the calendar button/UI
   */
  render() {
    if (!this.container) return;
    
    const html = `
      <div class="calendar-subscription">
        <button class="${this.options.buttonClass}" id="calendarMainBtn">
          ${this.options.buttonText}
        </button>
        ${this.options.showDropdown ? this.renderDropdown() : ''}
      </div>
    `;
    
    this.container.innerHTML = html;
    this.attachEventListeners();
  }
  
  /**
   * Render dropdown menu for calendar options
   */
  renderDropdown() {
    return `
      <div class="calendar-dropdown" id="calendarDropdown" style="display: none;">
        <div class="calendar-dropdown-content">
          <button class="calendar-option" data-action="subscribe">
            🔗 Subscribe (auto-updates)
          </button>
          <button class="calendar-option" data-action="download">
            ⬇️ Download .ics file
          </button>
          <button class="calendar-option" data-action="google">
            📆 Add to Google Calendar
          </button>
          <hr style="margin: 0.5rem 0; border-color: #eee;">
          <button class="calendar-option" data-action="copy">
            📋 Copy subscription URL
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const mainBtn = this.container.querySelector('#calendarMainBtn');
    const dropdown = this.container.querySelector('#calendarDropdown');
    
    if (mainBtn) {
      mainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.options.showDropdown && dropdown) {
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        } else {
          // Direct download if no dropdown
          this.downloadCalendar();
        }
      });
    }
    
    // Dropdown option clicks
    const options = this.container.querySelectorAll('.calendar-option');
    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = opt.dataset.action;
        this.handleAction(action);
        if (dropdown) dropdown.style.display = 'none';
      });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      if (dropdown) dropdown.style.display = 'none';
    });
  }
  
  /**
   * Handle dropdown actions
   */
  handleAction(action) {
    const url = this.getSubscriptionUrl();
    
    switch (action) {
      case 'subscribe':
        this.showSubscribeInstructions(url);
        break;
      case 'download':
        this.downloadCalendar();
        break;
      case 'google':
        this.addToGoogleCalendar(url);
        break;
      case 'copy':
        this.copyToClipboard(url);
        break;
    }
  }
  
  /**
   * Download .ics file directly
   */
  downloadCalendar() {
    const url = this.getSubscriptionUrl();
    window.open(url, '_blank');
  }
  
  /**
   * Show subscribe instructions modal
   */
  showSubscribeInstructions(url) {
    const modal = document.createElement('div');
    modal.className = 'calendar-modal';
    modal.innerHTML = `
      <div class="calendar-modal-content">
        <button class="calendar-modal-close">&times;</button>
        <h3>📅 Subscribe to Calendar</h3>
        <p>Copy this URL and add it as a subscription in your calendar app:</p>
        
        <div class="calendar-url-box">
          <input type="text" value="${url}" readonly id="calendarUrlInput">
          <button class="copy-btn" id="copyUrlBtn">Copy</button>
        </div>
        
        <div class="calendar-instructions">
          <h4>Instructions:</h4>
          
          <details>
            <summary><strong>📱 iPhone/iOS Calendar</strong></summary>
            <ol>
              <li>Go to Settings → Calendar → Accounts</li>
              <li>Tap "Add Account" → "Other"</li>
              <li>Tap "Add Subscribed Calendar"</li>
              <li>Paste the URL above</li>
              <li>Tap "Next" then "Save"</li>
            </ol>
          </details>
          
          <details>
            <summary><strong>📆 Google Calendar</strong></summary>
            <ol>
              <li>Open Google Calendar on web</li>
              <li>Click the + next to "Other calendars"</li>
              <li>Select "From URL"</li>
              <li>Paste the URL above</li>
              <li>Click "Add calendar"</li>
            </ol>
          </details>
          
          <details>
            <summary><strong>📧 Outlook</strong></summary>
            <ol>
              <li>Go to Calendar view</li>
              <li>Click "Add calendar" → "From Internet"</li>
              <li>Paste the URL above</li>
              <li>Click "OK"</li>
            </ol>
          </details>
          
          <details>
            <summary><strong>🍎 Mac Calendar</strong></summary>
            <ol>
              <li>Open Calendar app</li>
              <li>File → New Calendar Subscription</li>
              <li>Paste the URL above</li>
              <li>Click "Subscribe"</li>
            </ol>
          </details>
        </div>
        
        <p class="calendar-note">
          <strong>Note:</strong> Subscribed calendars auto-update! 
          Any schedule changes will appear automatically within an hour.
        </p>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners for modal
    modal.querySelector('.calendar-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    
    modal.querySelector('#copyUrlBtn').addEventListener('click', () => {
      const input = modal.querySelector('#calendarUrlInput');
      input.select();
      navigator.clipboard.writeText(input.value).then(() => {
        modal.querySelector('#copyUrlBtn').textContent = 'Copied!';
        setTimeout(() => {
          modal.querySelector('#copyUrlBtn').textContent = 'Copy';
        }, 2000);
      });
    });
  }
  
  /**
   * Add to Google Calendar (opens Google Calendar with URL)
   */
  addToGoogleCalendar(url) {
    // Google Calendar subscription via URL
    const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`;
    window.open(googleUrl, '_blank');
  }
  
  /**
   * Copy URL to clipboard
   */
  async copyToClipboard(url) {
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('Calendar URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.showToast('Calendar URL copied to clipboard!');
    }
  }
  
  /**
   * Show toast notification
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'calendar-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

/**
 * Standalone function to get calendar URL
 */
export function getCalendarUrl(options = {}) {
  const params = new URLSearchParams();
  if (options.team) params.set('team', options.team);
  if (options.season) params.set('season', options.season);
  const queryString = params.toString();
  return queryString ? `${CALENDAR_FUNCTION_URL}?${queryString}` : CALENDAR_FUNCTION_URL;
}

/**
 * Standalone function to download calendar
 */
export function downloadCalendar(options = {}) {
  const url = getCalendarUrl(options);
  window.open(url, '_blank');
}

/**
 * CSS styles for the calendar subscription UI
 * Add to your stylesheet or inject dynamically
 */
export const calendarStyles = `
/* Calendar Subscription Styles */
.calendar-subscription {
  position: relative;
  display: inline-block;
}

.calendar-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: linear-gradient(135deg, var(--primary-color, #2d5016) 0%, var(--secondary-color, #4a7c23) 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(45, 80, 22, 0.3);
}

.calendar-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(45, 80, 22, 0.4);
}

.calendar-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 220px;
  overflow: hidden;
}

.calendar-dropdown-content {
  padding: 0.5rem;
}

.calendar-option {
  display: block;
  width: 100%;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  text-align: left;
  font-size: 0.9rem;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s;
}

.calendar-option:hover {
  background: #f5f5f5;
}

/* Modal styles */
.calendar-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
}

.calendar-modal-content {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
}

.calendar-modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
}

.calendar-modal-content h3 {
  margin: 0 0 1rem;
  color: #333;
}

.calendar-url-box {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
}

.calendar-url-box input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: monospace;
}

.calendar-url-box .copy-btn {
  padding: 0.75rem 1rem;
  background: var(--primary-color, #2d5016);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.calendar-instructions {
  margin: 1.5rem 0;
}

.calendar-instructions h4 {
  margin: 0 0 1rem;
  color: #333;
}

.calendar-instructions details {
  margin-bottom: 0.5rem;
}

.calendar-instructions summary {
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  list-style: none;
}

.calendar-instructions summary::-webkit-details-marker {
  display: none;
}

.calendar-instructions details[open] summary {
  border-radius: 8px 8px 0 0;
}

.calendar-instructions ol {
  margin: 0;
  padding: 1rem 1rem 1rem 2rem;
  background: #f8f9fa;
  border-radius: 0 0 8px 8px;
}

.calendar-instructions li {
  margin-bottom: 0.5rem;
}

.calendar-note {
  padding: 1rem;
  background: #e8f5e9;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-top: 1rem;
}

/* Toast notification */
.calendar-toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: #333;
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  font-size: 0.95rem;
  opacity: 0;
  transition: all 0.3s ease;
  z-index: 10001;
}

.calendar-toast.show {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .calendar-modal-content {
    padding: 1.5rem;
    border-radius: 12px;
  }
  
  .calendar-url-box {
    flex-direction: column;
  }
  
  .calendar-dropdown {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    top: auto;
    width: auto;
    min-width: 0;
    border-radius: 16px;
  }
}
`;

// Auto-inject styles when module loads
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = calendarStyles;
  document.head.appendChild(styleEl);
}
