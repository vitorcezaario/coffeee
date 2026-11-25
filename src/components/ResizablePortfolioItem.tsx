import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  MoveDiagonal2,
  Play,
  Plus,
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
}

interface ResizablePortfolioItemProps {
  item: PortfolioItem;
  index: number;
  canMovePrev: boolean;
  canMoveNext: boolean;
  isEditMode: boolean;
  isSaving: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onSelect: (item: PortfolioItem) => void;
  onResizeCommit: (id: number, patch: LayoutPatch) => void;
  onMove: (direction: -1 | 1) => void;
}

type ResizeAxis = 'x' | 'y' | 'xy';

const MIN_WIDTH_PERCENT = 10;
const MAX_WIDTH_PERCENT = 100;
const MIN_HEIGHT_PX = 100;
const MAX_HEIGHT_PX = 1200;

function getDefaultWidthPercent(item: PortfolioItem): number {
  if (item.aspect === 'landscape') return 48;
  return 31;
}

export function ResizablePortfolioItem({
  item,
  index,
  canMovePrev,
  canMoveNext,
  isEditMode,
  isSaving,
  containerRef,
  onSelect,
  onResizeCommit,
  onMove,
}: ResizablePortfolioItemProps) {
  const defaultPercent = getDefaultWidthPercent(item);
  const persistedPercent = item.displayWidth ?? defaultPercent;

  const [livePercent, setLivePercent] = useState<number>(persistedPercent);
  const [liveHeight, setLiveHeight] = useState<number | null>(item.displayHeight ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    axis: ResizeAxis;
    startX: number;
    startY: number;
    startWidthPx: number;
    startHeightPx: number;
    containerWidthPx: number;
    lastPercent: number;
    lastHeight: number | null;
  } | null>(null);

  useEffect(() => {
    if (!isDragging) {
      setLivePercent(item.displayWidth ?? getDefaultWidthPercent(item));
      setLiveHeight(item.displayHeight ?? null);
    }
  }, [item.aspect, item.displayHeight, item.displayWidth, isDragging]);

  useEffect(() => {
    setLoadFailed(false);
  }, [item.mediaUrl]);

  const startResizeDrag = (
    axis: ResizeAxis,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const containerEl = containerRef.current;
    const containerWidthPx = containerEl ? containerEl.getBoundingClientRect().width : 1200;
    const startWidthPx = (livePercent / 100) * containerWidthPx;
    const currentFrameHeight =
      liveHeight ??
      Math.round(frameRef.current?.getBoundingClientRect().height || 360);

    dragStateRef.current = {
      axis,
      startX: event.clientX,
      startY: event.clientY,
      startWidthPx,
      startHeightPx: currentFrameHeight,
      containerWidthPx,
      lastPercent: livePercent,
      lastHeight: axis === 'x' ? liveHeight : currentFrameHeight,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    if (drag.axis === 'x' || drag.axis === 'xy') {
      const deltaX = event.clientX - drag.startX;
      const nextWidthPx = drag.startWidthPx + deltaX;
      const rawPercent = Math.round((nextWidthPx / drag.containerWidthPx) * 100);
      const clampedPercent = Math.max(
        MIN_WIDTH_PERCENT,
        Math.min(MAX_WIDTH_PERCENT, rawPercent),
      );
      drag.lastPercent = clampedPercent;
      setLivePercent(clampedPercent);
    }

    if (drag.axis === 'y' || drag.axis === 'xy') {
      const deltaY = event.clientY - drag.startY;
      const nextHeightPx = Math.round(drag.startHeightPx + deltaY);
      const clampedHeight = Math.max(
        MIN_HEIGHT_PX,
        Math.min(MAX_HEIGHT_PX, nextHeightPx),
      );
      drag.lastHeight = clampedHeight;
      setLiveHeight(clampedHeight);
    }
  };

  const handleResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const patch: LayoutPatch = {};
    if ((drag.axis === 'x' || drag.axis === 'xy') && drag.lastPercent !== item.displayWidth) {
      patch.displayWidth = drag.lastPercent;
    }
    if ((drag.axis === 'y' || drag.axis === 'xy') && drag.lastHeight !== item.displayHeight) {
      patch.displayHeight = drag.lastHeight;
    }

    dragStateRef.current = null;
    setIsDragging(false);

    if (patch.displayWidth !== undefined || patch.displayHeight !== undefined) {
      onResizeCommit(item.id, patch);
    }
  };

  const handleWidthStep = (delta: number) => {
    const next = Math.max(
      MIN_WIDTH_PERCENT,
      Math.min(MAX_WIDTH_PERCENT, livePercent + delta),
    );
    setLivePercent(next);
    if (next !== item.displayWidth) {
      onResizeCommit(item.id, { displayWidth: next });
    }
  };

  const handleReset = () => {
    const fallback = getDefaultWidthPercent(item);
    setLivePercent(fallback);
    setLiveHeight(null);
    if (item.displayWidth !== null || item.displayHeight !== null) {
      onResizeCommit(item.id, { displayWidth: null, displayHeight: null });
    }
  };

  const hasCustomLayout =
    item.displayWidth !== null || item.displayHeight !== null;

  const itemStyle = {
    '--item-w': `${livePercent}%`,
  } as CSSProperties;

  const frameStyle: CSSProperties | undefined =
    liveHeight !== null ? { height: `${liveHeight}px` } : undefined;

  const mediaSizeClass =
    liveHeight !== null ? 'w-full h-full object-cover' : 'w-full h-auto';

  return (
    <article
      style={itemStyle}
      className={`${
        isEditMode ? 'w-[var(--item-w)]' : 'w-full sm:w-[var(--item-w)]'
      } max-w-full shrink-0 ${
        isDragging ? 'select-none' : 'transition-[width] duration-150'
      }`}
    >
      <div
        className={`relative ${
          isEditMode ? 'outline-1 outline-dashed outline-[#1A3AFF] outline-offset-4' : ''
        }`}
      >
        <div
          ref={frameRef}
          style={frameStyle}
          role={isEditMode ? undefined : 'button'}
          tabIndex={isEditMode ? undefined : 0}
          onClick={() => {
            if (!isEditMode) onSelect(item);
          }}
          onKeyDown={(e) => {
            if (!isEditMode && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onSelect(item);
            }
          }}
          className={`group relative w-full overflow-hidden bg-[#EAEAE4] ${
            isEditMode
              ? 'cursor-default'
              : 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]'
          }`}
        >
          {item.kind === 'video' ? (
            <video
              src={item.mediaUrl}
              muted
              playsInline
              className={`block ${mediaSizeClass} ${
                !isEditMode ? 'transition-opacity duration-150 group-hover:opacity-90' : ''
              }`}
            />
          ) : loadFailed ? (
            <div className="aspect-[4/3] w-full h-full flex items-center justify-center font-mono text-xs text-[#666662]">
              {item.title || formatItemIndex(index)}
            </div>
          ) : (
            <img
              src={item.mediaUrl}
              alt={item.title || `Item ${formatItemIndex(index)}`}
              loading="lazy"
              onError={() => setLoadFailed(true)}
              className={`block ${mediaSizeClass} ${
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

          {/* Free Edit Mode Controls (visible ONLY when admin clicked editar) */}
          {isEditMode && (
            <>
              <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
                <div className="flex items-center bg-[#0A0A09]/85 text-[#F7F7F5] pointer-events-auto">
                  <button
                    type="button"
                    disabled={!canMovePrev}
                    onClick={() => onMove(-1)}
                    aria-label="Mover para antes"
                    className="p-1.5 hover:bg-[#1A3AFF] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={!canMoveNext}
                    onClick={() => onMove(1)}
                    aria-label="Mover para depois"
                    className="p-1.5 border-r border-white/15 hover:bg-[#1A3AFF] disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <span className="px-2 py-1 font-mono text-[11px] tabular-nums">
                    {livePercent}%
                    {liveHeight !== null ? ` × ${liveHeight}px` : ''}
                    {isSaving ? ' · salvando' : ''}
                  </span>
                </div>

                <div className="flex items-center bg-[#0A0A09]/85 text-[#F7F7F5] pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => handleWidthStep(-5)}
                    aria-label="Diminuir largura"
                    className="p-1.5 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWidthStep(5)}
                    aria-label="Aumentar largura"
                    className="p-1.5 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  {hasCustomLayout && (
                    <button
                      type="button"
                      onClick={handleReset}
                      aria-label="Restaurar tamanho padrão"
                      className="p-1.5 border-l border-white/15 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right edge handle — free width resize (10% to 100%) */}
              <button
                type="button"
                aria-label="Arrastar borda direita para ajustar largura"
                onPointerDown={(e) => startResizeDrag('x', e)}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                className="group/edge absolute top-10 bottom-7 right-0 z-10 w-3 flex items-center justify-end cursor-ew-resize touch-none"
              >
                <span className="w-1 h-10 bg-[#1A3AFF]/80 group-hover/edge:bg-[#1A3AFF] group-hover/edge:w-1.5 transition-all" />
              </button>

              {/* Bottom edge handle — free height resize (100px to 1200px) */}
              <button
                type="button"
                aria-label="Arrastar borda inferior para ajustar altura"
                onPointerDown={(e) => startResizeDrag('y', e)}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                className="group/edge absolute bottom-0 left-0 right-7 z-10 h-3 flex items-end justify-center cursor-ns-resize touch-none"
              >
                <span className="h-1 w-10 bg-[#1A3AFF]/80 group-hover/edge:bg-[#1A3AFF] group-hover/edge:h-1.5 transition-all" />
              </button>

              {/* Bottom-right corner handle — free 2D width + height resize */}
              <button
                type="button"
                aria-label="Arrastar canto para redimensionar largura e altura livremente"
                onPointerDown={(e) => startResizeDrag('xy', e)}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                className="absolute bottom-0 right-0 z-20 w-7 h-7 bg-[#1A3AFF] text-[#F7F7F5] flex items-center justify-center cursor-nwse-resize touch-none hover:bg-[#111111] transition-colors"
              >
                <MoveDiagonal2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {item.title && (
          <div className="mt-2.5 flex items-baseline justify-between gap-3 font-mono text-[11px]">
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
