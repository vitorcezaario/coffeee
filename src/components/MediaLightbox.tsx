import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { ArchiveItem } from '../data/archive';
import { SafeImage } from './SafeImage';

interface MediaLightboxProps {
  item: ArchiveItem | null;
  items: ArchiveItem[];
  onClose: () => void;
  onSelect: (item: ArchiveItem) => void;
  onDelete?: (id: string) => void;
}

export function MediaLightbox({
  item,
  items,
  onClose,
  onSelect,
  onDelete,
}: MediaLightboxProps) {
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const currentIndex = item ? items.findIndex((entry) => entry.id === item.id) : -1;

  const goPrev = () => {
    if (items.length <= 1 || currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + items.length) % items.length;
    onSelect(items[prevIndex]);
  };

  const goNext = () => {
    if (items.length <= 1 || currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % items.length;
    onSelect(items[nextIndex]);
  };

  useEffect(() => {
    setIsPlayingPreview(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0A0A09] text-[#F7F7F5] flex flex-col justify-between"
      role="dialog"
      aria-modal="true"
      aria-label={item.filename}
      onClick={onClose}
    >
      {/* Top minimal bar */}
      <div
        className="px-5 md:px-8 h-14 flex items-center justify-between gap-4 border-b border-white/10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-mono text-xs text-white/80 tabular-nums truncate">
          {item.filename}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="font-mono text-xs text-white/50 tabular-nums">
            {String(currentIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Unobstructed darkroom media frame */}
      <div
        className="flex-1 relative flex items-center justify-center p-4 md:p-10 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === 'video' && item.videoUrl ? (
          <video
            key={item.videoUrl}
            src={item.videoUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full object-contain bg-black"
          />
        ) : item.imageUrl ? (
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <SafeImage
              src={item.imageUrl}
              alt={item.title}
              fallbackLabel={item.filename}
              className={`max-w-full max-h-[72vh] object-contain transition-transform duration-700 ease-out ${
                isPlayingPreview ? 'scale-[1.02]' : 'scale-100'
              }`}
            />
          </div>
        ) : (
          <div
            role="img"
            aria-label={item.title}
            style={{ backgroundColor: item.swatchColor }}
            className={`relative border border-white/10 transition-transform duration-500 ease-out ${
              item.aspect === 'landscape'
                ? 'w-full max-w-3xl aspect-[16/10]'
                : item.aspect === 'square'
                  ? 'w-full max-w-lg aspect-square'
                  : 'h-[68vh] aspect-[3/4] max-w-full'
            } ${isPlayingPreview ? 'scale-[1.015]' : 'scale-100'}`}
          >
            {item.kind === 'video' && (
              <button
                type="button"
                onClick={() => setIsPlayingPreview((prev) => !prev)}
                className="absolute bottom-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 font-mono text-xs bg-[#0A0A09]/85 text-white border border-white/25 hover:border-white transition-colors cursor-pointer"
              >
                {isPlayingPreview ? (
                  <>
                    <Pause className="w-3 h-3" aria-hidden="true" />
                    <span>pausar · {item.duration}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" aria-hidden="true" />
                    <span>vídeo · {item.duration}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Anterior"
              className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Próximo"
              className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {/* Bottom single-line raw archival caption */}
      <div
        className="px-5 md:px-8 py-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-sm text-white/95 truncate">{item.note}</p>
          <p className="mt-1 font-mono text-xs text-white/55 tabular-nums">
            {item.format} · {item.location} · {item.date}
            {item.duration ? ` · ${item.duration}` : ''}
          </p>
        </div>

        {item.isUserUpload && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="font-mono text-xs text-white/60 hover:text-white underline underline-offset-4 cursor-pointer self-start sm:self-auto shrink-0"
          >
            apagar registro
          </button>
        )}
      </div>
    </div>
  );
}
