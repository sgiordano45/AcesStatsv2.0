/**
 * Responsive Roster Management Wrapper
 * Automatically switches between desktop and mobile components based on screen size
 * 
 * Uses platform-utils.js to detect screen width and conditionally render
 */

import { usePlatformContext } from './utils/platform-utils.js';

// Desktop components
import { RSVPSection } from './components/RSVPSection.jsx';
import { BattingOrderSection } from './components/BattingOrderSection.jsx';
import { FieldingPositionsSection } from './components/FieldingPositionsSection.jsx';

// Mobile components
import { RSVPSectionMobile } from './components/RSVPSectionMobile.jsx';
import { BattingOrderSectionMobile } from './components/BattingOrderSectionMobile.jsx';
import { FieldingPositionsSectionMobile } from './components/FieldingPositionsSectionMobile.jsx';

const { useState } = React;

export function ResponsiveRosterWrapper(props) {
  const platform = usePlatformContext();
  const [activeTab, setActiveTab] = useState('rsvp');
  
  // Determine which components to use based on screen size
  const RSVPComponent = platform.isMobileWeb ? RSVPSectionMobile : RSVPSection;
  const BattingComponent = platform.isMobileWeb ? BattingOrderSectionMobile : BattingOrderSection;
  const FieldingComponent = platform.isMobileWeb ? FieldingPositionsSectionMobile : FieldingPositionsSection;
  
  // On mobile, show all sections stacked (no tabs)
  // On desktop, use tabbed interface
  if (platform.isMobileWeb) {
    return (
      <div style={{ padding: '0.5rem' }}>
        <RSVPComponent {...props} isOnline={platform.isOnline} />
        
        {props.isCaptain && props.selectedGame && (
          <>
            <BattingComponent {...props} isOnline={platform.isOnline} />
            <FieldingComponent {...props} isOnline={platform.isOnline} />
          </>
        )}
      </div>
    );
  }
  
  // Desktop: Tabbed interface
  return (
    <div>
      {/* Desktop Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid var(--border-color)'
      }}>
        <TabButton
          active={activeTab === 'rsvp'}
          onClick={() => setActiveTab('rsvp')}
          label="RSVPs"
        />
        {props.isCaptain && (
          <>
            <TabButton
              active={activeTab === 'lineup'}
              onClick={() => setActiveTab('lineup')}
              label="Lineup Management"
            />
          </>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'rsvp' && (
        <RSVPComponent {...props} isOnline={platform.isOnline} />
      )}
      
      {activeTab === 'lineup' && props.isCaptain && (
        <>
          <BattingComponent {...props} isOnline={platform.isOnline} />
          <FieldingComponent {...props} isOnline={platform.isOnline} />
        </>
      )}
    </div>
  );
}

// Tab Button Component
function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.75rem 1.5rem',
        background: active ? 'var(--primary-color)' : 'transparent',
        color: active ? 'white' : 'var(--text-dark)',
        border: 'none',
        borderBottom: active ? '3px solid var(--accent-color)' : '3px solid transparent',
        fontSize: '1rem',
        fontWeight: active ? '600' : '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        borderRadius: '8px 8px 0 0'
      }}
    >
      {label}
    </button>
  );
}

/**
 * Alternative: Separate responsive wrappers for each component
 * Use these if you want granular control over each section
 */

export function ResponsiveRSVP(props) {
  const platform = usePlatformContext();
  const Component = platform.isMobileWeb ? RSVPSectionMobile : RSVPSection;
  return <Component {...props} isOnline={platform.isOnline} />;
}

export function ResponsiveBattingOrder(props) {
  const platform = usePlatformContext();
  const Component = platform.isMobileWeb ? BattingOrderSectionMobile : BattingOrderSection;
  return <Component {...props} isOnline={platform.isOnline} />;
}

export function ResponsiveFieldingPositions(props) {
  const platform = usePlatformContext();
  const Component = platform.isMobileWeb ? FieldingPositionsSectionMobile : FieldingPositionsSection;
  return <Component {...props} isOnline={platform.isOnline} />;
}
