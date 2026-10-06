/**
 * DragDropProvider
 * Shared drag-and-drop state and handlers for roster management components
 * 
 * This centralizes drag-and-drop logic to be shared across:
 * - BattingOrderSection
 * - FieldingPositionsSection
 */

const { useState, createContext, useContext } = React;

const DragDropContext = createContext(null);

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within DragDropProvider');
  }
  return context;
}

export function DragDropProvider({ children, isCaptain = false }) {
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const handleDragStart = (e, player) => {
    if (!isCaptain) return;
    e.stopPropagation();
    setDraggedPlayer(player);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', player.id);
  };

  const handleDragEnd = () => {
    setDraggedPlayer(null);
    setDropTarget(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, target) => {
    e.preventDefault();
    setDropTarget(target);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const value = {
    draggedPlayer,
    dropTarget,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    setDraggedPlayer,
    setDropTarget
  };

  return (
    <DragDropContext.Provider value={value}>
      {children}
    </DragDropContext.Provider>
  );
}
