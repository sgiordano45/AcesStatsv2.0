/**
 * BattingOrderSectionMobile Component
 * Mobile-optimized version with up/down arrow buttons instead of drag-and-drop
 * 
 * Used when screen width < 768px
 */

const { useState } = React;
const { Printer, ChevronUp, ChevronDown, X, Plus } = window.lucide;

export function BattingOrderSectionMobile({
  selectedGame,
  battingOrder = [],
  availablePlayers = [],
  seasonConfig,
  onBattingOrderChange,
  onPrint,
  isCaptain,
  PlayerCard,
  isOnline = true
}) {
  
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [selectingForPosition, setSelectingForPosition] = useState(null);

  if (!selectedGame) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-light)',
        fontSize: '0.95rem'
      }}>
        Select a game to set the batting order
      </div>
    );
  }

  const movePlayer = (fromIndex, direction) => {
    if (!isCaptain) return;
    
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    
    if (toIndex < 0 || toIndex >= seasonConfig.battingOrderSize) return;
    
    const newOrder = [...battingOrder];
    [newOrder[fromIndex], newOrder[toIndex]] = [newOrder[toIndex], newOrder[fromIndex]];
    
    onBattingOrderChange(newOrder);
  };

  const removePlayer = (position) => {
    if (!isCaptain) return;
    const newOrder = [...battingOrder];
    newOrder[position] = null;
    onBattingOrderChange(newOrder);
  };

  const addPlayer = (position, player) => {
    if (!isCaptain) return;
    
    const newOrder = [...battingOrder];
    
    // Remove player from current position if they're already in order
    const currentIndex = newOrder.findIndex(p => p && p.id === player.id);
    if (currentIndex !== -1) {
      newOrder[currentIndex] = null;
    }
    
    newOrder[position] = player;
    onBattingOrderChange(newOrder);
    setShowPlayerSelector(false);
    setSelectingForPosition(null);
  };

  const availableForBatting = availablePlayers.filter(player => {
    return !battingOrder.some(p => p && p.id === player.id);
  });

  const filledCount = battingOrder.filter(p => p).length;

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* Header */}
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: '16px 16px 0 0',
        padding: '1rem',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-color)',
        borderBottom: 'none'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: 'var(--text-dark)'
          }}>
            Batting Order
          </h2>
          {onPrint && (
            <button
              onClick={onPrint}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                minHeight: '44px'
              }}
            >
              <Printer style={{ width: '16px', height: '16px' }} />
              Print
            </button>
          )}
        </div>

        {/* Progress */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          color: 'var(--text-light)'
        }}>
          <span>
            {filledCount} / {seasonConfig.battingOrderSize} batters
          </span>
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

        {/* Progress Bar */}
        <div style={{
          marginTop: '0.5rem',
          height: '6px',
          background: '#e5e7eb',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${(filledCount / seasonConfig.battingOrderSize) * 100}%`,
            height: '100%',
            background: 'var(--primary-color)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Batting Order List */}
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: '0 0 16px 16px',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {[...Array(seasonConfig.battingOrderSize)].map((_, idx) => {
          const player = battingOrder[idx];
          
          return (
            <div
              key={idx}
              style={{
                padding: '1rem',
                borderBottom: idx < seasonConfig.battingOrderSize - 1 ? '1px solid var(--border-color)' : 'none',
                background: !player ? '#f9fafb' : 'white'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                {/* Position Number */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: player ? 'var(--primary-color)' : '#d1d5db',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  flexShrink: 0
                }}>
                  {idx + 1}
                </div>

                {/* Player Info or Add Button */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {player ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}>
                      {/* Avatar */}
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

                      {/* Name and Stats */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: '600',
                          fontSize: '0.95rem',
                          color: 'var(--text-dark)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {player.name}
                        </div>
                        <div style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-light)',
                          display: 'flex',
                          gap: '0.75rem'
                        }}>
                          <span>#{player.jersey || 'N/A'}</span>
                          <span>{player.battingAvg || '.000'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectingForPosition(idx);
                        setShowPlayerSelector(true);
                      }}
                      disabled={!isCaptain}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        background: 'transparent',
                        border: '2px dashed var(--border-color)',
                        borderRadius: '8px',
                        color: 'var(--text-light)',
                        fontSize: '0.9rem',
                        cursor: isCaptain ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        minHeight: '44px'
                      }}
                    >
                      <Plus style={{ width: '18px', height: '18px' }} />
                      Add Player
                    </button>
                  )}
                </div>

                {/* Controls */}
                {player && isCaptain && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    flexShrink: 0
                  }}>
                    <button
                      onClick={() => movePlayer(idx, 'up')}
                      disabled={idx === 0}
                      style={{
                        padding: '0.25rem',
                        background: idx === 0 ? '#f3f4f6' : 'white',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        cursor: idx === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px'
                      }}
                    >
                      <ChevronUp
                        style={{
                          width: '20px',
                          height: '20px',
                          color: idx === 0 ? '#d1d5db' : 'var(--primary-color)'
                        }}
                      />
                    </button>
                    <button
                      onClick={() => movePlayer(idx, 'down')}
                      disabled={idx === seasonConfig.battingOrderSize - 1}
                      style={{
                        padding: '0.25rem',
                        background: idx === seasonConfig.battingOrderSize - 1 ? '#f3f4f6' : 'white',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        cursor: idx === seasonConfig.battingOrderSize - 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px'
                      }}
                    >
                      <ChevronDown
                        style={{
                          width: '20px',
                          height: '20px',
                          color: idx === seasonConfig.battingOrderSize - 1 ? '#d1d5db' : 'var(--primary-color)'
                        }}
                      />
                    </button>
                    <button
                      onClick={() => removePlayer(idx)}
                      style={{
                        padding: '0.25rem',
                        background: 'white',
                        border: '1px solid #fca5a5',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '36px',
                        minHeight: '36px'
                      }}
                    >
                      <X style={{ width: '20px', height: '20px', color: '#dc2626' }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Player Selector Modal */}
      {showPlayerSelector && (
        <PlayerSelectorModal
          players={availableForBatting}
          position={selectingForPosition}
          onSelect={(player) => addPlayer(selectingForPosition, player)}
          onClose={() => {
            setShowPlayerSelector(false);
            setSelectingForPosition(null);
          }}
        />
      )}

      {/* Tip */}
      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#0c4a6e'
      }}>
        <strong>💡 Tip:</strong> Use ↑↓ arrows to reorder. Tap + to add players to empty spots.
      </div>
    </div>
  );
}

// Player Selector Modal Component
function PlayerSelectorModal({ players, position, onSelect, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px 16px 0 0',
          maxHeight: '80vh',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.3s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '1.1rem',
            fontWeight: 'bold',
            color: 'var(--text-dark)'
          }}>
            Select Player for Position #{position + 1}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <X style={{ width: '24px', height: '24px', color: 'var(--text-light)' }} />
          </button>
        </div>

        {/* Player List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.5rem'
        }}>
          {players.length === 0 ? (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--text-light)',
              fontSize: '0.9rem'
            }}>
              No available players
            </div>
          ) : (
            players.map(player => (
              <button
                key={player.id}
                onClick={() => onSelect(player)}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: 'white',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  cursor: 'pointer',
                  minHeight: '72px'
                }}
              >
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

                {/* Info */}
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{
                    fontWeight: '600',
                    fontSize: '1rem',
                    color: 'var(--text-dark)',
                    marginBottom: '2px'
                  }}>
                    {player.name}
                  </div>
                  <div style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-light)',
                    display: 'flex',
                    gap: '1rem'
                  }}>
                    <span>#{player.jersey || 'N/A'}</span>
                    <span>{player.battingAvg || '.000'}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
