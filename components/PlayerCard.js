/**
 * PlayerCard Component
 * Reusable player display card used across RSVP, Batting Order, and Fielding sections
 * 
 * Features:
 * - Drag-and-drop support
 * - Two sizes: 'normal' and 'small'
 * - Optional stats display
 * - Remove button for captains
 * - Current user highlighting
 */

const { X } = window.lucide;

export function PlayerCard({ 
  player, 
  draggable = false, 
  showStats = false, 
  onRemove, 
  size = 'normal',
  isCaptain = false,
  currentUserId = null,
  onDragStart
}) {
  if (!player || !player.name) {
    console.warn('PlayerCard: Invalid player object:', player);
    return null;
  }
  
  const isSmall = size === 'small';
  const isCurrentUser = player.id === currentUserId;
  
  // For small cards, show only last name
  const displayName = isSmall 
    ? (player.name.split(' ').pop() || player.name) 
    : player.name;
  
  const cardClasses = `player-card-hover ${draggable && isCaptain ? 'player-card-draggable' : ''}`;
  
  return (
    <div
      draggable={draggable && isCaptain}
      onDragStart={(e) => {
        if (onDragStart && isCaptain) {
          onDragStart(e, player);
        }
      }}
      style={{
        padding: isSmall ? '8px' : '10px', 
        background: isCurrentUser ? '#eff6ff' : 'var(--card-bg)',
        borderRadius: '12px', 
        boxShadow: 'var(--shadow-sm)',
        border: isCurrentUser ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px',
        cursor: draggable && isCaptain ? 'move' : 'default',
        transition: 'all 0.2s ease', 
        position: 'relative',
        minHeight: isSmall ? '40px' : '48px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none'
      }}
      className={cardClasses}
    >
      {/* Avatar Circle */}
      <div style={{
        width: isSmall ? '28px' : '36px', 
        height: isSmall ? '28px' : '36px',
        borderRadius: '50%', 
        background: 'var(--primary-color)', 
        color: 'white',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontSize: isSmall ? '11px' : '13px', 
        fontWeight: '600', 
        flexShrink: 0,
        userSelect: 'none'
      }}>
        {player.avatar || player.name.charAt(0).toUpperCase()}
      </div>
      
      {/* Player Info */}
      <div style={{ 
        flex: 1, 
        minWidth: 0, 
        userSelect: 'none' 
      }}>
        <div style={{ 
          fontWeight: '500', 
          fontSize: isSmall ? '11px' : '14px',
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          color: 'var(--text-dark)'
        }}>
          {displayName}
          {isCurrentUser && !isSmall && (
            <span style={{
              fontSize: '10px', 
              background: 'var(--primary-color)', 
              color: 'white',
              padding: '2px 6px', 
              borderRadius: '6px'
            }}>
              You
            </span>
          )}
        </div>
        {!isSmall && (
          <div style={{ 
            fontSize: '11px', 
            color: 'var(--text-light)' 
          }}>
            #{player.jersey || 'N/A'}
          </div>
        )}
      </div>
      
      {/* Batting Average (optional) */}
      {showStats && !isSmall && (
        <div style={{ 
          fontSize: '11px', 
          color: 'var(--text-dark)', 
          userSelect: 'none',
          fontWeight: '600',
          padding: '4px 8px',
          background: '#f3f4f6',
          borderRadius: '6px'
        }}>
          {player.battingAvg || '.000'}
        </div>
      )}
      
      {/* Remove Button (only for captains) */}
      {onRemove && isCaptain && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }} 
          className="remove-btn"
          title="Remove player"
          style={{
            opacity: 0, 
            transition: 'opacity 0.2s', 
            padding: '4px',
            background: 'none', 
            border: 'none', 
            cursor: 'pointer', 
            borderRadius: '6px',
            pointerEvents: 'auto'
          }}
        >
          <X style={{ 
            width: '14px', 
            height: '14px', 
            color: '#dc2626' 
          }} />
        </button>
      )}
    </div>
  );
}

/**
 * PlayerCard Variants for Different Contexts
 */

// Simplified card for mobile/touch interfaces
export function PlayerCardMobile({ 
  player, 
  onTap,
  selected = false,
  showStats = false
}) {
  if (!player || !player.name) return null;
  
  return (
    <div
      onClick={onTap}
      style={{
        padding: '12px 16px',
        background: selected ? '#dbeafe' : 'white',
        border: selected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: selected ? '0 2px 8px rgba(45, 80, 22, 0.2)' : 'var(--shadow-sm)',
        minHeight: '60px'
      }}
    >
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'var(--primary-color)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        fontWeight: '600',
        flexShrink: 0
      }}>
        {player.avatar || player.name.charAt(0).toUpperCase()}
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ 
          fontWeight: '600', 
          fontSize: '15px',
          color: 'var(--text-dark)',
          marginBottom: '2px'
        }}>
          {player.name}
        </div>
        <div style={{ 
          fontSize: '13px', 
          color: 'var(--text-light)' 
        }}>
          #{player.jersey || 'N/A'}
        </div>
      </div>
      
      {showStats && (
        <div style={{
          fontSize: '14px',
          fontWeight: '700',
          color: 'var(--primary-color)',
          padding: '6px 12px',
          background: '#f0fdf4',
          borderRadius: '8px'
        }}>
          {player.battingAvg || '.000'}
        </div>
      )}
      
      {selected && (
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'var(--primary-color)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px'
        }}>
          ✓
        </div>
      )}
    </div>
  );
}

// Compact list item for available players sidebar
export function PlayerCardCompact({ player, onDragStart, isCaptain }) {
  if (!player || !player.name) return null;
  
  return (
    <div
      draggable={isCaptain}
      onDragStart={(e) => {
        if (onDragStart && isCaptain) {
          onDragStart(e, player);
        }
      }}
      style={{
        padding: '8px 12px',
        background: 'white',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: isCaptain ? 'move' : 'default',
        transition: 'all 0.2s ease',
        userSelect: 'none'
      }}
      className={isCaptain ? 'player-card-draggable' : ''}
    >
      <div style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'var(--primary-color)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        fontWeight: '600',
        flexShrink: 0
      }}>
        {player.avatar || player.name.charAt(0).toUpperCase()}
      </div>
      
      <div style={{ 
        flex: 1, 
        fontSize: '13px',
        fontWeight: '500',
        color: 'var(--text-dark)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {player.name}
      </div>
      
      <div style={{
        fontSize: '11px',
        color: 'var(--text-light)',
        flexShrink: 0
      }}>
        #{player.jersey || '?'}
      </div>
    </div>
  );
}
