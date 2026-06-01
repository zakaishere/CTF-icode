"use client";

interface DragHandleProps {
  direction: 'horizontal' | 'vertical';
  onMouseDown: (e: React.MouseEvent) => void;
}

export function DragHandle({ direction, onMouseDown }: DragHandleProps) {
  const isH = direction === 'horizontal';

  return (
    <div
      onMouseDown={onMouseDown}
      data-dir={direction}
      style={{
        flexShrink: 0,
        width:      isH ? 5   : '100%',
        height:     isH ? '100%' : 5,
        cursor:     isH ? 'col-resize' : 'row-resize',
        background: 'transparent',
        position:   'relative',
        zIndex:     10,
        transition: 'background 0.15s',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className="drag-handle"
    >
      {/* Visual indicator dots in center */}
      <div
        style={{
          width:        isH ? 3 : 32,
          height:       isH ? 32 : 3,
          borderRadius: 10,
          background:   'var(--border)',
          transition:   'background 0.15s, transform 0.15s',
        }}
        className="drag-handle-bar"
      />
    </div>
  );
}
