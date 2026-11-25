import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Move,
  MoveDiagonal2,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  formatItemDate,
  formatItemIndex,
  PortfolioItem,
} from '../data/archive';

export interface LayoutPatch {
  displayWidth?: number | null;
  displayHeight?: number | null;
  posX?: number | null;
  posY?: number | null;
  zIndex?: number;
}

interface ResizablePortfolioItemProps {
  item: PortfolioItem;
  index: number;
  resolvedX: number;
  resolvedY: number;
  resolvedWidth: number;
  canvasWidth: number;
  scale: number;
  isEditMode: boolean;
  isActive: boolean;
  isSaving: boolean;
  onSelectForView: (item: PortfolioItem) => void;
  onActivate: (id: number) => void;
  onBringToFront: (id: number) => void;
  onSendToBack: (id: number) => void;
  onLayoutCommit: (id: number, patch: LayoutPatch) => void;
  onMeasureBottom: (id: number, bottomPx: number) => void;
}

type InteractionMode = 'move' | 'e' | 'w' | 's' | 'se' | 'sw';

const MIN_WIDTH_PERCENT = 5;
const MAX_WIDTH_PERCENT = 100;
const MIN_HEIGHT_REF = 60;
const MAX_HEIGHT_REF = 3000;

function roundTenth(val: number): number {
  return Math.round(val * 10) / 10;
}

export function ResizablePortfolioItem({
  item,
  index,
  resolvedX,
  resolvedY,
  resolvedWidth,
  canvasWidth,
  scale,
  isEditMode,
  isActive,
  isSaving,
  onSelectForView,
  onActivate,
  onBringToFront,
  onSendToBack,
  onLayoutCommit,
  onMeasureBottom,
}: ResizablePortfolioItemProps) {
  const [liveX, setLiveX] = useState<number>(resolvedX);
  const [liveY, setLiveY] = useState<number>(resolvedY);
  const [liveWidth, setLiveWidth] = useState<number>(resolvedWidth);
  const [liveHeight, setLiveHeight] = useState<number | null>(item.displayHeight ?? null);
  const [interaction, setInteraction] = useState<InteractionMode | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const articleRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<{
    mode: InteractionMode;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeightRef: number;
    hadCustomHeight: boolean;
    lastX: number;
    lastY: number;
    lastWidth: number;
    lastHeight: number | null;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!interaction) {
      setLiveX(resolvedX);
      setLiveY(resolvedY);
      setLiveWidth(resolvedWidth);
      setLiveHeight(item.displayHeight ?? null);
    }
  }, [interaction, item.displayHeight, resolvedWidth, resolvedX, resolvedY]);

  useEffect(() => {
    setLoadFailed(false);
  }, [item.mediaUrl]);

  // Keep canvas height synced with every item's rendered bottom
  useLayoutEffect(() => {
    const el = articleRef.current;
    if (!el) return;

    const report = () => {
      const topPx = liveY * scale;
      const heightPx = el.offsetHeight;
      onMeasureBottom(item.id, topPx + heightPx);
    };

    report();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id, liveHeight, liveWidth, liveY, onMeasureBottom, scale]);

  const startInteraction = (
    mode: InteractionMode,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!isEditMode) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    onActivate(item.id);

    const safeScale = Math.max(0.2, scale);
    const renderedFrameHeight = frameRef.current?.getBoundingClientRect().height || 320;
    const currentHeightRef = liveHeight ?? Math.round(renderedFrameHeight / safeScale);

    dragRef.current = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: liveX,
      startY: liveY,
      startWidth: liveWidth,
      startHeightRef: currentHeightRef,
      hadCustomHeight: liveHeight !== null,
      lastX: liveX,
      lastY: liveY,
      lastWidth: liveWidth,
      lastHeight: liveHeight,
      moved: false,
    };

    setInteraction(mode);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;

    if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      drag.moved = true;
    }

    const safeCanvasW = Math.max(200, canvasWidth);
    const safeScale = Math.max(0.2, scale);
    const dxPercent = (dx / safeCanvasW) * 100;
    const dyRef = dy / safeScale;

    if (drag.mode === 'move') {
      const maxLeft = Math.max(0, 100 - drag.startWidth);
      const nextX = roundTenth(Math.max(0, Math.min(maxLeft, drag.startX + dxPercent)));
      const nextY = Math.max(0, Math.round(drag.startY + dyRef));

      drag.lastX = nextX;
      drag.lastY = nextY;
      setLiveX(nextX);
      setLiveY(nextY);
      return;
    }

    if (drag.mode === 'e') {
      const rawWidth = Math.round(drag.startWidth + dxPercent);
      const nextWidth = Math.max(MIN_WIDTH_PERCENT, Math.min(MAX_WIDTH_PERCENT, rawWidth));
      // Allow growing all the way up to 100% by shifting left only when hitting the right site edge
      const nextX =
        drag.startX + nextWidth > 100
          ? roundTenth(Math.max(0, 100 - nextWidth))
          : drag.startX;

      drag.lastWidth = nextWidth;
      drag.lastX = nextX;
      setLiveWidth(nextWidth);
      setLiveX(nextX);
      return;
    }

    if (drag.mode === 'w') {
      const rightEdge = Math.min(100, drag.startX + drag.startWidth);
      const rawWidth = Math.round(drag.startWidth - dxPercent);
      const maxWidthFromRight = Math.round(rightEdge);
      const nextWidth = Math.max(
        MIN_WIDTH_PERCENT,
        Math.min(Math.max(MIN_WIDTH_PERCENT, maxWidthFromRight), rawWidth),
      );
      const nextX = roundTenth(Math.max(0, rightEdge - nextWidth));

      drag.lastWidth = nextWidth;
      drag.lastX = nextX;
      setLiveWidth(nextWidth);
      setLiveX(nextX);
      return;
    }

    if (drag.mode === 's') {
      const nextHeight = Math.max(
        MIN_HEIGHT_REF,
        Math.min(MAX_HEIGHT_REF, Math.round(drag.startHeightRef + dyRef)),
      );
      drag.lastHeight = nextHeight;
      setLiveHeight(nextHeight);
      return;
    }

    if (drag.mode === 'se') {
      const rawWidth = Math.round(drag.startWidth + dxPercent);
      const nextWidth = Math.max(MIN_WIDTH_PERCENT, Math.min(MAX_WIDTH_PERCENT, rawWidth));
      const nextX =
        drag.startX + nextWidth > 100
          ? roundTenth(Math.max(0, 100 - nextWidth))
          : drag.startX;

      drag.lastWidth = nextWidth;
      drag.lastX = nextX;
      setLiveWidth(nextWidth);
      setLiveX(nextX);

      // If item has custom height, scale height proportionally with the corner drag
      if (drag.hadCustomHeight && drag.startWidth > 0) {
        const ratio = nextWidth / drag.startWidth;
        const nextHeight = Math.max(
          MIN_HEIGHT_REF,
          Math.min(MAX_HEIGHT_REF, Math.round(drag.startHeightRef * ratio)),
        );
        drag.lastHeight = nextHeight;
        setLiveHeight(nextHeight);
      }
      return;
    }

    if (drag.mode === 'sw') {
      const rightEdge = Math.min(100, drag.startX + drag.startWidth);
      const rawWidth = Math.round(drag.startWidth - dxPercent);
      const maxWidthFromRight = Math.round(rightEdge);
      const nextWidth = Math.max(
        MIN_WIDTH_PERCENT,
        Math.min(Math.max(MIN_WIDTH_PERCENT, maxWidthFromRight), rawWidth),
      );
      const nextX = roundTenth(Math.max(0, rightEdge - nextWidth));

      drag.lastWidth = nextWidth;
      drag.lastX = nextX;
      setLiveWidth(nextWidth);
      setLiveX(nextX);

      if (drag.hadCustomHeight && drag.startWidth > 0) {
        const ratio = nextWidth / drag.startWidth;
        const nextHeight = Math.max(
          MIN_HEIGHT_REF,
          Math.min(MAX_HEIGHT_REF, Math.round(drag.startHeightRef * ratio)),
        );
        drag.lastHeight = nextHeight;
        setLiveHeight(nextHeight);
      }
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const patch: LayoutPatch = {};
    if (drag.moved) {
      if (drag.mode === 'move') {
        patch.posX = drag.lastX;
        patch.posY = drag.lastY;
      } else if (drag.mode === 's') {
        patch.displayHeight = drag.lastHeight;
      } else {
        patch.displayWidth = drag.lastWidth;
        patch.posX = drag.lastX;
        if (drag.hadCustomHeight) {
          patch.displayHeight = drag.lastHeight;
        }
      }
    }

    dragRef.current = null;
    setInteraction(null);

    if (Object.keys(patch).length > 0) {
      onLayoutCommit(item.id, patch);
    }
  };

  const handleResetHeight = () => {
    setLiveHeight(null);
    onLayoutCommit(item.id, { displayHeight: null });
  };

  const topPx = Math.round(liveY * scale);
  const frameHeightPx =
    liveHeight !== null ? Math.max(40, Math.round(liveHeight * scale)) : undefined;

  const articleStyle: CSSProperties = {
    left: `${liveX}%`,
    top: `${topPx}px`,
    width: `${liveWidth}%`,
    zIndex: interaction ? 9000 : item.zIndex || 1,
  };

  const frameStyle: CSSProperties | undefined =
    frameHeightPx !== undefined ? { height: `${frameHeightPx}px` } : undefined;

  const mediaSizeClass =
    frameHeightPx !== undefined ? 'w-full h-full object-cover' : 'w-full h-auto';

  return (
    <article
      ref={articleRef}
      style={articleStyle}
      className={`group/item absolute ${
        interaction ? 'select-none' : ''
      }`}
    >
      <div
        className={`relative ${
          isEditMode
            ? interaction || isActive
              ? 'outline-2 outline-solid outline-[#1A3AFF] outline-offset-2'
              : 'outline-1 outline-dashed outline-[#1A3AFF]/55 hover:outline-[#1A3AFF] outline-offset-2'
            : ''
        }`}
      >
        <div
          ref={frameRef}
          style={frameStyle}
          role={isEditMode ? undefined : 'button'}
          tabIndex={isEditMode ? undefined : 0}
          onPointerDown={isEditMode ? (e) => startInteraction('move', e) : undefined}
          onPointerMove={isEditMode ? handlePointerMove : undefined}
          onPointerUp={isEditMode ? handlePointerUp : undefined}
          onPointerCancel={isEditMode ? handlePointerUp : undefined}
          onClick={() => {
            if (!isEditMode) onSelectForView(item);
          }}
          onKeyDown={(e) => {
            if (!isEditMode && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelectForView(item);
            }
          }}
          className={`group relative w-full overflow-hidden bg-[#EAEAE4] ${
            isEditMode
              ? interaction === 'move'
                ? 'cursor-grabbing touch-none'
                : 'cursor-grab touch-none'
              : 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]'
          }`}
        >
          {item.kind === 'video' ? (
            <video
              src={item.mediaUrl}
              muted
              playsInline
              draggable={false}
              className={`block ${mediaSizeClass} pointer-events-none select-none ${
                !isEditMode ? 'transition-opacity duration-150 group-hover:opacity-90' : ''
              }`}
            />
          ) : loadFailed ? (
            <div className="aspect-[4/3] w-full h-full flex items-center justify-center font-mono text-xs text-[#666662] select-none">
              {item.title || formatItemIndex(index)}
            </div>
          ) : (
            <img
              src={item.mediaUrl}
              alt={item.title || `Item ${formatItemIndex(index)}`}
              loading="lazy"
              draggable={false}
              onError={() => setLoadFailed(true)}
              className={`block ${mediaSizeClass} pointer-events-none select-none ${
                !isEditMode ? 'transition-opacity duration-150 group-hover:opacity-90' : ''
              }`}
            />
          )}

          {item.kind === 'video' && item.duration && !isEditMode && (
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] bg-[#0A0A09]/85 text-[#F7F7F5] border border-white/15 tabular-nums">
              <Play className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
              <span>{item.duration}</span>
            </span>
          )}

          {/* Freeform Spatial Edit Overlay (visible ONLY in Edit Mode) */}
          {isEditMode && (
            <>
              {/* Compact top bar — hover/active revealed so images stay clean */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className={`absolute top-2 left-2 right-2 z-20 flex items-center justify-between gap-1.5 pointer-events-none transition-opacity duration-150 ${
                  interaction || isActive || isSaving
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/item:opacity-100'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] bg-[#0A0A09]/85 text-[#F7F7F5] tabular-nums">
                  <Move className="w-2.5 h-2.5" aria-hidden="true" />
                  <span>
                    {liveWidth}%{liveHeight !== null ? ` × ${liveHeight}` : ''}
                    {isSaving ? ' · salvando' : ''}
                  </span>
                </span>

                <div className="flex items-center bg-[#0A0A09]/85 text-[#F7F7F5] pointer-events-auto">
                  <button
                    type="button"
                    title="Trazer para frente"
                    aria-label="Trazer para frente"
                    onClick={(e) => {
                      e.stopPropagation();
                      onBringToFront(item.id);
                    }}
                    className="p-1.5 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                  >
                    <ArrowUpToLine className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    title="Enviar para trás"
                    aria-label="Enviar para trás"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendToBack(item.id);
                    }}
                    className="p-1.5 border-l border-white/15 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                  >
                    <ArrowDownToLine className="w-3 h-3" />
                  </button>
                  {liveHeight !== null && (
                    <button
                      type="button"
                      title="Restaurar proporção original"
                      aria-label="Restaurar proporção original"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetHeight();
                      }}
                      className="p-1.5 border-l border-white/15 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Left edge handle — free width resize from left */}
              <button
                type="button"
                aria-label="Arrastar borda esquerda para ajustar largura"
                onPointerDown={(e) => startInteraction('w', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="group/edge absolute top-9 bottom-7 left-0 z-20 w-3 flex items-center justify-start cursor-ew-resize touch-none"
              >
                <span className="w-1 h-10 bg-[#1A3AFF]/75 group-hover/edge:bg-[#1A3AFF] group-hover/edge:w-1.5 transition-all" />
              </button>

              {/* Right edge handle — free width resize from right */}
              <button
                type="button"
                aria-label="Arrastar borda direita para ajustar largura"
                onPointerDown={(e) => startInteraction('e', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="group/edge absolute top-9 bottom-7 right-0 z-20 w-3 flex items-center justify-end cursor-ew-resize touch-none"
              >
                <span className="w-1 h-10 bg-[#1A3AFF]/75 group-hover/edge:bg-[#1A3AFF] group-hover/edge:w-1.5 transition-all" />
              </button>

              {/* Bottom edge handle — free height resize */}
              <button
                type="button"
                aria-label="Arrastar borda inferior para ajustar altura"
                onPointerDown={(e) => startInteraction('s', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="group/edge absolute bottom-0 left-7 right-7 z-20 h-3 flex items-end justify-center cursor-ns-resize touch-none"
              >
                <span className="h-1 w-10 bg-[#1A3AFF]/75 group-hover/edge:bg-[#1A3AFF] group-hover/edge:h-1.5 transition-all" />
              </button>

              {/* Bottom-left corner handle — free proportional resize from left */}
              <button
                type="button"
                aria-label="Arrastar canto inferior esquerdo para redimensionar"
                onPointerDown={(e) => startInteraction('sw', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute bottom-0 left-0 z-30 w-5 h-5 bg-[#1A3AFF]/90 hover:bg-[#111111] text-[#F7F7F5] flex items-center justify-center cursor-nesw-resize touch-none transition-colors"
              >
                <span className="w-1.5 h-1.5 bg-[#F7F7F5]" />
              </button>

              {/* Bottom-right corner handle — free proportional resize up to 100% */}
              <button
                type="button"
                aria-label="Arrastar canto inferior direito para redimensionar"
                onPointerDown={(e) => startInteraction('se', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute bottom-0 right-0 z-30 w-6 h-6 bg-[#1A3AFF] hover:bg-[#111111] text-[#F7F7F5] flex items-center justify-center cursor-nwse-resize touch-none transition-colors"
              >
                <MoveDiagonal2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {item.title && (
          <div className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[11px] pointer-events-none select-none">
            <span className="text-[#111111] truncate">{item.title}</span>
            <span className="text-[#666662] tabular-nums shrink-0">
              {formatItemDate(item.createdAt)}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
