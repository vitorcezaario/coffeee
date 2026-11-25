import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Minus, MoveDiagonal2, Play, Plus, RotateCcw } from 'lucide-react';
import {
  formatItemDate,
  formatItemIndex,
  PortfolioItem,
} from '../data/archive';

interface ResizablePortfolioItemProps {
  item: PortfolioItem;
  index: number;
  isEditMode: boolean;
  isSaving: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onSelect: (item: PortfolioItem) => void;
  onResizeCommit: (id: number, displayWidth: number | null) => void;
}

const MIN_WIDTH_PERCENT = 18;
const MAX_WIDTH_PERCENT = 100;

function getDefaultWidthPercent(item: PortfolioItem): number {
  if (item.aspect === 'landscape') return 48;
  return 31;
}

export function ResizablePortfolioItem({
  item,
  index,
  isEditMode,
  isSaving,
  containerRef,
  onSelect,
  onResizeCommit,
}: ResizablePortfolioItemProps) {
  const defaultPercent = getDefaultWidthPercent(item);
  const persistedPercent = item.displayWidth ?? defaultPercent;

  const [livePercent, setLivePercent] = useState<number>(persistedPercent);
  const [isDragging, setIsDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const dragStateRef = useRef<{
    startX: number;
    startWidthPx: number;
    containerWidthPx: number;
    lastPercent: number;
  } | null>(null);

  useEffect(() => {
    if (!isDragging) {
      setLivePercent(item.displayWidth ?? getDefaultWidthPercent(item));
    }
  }, [item.aspect, item.displayWidth, isDragging]);

  useEffect(() => {
    setLoadFailed(false);
  }, [item.mediaUrl]);

  const computeMaxAllowedPercent = (containerWidthPx: number): number => {
    if (!naturalSize || naturalSize.w < 240 || containerWidthPx <= 0) {
      return MAX_WIDTH_PERCENT;
    }
    // Cap scaling at the file's native pixel width so it never blurs or exceeds native resolution
    const maxByResolution = Math.floor((naturalSize.w / containerWidthPx) * 100);
    return Math.max(MIN_WIDTH_PERCENT, Math.min(MAX_WIDTH_PERCENT, maxByResolution));
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const containerEl = containerRef.current;
    const containerWidthPx = containerEl ? containerEl.getBoundingClientRect().width : 1200;
    const startWidthPx = (livePercent / 100) * containerWidthPx;

    dragStateRef.current = {
      startX: event.clientX,
      startWidthPx,
      containerWidthPx,
      lastPercent: livePercent,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    const deltaX = event.clientX - drag.startX;
    const nextWidthPx = drag.startWidthPx + deltaX;
    const rawPercent = Math.round((nextWidthPx / drag.containerWidthPx) * 100);
    const maxAllowed = computeMaxAllowedPercent(drag.containerWidthPx);
    const clamped = Math.max(MIN_WIDTH_PERCENT, Math.min(maxAllowed, rawPercent));

    drag.lastPercent = clamped;
    setLivePercent(clamped);
  };

  const handleResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finalPercent = drag.lastPercent;
    dragStateRef.current = null;
    setIsDragging(false);

    if (finalPercent !== item.displayWidth) {
      onResizeCommit(item.id, finalPercent);
    }
  };

  const handleStep = (delta: number) => {
    const containerWidthPx = containerRef.current?.getBoundingClientRect().width || 1200;
    const maxAllowed = computeMaxAllowedPercent(containerWidthPx);
    const next = Math.max(MIN_WIDTH_PERCENT, Math.min(maxAllowed, livePercent + delta));
    setLivePercent(next);
    if (next !== item.displayWidth) {
      onResizeCommit(item.id, next);
    }
  };

  const handleReset = () => {
    const fallback = getDefaultWidthPercent(item);
    setLivePercent(fallback);
    if (item.displayWidth !== null) {
      onResizeCommit(item.id, null);
    }
  };

  const itemStyle = {
    '--item-w': `${livePercent}%`,
    maxWidth:
      naturalSize && naturalSize.w >= 240 ? `${naturalSize.w}px` : undefined,
  } as CSSProperties;

  return (
    <article
      style={itemStyle}
      className={`w-full sm:w-[var(--item-w)] shrink-0 ${
        isDragging ? 'select-none' : 'transition-[width] duration-150'
      }`}
    >
      <div
        className={`relative ${
          isEditMode ? 'outline-1 outline-dashed outline-[#1A3AFF] outline-offset-4' : ''
        }`}
      >
        {/* Media Frame — strictly preserves natural aspect ratio (w-full h-auto) and native resolution */}
        <div
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
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  setNaturalSize({ w: video.videoWidth, h: video.videoHeight });
                }
              }}
              className={`block w-full h-auto ${
                !isEditMode ? 'transition-opacity duration-150 group-hover:opacity-90' : ''
              }`}
            />
          ) : loadFailed ? (
            <div className="aspect-[4/3] w-full flex items-center justify-center font-mono text-xs text-[#666662]">
              {item.title || formatItemIndex(index)}
            </div>
          ) : (
            <img
              src={item.mediaUrl}
              alt={item.title || `Item ${formatItemIndex(index)}`}
              loading="lazy"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                }
              }}
              onError={() => setLoadFailed(true)}
              className={`block w-full h-auto ${
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

          {/* Edit Mode Overlay Controls (visible ONLY when admin clicked editar) */}
          {isEditMode && (
            <>
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2 pointer-events-none">
                <span className="px-2 py-1 font-mono text-[11px] bg-[#0A0A09]/85 text-[#F7F7F5] tabular-nums">
                  {livePercent}%
                  {naturalSize ? ` · ${naturalSize.w}×${naturalSize.h}` : ''}
                  {isSaving ? ' · salvando' : ''}
                </span>

                <div className="flex items-center bg-[#0A0A09]/85 text-[#F7F7F5] pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => handleStep(-6)}
                    aria-label="Diminuir tamanho"
                    className="p-1.5 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStep(6)}
                    aria-label="Aumentar tamanho"
                    className="p-1.5 hover:bg-[#1A3AFF] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  {item.displayWidth !== null && (
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

              <button
                type="button"
                aria-label="Arrastar para redimensionar respeitando a resolução"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                onPointerCancel={handleResizePointerUp}
                className="absolute bottom-0 right-0 w-7 h-7 bg-[#1A3AFF] text-[#F7F7F5] flex items-center justify-center cursor-nwse-resize touch-none hover:bg-[#111111] transition-colors"
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
