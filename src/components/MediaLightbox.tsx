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
      className="fixed inset-0 z-50 bg-[#0A0A09] text-[#F7F7F5] flex items-center justify-center p-4 md:p-12"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      onClick={onClose}
    >
      {/* Floating minimal controls (no captions) */}
      <div
        className="fixed top-4 right-4 md:top-6 md:right-6 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {item.isUserUpload && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            aria-label="Remover mídia"
            className="h-10 px-3 font-mono text-xs text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            apagar
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="w-10 h-10 flex items-center justify-center text-white/75 hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Unobstructed media frame */}
      <div
        className="relative w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === 'video' && item.videoUrl ? (
          <video
            key={item.videoUrl}
            src={item.videoUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85vh] object-contain bg-black"
          />
        ) : item.imageUrl ? (
          <SafeImage
            src={item.imageUrl}
            alt={item.title}
            fallbackLabel={item.title}
            className={`max-w-full max-h-[85vh] object-contain transition-transform duration-700 ease-out ${
              isPlayingPreview ? 'scale-[1.02]' : 'scale-100'
            }`}
          />
        ) : (
          <div
            role="img"
            aria-label={item.title}
            style={{ backgroundColor: item.swatchColor }}
            className={`relative border border-white/10 transition-transform duration-500 ease-out ${
              item.aspect === 'landscape'
                ? 'w-full max-w-4xl aspect-[16/10]'
                : item.aspect === 'square'
                  ? 'w-full max-w-xl aspect-square'
                  : 'h-[78vh] aspect-[3/4] max-w-full'
            } ${isPlayingPreview ? 'scale-[1.015]' : 'scale-100'}`}
          >
            {item.kind === 'video' && (
              <button
                type="button"
                onClick={() => setIsPlayingPreview((prev) => !prev)}
                aria-label={isPlayingPreview ? 'Pausar prévia' : 'Reproduzir prévia'}
                className="absolute bottom-4 left-4 w-10 h-10 flex items-center justify-center bg-[#0A0A09]/85 text-white border border-white/25 hover:border-white transition-colors cursor-pointer"
              >
                {isPlayingPreview ? (
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
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
              className="fixed left-3 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Próximo"
              className="fixed right-3 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
