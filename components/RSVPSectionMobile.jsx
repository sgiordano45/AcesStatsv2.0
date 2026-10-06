/**
 * RSVPSectionMobile Component
 * Mobile-optimized version with card-based layout and larger touch targets
 * 
 * Used when screen width < 768px
 */

const { useState } = React;

const RSVP_STATUS = {
  yes: { color: '#22c55e', icon: '✓', label: 'Yes' },
  no: { color: '#ef4444', icon: '✗', label: 'No' },
  maybe: { color: '#f59e0b', icon: '?', label: 'Maybe' },
  none: { color: '#9ca3af', icon: '○', label: 'No Response' }
};

export function RSVPSectionMobile({
  games,
  players,
  rsvps,
  onRSVPChange,
  currentUserId,
  userProfile,
  isCaptain,
  isOnline = true
}) {
  const [selectedGame, setSelectedGame] = useState(games[0]?.id || null);
  
  const handleRSVPClick = async (playerId, gameId) => {
    const key = `${playerId}-${gameId}`;
    const currentStatus = rsvps[key] || 'none';
    
    // Cycle through statuses
    const statusOrder = ['none', 'yes', 'maybe', 'no'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    
    const player = players.find(p => p.id === playerId);
    
    await onRSVPChange({
      playerId,
      gameId,
      status: nextStatus,
      playerName: player?.name || 'Unknown'
    });
  };

  const canEditRSVP = (playerName) => {
    return isCaptain || userProfile?.linkedPlayer === playerName;
  };

  const isCurrentUserRow = (playerName) => {
    return userProfile?.linkedPlayer === playerName;
  };

  const selectedGameObj = games.find(g => g.id === selectedGame);
  
  // Group players by RSVP status for selected game
  const playersByStatus = {
    yes: [],
    maybe: [],
    no: [],
    none: []
  };
  
  players.forEach(player => {
    const key = `${player.id}-${selectedGame}`;
    const status = rsvps[key] || 'none';
    playersByStatus[status].push(player);
  });

  return (
    <div style={{ 
      background: 'var(--card-bg)', 
      borderRadius: '16px', 
      marginBottom: '1rem', 
      boxShadow: 'var(--shadow-sm)', 
      border: '1px solid var(--border-color)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem'
        }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            color: 'var(--text-dark)' 
          }}>
            Game RSVPs
          </h2>
          {!isOnline && (
            <span style={{
              fontSize: '0.75rem',
              color: '#f59e0b',
              fontWeight: '600',
              padding: '4px 8px',
              borderRadius: '12px',
              background: '#fef3c7'
            }}>
              📡 Offline
            </span>
          )}
        </div>

        {/* Game Selector */}
        <select 
          value={selectedGame || ''}
          onChange={(e) => setSelectedGame(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            fontSize: '0.95rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'white',
            color: 'var(--text-dark)',
            minHeight: '44px',
            WebkitAppearance: 'none',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23718096' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center'
          }}
        >
          {games.map(game => (
            <option key={game.id} value={game.id}>
              {game.date} vs {game.opponent}
            </option>
          ))}
        </select>

        {/* RSVP Summary */}
        {selectedGameObj && (
          <div style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: '0.5rem',
            fontSize: '0.85rem',
            flexWrap: 'wrap'
          }}>
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              background: '#dcfce7',
              color: '#166534',
              fontWeight: '600'
            }}>
              ✓ {playersByStatus.yes.length} Yes
            </span>
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              background: '#fef3c7',
              color: '#854d0e',
              fontWeight: '600'
            }}>
              ? {playersByStatus.maybe.length} Maybe
            </span>
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              background: '#fee2e2',
              color: '#991b1b',
              fontWeight: '600'
            }}>
              ✗ {playersByStatus.no.length} No
            </span>
          </div>
        )}
      </div>

      {/* Player Cards */}
      <div style={{ padding: '0.5rem' }}>
        {/* Current User First */}
        {players
          .filter(player => isCurrentUserRow(player.name))
          .map(player => (
            <PlayerRSVPCard
              key={player.id}
              player={player}
              gameId={selectedGame}
              status={rsvps[`${player.id}-${selectedGame}`] || 'none'}
              onRSVPClick={handleRSVPClick}
              canEdit={canEditRSVP(player.name)}
              isCurrentUser={true}
            />
          ))}

        {/* Other Players */}
        {players
          .filter(player => !isCurrentUserRow(player.name))
          .map(player => (
            <PlayerRSVPCard
              key={player.id}
              player={player}
              gameId={selectedGame}
              status={rsvps[`${player.id}-${selectedGame}`] || 'none'}
              onRSVPClick={handleRSVPClick}
              canEdit={canEditRSVP(player.name)}
              isCurrentUser={false}
            />
          ))}
      </div>

      {/* Legend */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid var(--border-color)',
        background: '#f9fafb'
      }}>
        <div style={{ 
          fontSize: '0.75rem',
          color: 'var(--text-light)',
          textAlign: 'center',
          marginBottom: '0.5rem',
          fontWeight: '600'
        }}>
          Tap to change RSVP
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.75rem',
          fontSize: '0.75rem',
          flexWrap: 'wrap'
        }}>
          {Object.entries(RSVP_STATUS).map(([key, info]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                background: info.color,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {info.icon}
              </span>
              <span style={{ color: 'var(--text-light)' }}>{info.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Individual Player RSVP Card Component
function PlayerRSVPCard({ player, gameId, status, onRSVPClick, canEdit, isCurrentUser }) {
  const statusInfo = RSVP_STATUS[status];
  
  return (
    <div style={{
      background: isCurrentUser ? '#eff6ff' : 'white',
      border: isCurrentUser ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1rem',
      marginBottom: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      minHeight: '72px'
    }}>
      {/* Avatar */}
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: 'var(--primary-color)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontWeight: '600',
        flexShrink: 0
      }}>
        {player.avatar || player.name.charAt(0).toUpperCase()}
      </div>

      {/* Player Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: '600',
          fontSize: '1rem',
          color: 'var(--text-dark)',
          marginBottom: '2px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {player.name}
          {isCurrentUser && (
            <span style={{
              fontSize: '0.7rem',
              background: 'var(--primary-color)',
              color: 'white',
              padding: '2px 8px',
              borderRadius: '6px'
            }}>
              You
            </span>
          )}
        </div>
        <div style={{
          fontSize: '0.85rem',
          color: 'var(--text-light)'
        }}>
          #{player.jersey || 'N/A'}
        </div>
      </div>

      {/* RSVP Button */}
      <button
        onClick={() => onRSVPClick(player.id, gameId)}
        disabled={!canEdit}
        style={{
          minWidth: '64px',
          minHeight: '64px',
          borderRadius: '12px',
          border: 'none',
          fontSize: '24px',
          fontWeight: 'bold',
          color: 'white',
          background: statusInfo.color,
          cursor: canEdit ? 'pointer' : 'not-allowed',
          opacity: canEdit ? 1 : 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '4px',
          transition: 'all 0.2s ease',
          flexShrink: 0,
          WebkitTapHighlightColor: 'transparent'
        }}
      >
        <span>{statusInfo.icon}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>
          {statusInfo.label}
        </span>
      </button>
    </div>
  );
}
