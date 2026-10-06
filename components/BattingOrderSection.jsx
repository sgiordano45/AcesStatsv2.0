/**
 * BattingOrderSection Component
 * Handles batting order management with drag-and-drop functionality
 * 
 * Extracted from roster-management.html for reusability across desktop/mobile
 */

const { useState, useEffect } = React;

// Import lucide-react icons
const { Printer } = window.lucide;

export function BattingOrderSection({
  selectedGame,
  battingOrder = [],
  availablePlayers = [],
  seasonConfig,
  onBattingOrderChange,
  onPrint,
  isCaptain,
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
        Select a game to set the batting order
      </div>
    );
  }

  const removeFromBatting = (position) => {
    if (!isCaptain) return;
    
    const newBattingOrder = [...battingOrder];
    newBattingOrder[position] = null;
    onBattingOrderChange(newBattingOrder);
  };

  const availableForBatting = availablePlayers.filter(player => {
    return !battingOrder.some(p => p && p.id === player.id);
  });

  return (
    <div style={{ marginBottom: '2rem' }}>
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
          Batting Order
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

      <p style={{ 
        fontSize: '14px', 
        color: 'var(--text-light)', 
        marginBottom: '1rem' 
      }}>
        {seasonConfig.name} allows up to {seasonConfig.battingOrderSize} batters. Drag players from the available list.
      </p>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '1.5rem',
        '@media (max-width: 768px)': {
          gridTemplateColumns: '1fr'
        }
      }}>
        {/* Batting Order Lineup */}
        <div>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            marginBottom: '0.5rem', 
            color: 'var(--text-dark)' 
          }}>
            Lineup ({battingOrder.filter(p => p).length}/{seasonConfig.battingOrderSize})
          </h3>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem' 
          }}>
            {[...Array(seasonConfig.battingOrderSize)].map((_, idx) => {
              const player = battingOrder[idx];
              const isDropTarget = dropTarget?.type === 'batting' && dropTarget?.position === idx;
              
              return (
                <div 
                  key={idx}
                  onDragOver={onDragOver}
                  onDragEnter={(e) => onDragEnter(e, { type: 'batting', position: idx })}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, { type: 'batting', position: idx })}
                  style={{ 
                    padding: '12px', 
                    borderRadius: '12px', 
                    border: isDropTarget ? '2px dashed var(--primary-color)' : '1px solid var(--border-color)',
                    background: isDropTarget ? '#eff6ff' : (!player ? '#f9fafb' : 'var(--card-bg)'), 
                    transition: 'all 0.3s ease',
                    minHeight: '60px'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px' 
                  }}>
                    <span style={{ 
                      fontWeight: 'bold', 
                      color: 'var(--text-light)', 
                      width: '24px',
                      fontSize: '16px'
                    }}>
                      {idx + 1}.
                    </span>
                    {player ? (
                      <div style={{ flex: 1 }}>
                        <PlayerCard 
                          player={player} 
                          draggable={true} 
                          showStats={true}
                          onRemove={() => removeFromBatting(idx)} 
                        />
                      </div>
                    ) : (
                      <span style={{ 
                        color: 'var(--text-light)', 
                        fontSize: '14px',
                        fontStyle: 'italic'
                      }}>
                        Drag player here
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Available Players Pool */}
        <div>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            marginBottom: '0.5rem', 
            color: 'var(--text-dark)' 
          }}>
            Available Players ({availableForBatting.length})
          </h3>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem', 
            maxHeight: '600px', 
            overflowY: 'auto',
            padding: '0.5rem',
            background: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            {availableForBatting.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-light)',
                fontSize: '14px'
              }}>
                All players assigned to batting order
              </div>
            ) : (
              availableForBatting.map(player => (
                <PlayerCard 
                  key={player.id} 
                  player={player} 
                  draggable={true} 
                  showStats={true} 
                />
              ))
            )}
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
        <strong>💡 Tip:</strong> Drag and drop players to reorder the lineup. Click the ✕ to remove a player from the order.
      </div>
    </div>
  );
}
