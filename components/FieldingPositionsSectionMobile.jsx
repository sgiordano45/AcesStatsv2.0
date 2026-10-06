/**
 * FieldingPositionsSectionMobile Component
 * Mobile-optimized inning-by-inning view with swipe navigation
 * 
 * Shows one inning at a time instead of full grid
 * Used when screen width < 768px
 */

const { useState, useEffect } = React;
const { ChevronLeft, ChevronRight, Copy, Plus, X } = window.lucide;

export function FieldingPositionsSectionMobile({
  selectedGame,
  fieldingPositions = {},
  benchPlayers = {},
  availablePlayers = [],
  seasonConfig,
  onFieldingPositionsChange,
  onBenchPlayersChange,
  onCopyFromPreviousInning,
  isCaptain,
  catcherDisabled = false,
  isOnline = true
}) {
  const [currentInning, setCurrentInning] = useState(1);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);
  const [selectingFor, setSelectingFor] = useState(null); // {type: 'fielding'|'bench', position: string, benchIndex: number}
  
  const totalInnings = 7;

  if (!selectedGame) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-light)',
        fontSize: '0.95rem'
      }}>
        Select a game to set defensive positions
      </div>
    );
  }

  const goToPreviousInning = () => {
    if (currentInning > 1) setCurrentInning(currentInning - 1);
  };

  const goToNextInning = () => {
    if (currentInning < totalInnings) setCurrentInning(currentInning + 1);
  };

  const copyFromPrevious = () => {
    if (currentInning > 1 && onCopyFromPreviousInning) {
      onCopyFromPreviousInning(currentInning);
    }
  };

  const assignPlayer = (player) => {
    if (!isCaptain || !selectingFor) return;

    if (selectingFor.type === 'fielding') {
      const newPositions = { ...fieldingPositions };
      if (!newPositions[currentInning]) newPositions[currentInning] = {};
      
      // Remove player from other positions in this inning
      Object.keys(newPositions[currentInning]).forEach(pos => {
        if (newPositions[currentInning][pos]?.id === player.id) {
          delete newPositions[currentInning][pos];
        }
      });
      
      newPositions[currentInning][selectingFor.position] = player;
      onFieldingPositionsChange(newPositions);
      
    } else if (selectingFor.type === 'bench') {
      const newBench = { ...benchPlayers };
      if (!newBench[currentInning]) newBench[currentInning] = [];
      
      // Remove from other bench spots
      newBench[currentInning] = newBench[currentInning].filter(p => p.id !== player.id);
      
      // Add to specified bench index
      newBench[currentInning].splice(selectingFor.benchIndex, 0, player);
      onBenchPlayersChange(newBench);
    }

    setShowPlayerSelector(false);
    setSelectingFor(null);
  };

  const removePlayer = (type, position, benchIndex) => {
    if (!isCaptain) return;

    if (type === 'fielding') {
      const newPositions = { ...fieldingPositions };
      if (newPositions[currentInning]?.[position]) {
        delete newPositions[currentInning][position];
        onFieldingPositionsChange(newPositions);
      }
    } else if (type === 'bench') {
      const newBench = { ...benchPlayers };
      if (newBench[currentInning]?.[benchIndex] !== undefined) {
        newBench[currentInning].splice(benchIndex, 1);
        onBenchPlayersChange(newBench);
      }
    }
  };

  const currentFielding = fieldingPositions[currentInning] || {};
  const currentBench = benchPlayers[currentInning] || [];
  const maxBenchSpots = seasonConfig.battingOrderSize - seasonConfig.positions.length;

  // Filter available players (not assigned in current inning)
  const assignedPlayerIds = [
    ...Object.values(currentFielding).map(p => p?.id).filter(Boolean),
    ...currentBench.map(p => p?.id).filter(Boolean)
  ];
  const availableForSelection = availablePlayers.filter(p => !assignedPlayerIds.includes(p.id));

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* Header with Navigation */}
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: '16px 16px 0 0',
        padding: '1rem',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-color)',
        borderBottom: 'none'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: 'var(--text-dark)'
          }}>
            Defensive Positions
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

        {/* Inning Navigator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '0.75rem'
        }}>
          <button
            onClick={goToPreviousInning}
            disabled={currentInning === 1}
            style={{
              padding: '0.5rem',
              background: currentInning === 1 ? '#f3f4f6' : 'white',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: currentInning === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              minWidth: '44px',
              minHeight: '44px',
              justifyContent: 'center'
            }}
          >
            <ChevronLeft
              style={{
                width: '24px',
                height: '24px',
                color: currentInning === 1 ? '#d1d5db' : 'var(--primary-color)'
              }}
            />
          </button>

          <div style={{
            flex: 1,
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: 'var(--text-dark)'
            }}>
              Inning {currentInning}
            </div>
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--text-light)',
              marginTop: '2px'
            }}>
              of {totalInnings}
            </div>
          </div>

          <button
            onClick={goToNextInning}
            disabled={currentInning === totalInnings}
            style={{
              padding: '0.5rem',
              background: currentInning === totalInnings ? '#f3f4f6' : 'white',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: currentInning === totalInnings ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              minWidth: '44px',
              minHeight: '44px',
              justifyContent: 'center'
            }}
          >
            <ChevronRight
              style={{
                width: '24px',
                height: '24px',
                color: currentInning === totalInnings ? '#d1d5db' : 'var(--primary-color)'
              }}
            />
          </button>
        </div>

        {/* Copy from Previous Button */}
        {currentInning > 1 && isCaptain && (
          <button
            onClick={copyFromPrevious}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              minHeight: '44px'
            }}
          >
            <Copy style={{ width: '18px', height: '18px' }} />
            Copy from Inning {currentInning - 1}
          </button>
        )}

        {/* Inning Dots */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginTop: '0.75rem'
        }}>
          {[...Array(totalInnings)].map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentInning(idx + 1)}
              style={{
                width: currentInning === idx + 1 ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: currentInning === idx + 1 ? 'var(--primary-color)' : '#d1d5db',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: 0
              }}
            />
          ))}
        </div>
      </div>

      {/* Positions List */}
      <div style={{
        background: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-color)',
        borderTop: 'none',
        borderBottom: 'none'
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: '#f9fafb',
          borderBottom: '1px solid var(--border-color)',
          fontWeight: '600',
          fontSize: '0.9rem',
          color: 'var(--text-dark)'
        }}>
          Defensive Positions
        </div>

        {seasonConfig.positions.map(position => {
          const isCatcher = position === 'C';
          const disabled = isCatcher && catcherDisabled;
          const player = currentFielding[position];

          return (
            <PositionSlot
              key={position}
              label={position}
              player={player}
              disabled={disabled}
              onAdd={() => {
                setSelectingFor({ type: 'fielding', position });
                setShowPlayerSelector(true);
              }}
              onRemove={() => removePlayer('fielding', position)}
              isCaptain={isCaptain}
            />
          );
        })}
      </div>

      {/* Bench Section */}
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: '0 0 16px 16px',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: '#fefce8',
          borderBottom: '1px solid var(--border-color)',
          fontWeight: '600',
          fontSize: '0.9rem',
          color: '#854d0e'
        }}>
          Bench
        </div>

        {[...Array(maxBenchSpots)].map((_, benchIdx) => {
          const player = currentBench[benchIdx];

          return (
            <PositionSlot
              key={`bench-${benchIdx}`}
              label={`B${benchIdx + 1}`}
              player={player}
              onAdd={() => {
                setSelectingFor({ type: 'bench', benchIndex: benchIdx });
                setShowPlayerSelector(true);
              }}
              onRemove={() => removePlayer('bench', null, benchIdx)}
              isCaptain={isCaptain}
              benchStyle={true}
            />
          );
        })}
      </div>

      {/* Player Selector Modal */}
      {showPlayerSelector && (
        <PlayerSelectorModal
          players={availableForSelection}
          selectingFor={selectingFor}
          onSelect={assignPlayer}
          onClose={() => {
            setShowPlayerSelector(false);
            setSelectingFor(null);
          }}
        />
      )}

      {/* Tips */}
      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#0c4a6e'
      }}>
        <strong>💡 Tip:</strong> Swipe left/right or use arrows to navigate innings. Tap "Copy" to duplicate the previous inning's lineup.
      </div>

      {catcherDisabled && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.75rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          fontSize: '0.8rem',
          color: '#991b1b'
        }}>
          <strong>⚠️ Notice:</strong> Catcher position disabled - need {seasonConfig.catcherMinPlayers} players minimum.
        </div>
      )}
    </div>
  );
}

// Position Slot Component
function PositionSlot({ label, player, disabled, onAdd, onRemove, isCaptain, benchStyle = false }) {
  return (
    <div style={{
      padding: '1rem',
      borderBottom: '1px solid var(--border-color)',
      background: disabled ? '#f3f4f6' : (benchStyle ? '#fefce8' : 'white'),
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      minHeight: '72px'
    }}>
      {/* Position Label */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        background: disabled ? '#e5e7eb' : (benchStyle ? '#fcd34d' : 'var(--primary-color)'),
        color: disabled ? '#9ca3af' : (benchStyle ? '#854d0e' : 'white'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.95rem',
        fontWeight: '700',
        flexShrink: 0,
        textDecoration: disabled ? 'line-through' : 'none'
      }}>
        {label}
      </div>

      {/* Player or Add Button */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {disabled ? (
          <div style={{
            fontSize: '0.9rem',
            color: '#9ca3af',
            fontStyle: 'italic'
          }}>
            Position disabled
          </div>
        ) : player ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--primary-color)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: '600',
              flexShrink: 0
            }}>
              {player.avatar || player.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: '600',
                fontSize: '0.9rem',
                color: 'var(--text-dark)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {player.name}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-light)'
              }}>
                #{player.jersey || 'N/A'}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={onAdd}
            disabled={!isCaptain}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'transparent',
              border: '2px dashed var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-light)',
              fontSize: '0.85rem',
              cursor: isCaptain ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              minHeight: '44px'
            }}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            Add Player
          </button>
        )}
      </div>

      {/* Remove Button */}
      {player && isCaptain && (
        <button
          onClick={onRemove}
          style={{
            padding: '0.5rem',
            background: 'white',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '44px',
            minHeight: '44px',
            flexShrink: 0
          }}
        >
          <X style={{ width: '20px', height: '20px', color: '#dc2626' }} />
        </button>
      )}
    </div>
  );
}

// Player Selector Modal (same as batting order)
function PlayerSelectorModal({ players, selectingFor, onSelect, onClose }) {
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
        justifyContent: 'center'
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
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            {selectingFor?.type === 'fielding' 
              ? `Select Player for ${selectingFor.position}`
              : `Select Player for Bench`
            }
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
                    color: 'var(--text-light)'
                  }}>
                    #{player.jersey || 'N/A'}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
