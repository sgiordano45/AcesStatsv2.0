/**
 * FieldingPositionsSection Component
 * Handles defensive position assignments across innings with drag-and-drop
 * 
 * Extracted from roster-management.html for reusability across desktop/mobile
 */

const { useState, useEffect } = React;

// Import lucide-react icons
const { Printer, Lock } = window.lucide;

export function FieldingPositionsSection({
  selectedGame,
  fieldingPositions = {},
  benchPlayers = {},
  availablePlayers = [],
  seasonConfig,
  onFieldingPositionsChange,
  onBenchPlayersChange,
  onCopyFromPreviousInning,
  onPrint,
  isCaptain,
  catcherDisabled = false,
  draggedPlayer,
  onDragStart,
  onDragEnd,
  dropTarget,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  PlayerCard,
  isOnline = true
}) {
  
  if (!selectedGame) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'var(--text-light)',
        fontSize: '14px'
      }}>
        Select a game to set defensive positions
      </div>
    );
  }

  const removeFromFielding = (inning, position) => {
    if (!isCaptain) return;
    
    const newFieldingPositions = { ...fieldingPositions };
    if (newFieldingPositions[inning]?.[position]) {
      delete newFieldingPositions[inning][position];
      onFieldingPositionsChange(newFieldingPositions);
    }
  };

  const removeFromBench = (inning, benchIndex) => {
    if (!isCaptain) return;
    
    const newBenchPlayers = { ...benchPlayers };
    if (newBenchPlayers[inning]?.[benchIndex] !== undefined) {
      newBenchPlayers[inning].splice(benchIndex, 1);
      onBenchPlayersChange(newBenchPlayers);
    }
  };

  const maxBenchSpots = seasonConfig.battingOrderSize - seasonConfig.positions.length;

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          color: 'var(--text-dark)' 
        }}>
          Defensive Positions by Inning
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!isOnline && (
            <span style={{
              fontSize: '0.85rem',
              color: '#f59e0b',
              fontWeight: '600',
              padding: '4px 12px',
              borderRadius: '12px',
              background: '#fef3c7'
            }}>
              📡 Offline
            </span>
          )}
          {onPrint && (
            <button 
              onClick={onPrint} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                padding: '0.5rem 1rem', 
                background: 'var(--primary-color)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                fontSize: '14px', 
                fontWeight: '600', 
                cursor: 'pointer', 
                transition: 'all 0.2s ease' 
              }} 
              onMouseEnter={(e) => e.target.style.background = 'var(--secondary-color)'} 
              onMouseLeave={(e) => e.target.style.background = 'var(--primary-color)'}
            >
              <Printer style={{ width: '18px', height: '18px' }} />
              Print
            </button>
          )}
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '1.5rem',
        flexWrap: 'wrap'
      }}>
        {/* Available Players Pool */}
        <div style={{ 
          minWidth: '250px', 
          maxWidth: '250px',
          flex: '0 0 250px'
        }}>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            marginBottom: '0.5rem', 
            color: 'var(--text-dark)' 
          }}>
            Available Players ({availablePlayers.length})
          </h3>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem', 
            maxHeight: '700px', 
            overflowY: 'auto', 
            padding: '0.5rem', 
            background: '#f9fafb', 
            borderRadius: '12px', 
            border: '1px solid var(--border-color)' 
          }}>
            {availablePlayers.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-light)',
                fontSize: '13px'
              }}>
                No players available.<br/>Check RSVPs.
              </div>
            ) : (
              availablePlayers.map(player => (
                <PlayerCard 
                  key={player.id} 
                  player={player} 
                  draggable={true} 
                  showStats={false} 
                />
              ))
            )}
          </div>
        </div>
        
        {/* Fielding Grid */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <div className="table-scroll-container">
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontSize: '13px',
              minWidth: '800px' 
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
                    textAlign: 'center',
                    fontWeight: '600',
                    color: 'var(--text-dark)'
                  }}>
                    Pos
                  </th>
                  {[1, 2, 3, 4, 5, 6, 7].map(inning => (
                    <th 
                      key={inning} 
                      style={{ 
                        borderBottom: '2px solid var(--border-color)', 
                        padding: '8px', 
                        textAlign: 'center', 
                        background: '#f2f2f2',
                        minWidth: '100px',
                        verticalAlign: 'top'
                      }}
                    >
                      <div style={{ marginBottom: inning > 1 ? '4px' : '0' }}>
                        Inning {inning}
                      </div>
                      {inning > 1 && onCopyFromPreviousInning && (
                        <button
                          onClick={() => onCopyFromPreviousInning(inning)}
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            background: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.background = 'var(--secondary-color)'}
                          onMouseLeave={(e) => e.target.style.background = 'var(--primary-color)'}
                          title={`Copy all players from inning ${inning - 1}`}
                        >
                          ← Copy
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Defensive Positions */}
                {seasonConfig.positions.map(position => {
                  const isCatcher = position === 'C';
                  const disabled = isCatcher && catcherDisabled;
                  
                  return (
                    <tr key={position} style={{ 
                      background: disabled ? '#f3f4f6' : 'white' 
                    }}>
                      <td style={{ 
                        position: 'sticky', 
                        left: 0, 
                        background: disabled ? '#f3f4f6' : 'white', 
                        zIndex: 10,
                        borderBottom: '1px solid var(--border-color)', 
                        padding: '8px', 
                        fontWeight: '600', 
                        textAlign: 'center' 
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '4px' 
                        }}>
                          {disabled && <Lock style={{ width: '14px', height: '14px', color: '#9ca3af' }} />}
                          <span style={{ 
                            textDecoration: disabled ? 'line-through' : 'none', 
                            color: disabled ? '#9ca3af' : 'var(--text-dark)' 
                          }}>
                            {position}
                          </span>
                        </div>
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7].map(inning => {
                        const player = fieldingPositions[inning]?.[position];
                        const isDropTarget = dropTarget?.type === 'fielding' && 
                                            dropTarget?.position === position && 
                                            dropTarget?.inning === inning;
                        
                        return (
                          <td 
                            key={inning}
                            onDragOver={disabled ? undefined : onDragOver}
                            onDragEnter={disabled ? undefined : (e) => onDragEnter(e, { type: 'fielding', position, inning })}
                            onDragLeave={onDragLeave}
                            onDrop={disabled ? undefined : (e) => onDrop(e, { type: 'fielding', position, inning })}
                            style={{ 
                              borderBottom: '1px solid var(--border-color)', 
                              padding: '4px', 
                              transition: 'all 0.3s ease',
                              background: isDropTarget && !disabled ? '#eff6ff' : 'transparent',
                              border: isDropTarget && !disabled ? '2px dashed var(--primary-color)' : '1px solid var(--border-color)',
                              cursor: disabled ? 'not-allowed' : 'default',
                              minHeight: '40px'
                            }}
                          >
                            {disabled ? (
                              <div style={{ 
                                textAlign: 'center', 
                                color: '#9ca3af', 
                                fontSize: '14px' 
                              }}>
                                —
                              </div>
                            ) : player ? (
                              <PlayerCard 
                                player={player} 
                                draggable={true} 
                                size="small"
                                onRemove={() => removeFromFielding(inning, position)} 
                              />
                            ) : (
                              <div style={{ 
                                height: '32px', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                color: '#d1d5db', 
                                fontSize: '11px',
                                fontStyle: 'italic'
                              }}>
                                Drop
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                
                {/* Bench Row Header */}
                <tr style={{ background: '#f9fafb' }}>
                  <td 
                    colSpan={8} 
                    style={{ 
                      padding: '8px', 
                      textAlign: 'center', 
                      fontWeight: '600', 
                      fontSize: '12px',
                      color: 'var(--text-light)', 
                      borderTop: '2px solid #9ca3af', 
                      borderBottom: '2px solid #9ca3af' 
                    }}
                  >
                    BENCH
                  </td>
                </tr>
                
                {/* Bench Spots */}
                {[...Array(maxBenchSpots)].map((_, benchIdx) => (
                  <tr key={`bench-${benchIdx}`} style={{ background: '#fefce8' }}>
                    <td style={{ 
                      position: 'sticky', 
                      left: 0, 
                      background: '#fefce8', 
                      zIndex: 10, 
                      borderBottom: '1px solid var(--border-color)',
                      padding: '8px', 
                      fontWeight: '600', 
                      textAlign: 'center', 
                      color: '#854d0e' 
                    }}>
                      B{benchIdx + 1}
                    </td>
                    {[1, 2, 3, 4, 5, 6, 7].map(inning => {
                      const inningBench = benchPlayers[inning] || [];
                      const benchPlayer = inningBench[benchIdx];
                      const isDropTarget = dropTarget?.type === 'bench' && 
                                          dropTarget?.inning === inning && 
                                          dropTarget?.benchIndex === benchIdx;
                      
                      return (
                        <td 
                          key={inning}
                          onDragOver={onDragOver}
                          onDragEnter={(e) => onDragEnter(e, { type: 'bench', inning, benchIndex: benchIdx })}
                          onDragLeave={onDragLeave}
                          onDrop={(e) => onDrop(e, { type: 'bench', inning, benchIndex: benchIdx })}
                          style={{ 
                            borderBottom: '1px solid var(--border-color)', 
                            padding: '4px', 
                            background: isDropTarget ? '#fef3c7' : '#fefce8',
                            border: isDropTarget ? '2px dashed #ca8a04' : '1px solid var(--border-color)',
                            transition: 'all 0.3s ease',
                            minHeight: '40px'
                          }}
                        >
                          {benchPlayer ? (
                            <PlayerCard 
                              player={benchPlayer} 
                              draggable={true} 
                              size="small"
                              onRemove={() => removeFromBench(inning, benchIdx)} 
                            />
                          ) : (
                            <div style={{ 
                              height: '32px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              color: '#d1d5db', 
                              fontSize: '11px',
                              fontStyle: 'italic'
                            }}>
                              Drop
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Helper Tips */}
      <div style={{
        marginTop: '1rem',
        padding: '0.75rem 1rem',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        fontSize: '13px',
        color: '#0c4a6e'
      }}>
        <strong>💡 Tips:</strong> Drag players to positions for each inning. Use "← Copy" to duplicate the previous inning's lineup. Players on the bench cannot be assigned defensive positions in the same inning.
      </div>
      
      {catcherDisabled && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.75rem 1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#991b1b'
        }}>
          <strong>⚠️ Notice:</strong> Catcher position disabled - need {seasonConfig.catcherMinPlayers} players minimum.
        </div>
      )}
    </div>
  );
}
