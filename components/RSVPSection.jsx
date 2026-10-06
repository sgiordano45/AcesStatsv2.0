/**
 * RSVPSection Component
 * Handles player RSVP management for upcoming games
 * 
 * Extracted from roster-management.html for reusability across desktop/mobile
 */

const { useState, useEffect } = React;

const RSVP_STATUS = {
  yes: { color: '#22c55e', icon: '✓', label: 'Yes' },
  no: { color: '#ef4444', icon: '✗', label: 'No' },
  maybe: { color: '#f59e0b', icon: '?', label: 'Maybe' },
  none: { color: '#9ca3af', icon: '○', label: 'No Response' }
};

export function RSVPSection({
  games,
  players,
  rsvps,
  onRSVPChange,
  currentUserId,
  userProfile,
  isCaptain,
  isOnline = true
}) {
  
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

  return (
    <div style={{ 
      background: 'var(--card-bg)', 
      padding: '1.5rem', 
      borderRadius: '16px', 
      marginBottom: '2rem', 
      boxShadow: 'var(--shadow-sm)', 
      border: '1px solid var(--border-color)' 
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1rem' 
      }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          color: 'var(--text-dark)' 
        }}>
          Game RSVPs
        </h2>
        {!isOnline && (
          <span style={{
            fontSize: '0.85rem',
            color: '#f59e0b',
            fontWeight: '600',
            padding: '4px 12px',
            borderRadius: '12px',
            background: '#fef3c7'
          }}>
            📡 Offline - Changes will sync
          </span>
        )}
      </div>

      <div className="table-scroll-container" style={{ 
        border: '1px solid var(--border-color)', 
        borderRadius: '12px' 
      }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          fontSize: '14px' 
        }}>
          <thead>
            <tr>
              <th style={{ 
                position: 'sticky', 
                left: 0, 
                background: '#f2f2f2', 
                zIndex: 10, 
                borderBottom: '2px solid var(--border-color)', 
                padding: '8px', 
                textAlign: 'left', 
                minWidth: '200px', 
                color: 'var(--text-dark)' 
              }}>
                Player
              </th>
              {games.map(game => (
                <th key={game.id} style={{ 
                  borderBottom: '2px solid var(--border-color)', 
                  padding: '8px', 
                  textAlign: 'center', 
                  background: '#f2f2f2', 
                  whiteSpace: 'nowrap', 
                  minWidth: '80px', 
                  color: 'var(--text-dark)' 
                }}>
                  {game.date}
                  <br/>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: 'normal', 
                    color: 'var(--text-light)' 
                  }}>
                    vs {game.opponent}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map(player => {
              const isCurrentPlayer = isCurrentUserRow(player.name);
              return (
                <tr key={player.id} style={{ 
                  background: isCurrentPlayer ? '#eff6ff' : 'white', 
                  borderLeft: isCurrentPlayer ? '4px solid var(--primary-color)' : 'none' 
                }}>
                  <td style={{ 
                    position: 'sticky', 
                    left: 0, 
                    background: isCurrentPlayer ? '#eff6ff' : 'white', 
                    zIndex: 10, 
                    borderBottom: '1px solid var(--border-color)', 
                    padding: '8px' 
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px' 
                    }}>
                      <div style={{ 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '50%', 
                        background: 'var(--primary-color)', 
                        color: 'white', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        flexShrink: 0 
                      }}>
                        {player.avatar}
                      </div>
                      <div>
                        <div style={{ 
                          fontWeight: '500', 
                          fontSize: '14px', 
                          color: 'var(--text-dark)' 
                        }}>
                          {player.name}
                          {isCurrentPlayer && (
                            <span style={{ 
                              fontSize: '10px', 
                              background: 'var(--primary-color)', 
                              color: 'white', 
                              padding: '2px 6px', 
                              borderRadius: '6px', 
                              marginLeft: '8px' 
                            }}>
                              You
                            </span>
                          )}
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-light)' 
                        }}>
                          {player.jersey ? `#${player.jersey}` : 'No #'}
                        </div>
                      </div>
                    </div>
                  </td>
                  {games.map(game => {
                    const key = `${player.id}-${game.id}`;
                    const status = rsvps[key] || 'none';
                    const statusInfo = RSVP_STATUS[status];
                    const canEdit = canEditRSVP(player.name);
                    
                    return (
                      <td key={game.id} style={{ 
                        borderBottom: '1px solid var(--border-color)', 
                        padding: '8px', 
                        textAlign: 'center' 
                      }}>
                        <button 
                          onClick={() => handleRSVPClick(player.id, game.id)} 
                          disabled={!canEdit}
                          title={canEdit ? 'Click to change RSVP' : 'Only captain can edit other RSVPs'}
                          style={{ 
                            width: '48px', 
                            height: '48px', 
                            borderRadius: '8px', 
                            border: 'none', 
                            fontSize: '18px', 
                            fontWeight: 'bold', 
                            color: 'white',
                            cursor: canEdit ? 'pointer' : 'not-allowed', 
                            opacity: canEdit ? 1 : 0.5, 
                            background: statusInfo.color,
                            transition: 'all 0.2s ease',
                            transform: 'scale(1)'
                          }}
                          onMouseEnter={(e) => {
                            if (canEdit) {
                              e.target.style.transform = 'scale(1.1)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.transform = 'scale(1)';
                          }}
                        >
                          {statusInfo.icon}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* RSVP Legend */}
      <div style={{ 
        marginTop: '1rem', 
        display: 'flex', 
        gap: '1rem', 
        flexWrap: 'wrap', 
        fontSize: '0.85rem',
        justifyContent: 'center' 
      }}>
        {Object.entries(RSVP_STATUS).map(([key, info]) => (
          <div key={key} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem' 
          }}>
            <span style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              background: info.color,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 'bold'
            }}>
              {info.icon}
            </span>
            <span style={{ color: 'var(--text-light)' }}>
              {info.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
