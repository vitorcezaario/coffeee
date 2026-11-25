import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ArchiveItem } from '../data/archive';
import { SafeImage } from './SafeImage';

interface MediaLightboxProps {
  item: ArchiveItem | null;
  items: ArchiveItem[];
  onClose: () => void;
  onSelect: (item: ArchiveItem) => void;
}

export function MediaLightbox({
  item,
  items,
  onClose,
  onSelect,
}: MediaLightboxProps) {
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
      aria-label={item.title || `Item ${item.index}`}
      onClick={onClose}
    >
      {/* Floating minimal close control */}
      <div
        className="fixed top-4 right-4 md:top-6 md:right-6 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
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
            alt={item.title || `Item ${item.index}`}
            fallbackLabel={item.title || item.index}
            className="max-w-full max-h-[85vh] object-contain"
          />
        ) : (
          <div
            role="img"
            aria-label={item.title || `Item ${item.index}`}
            style={{ backgroundColor: item.swatchColor }}
            className={`border border-white/10 ${
              item.aspect === 'landscape'
                ? 'w-full max-w-4xl aspect-[16/10]'
                : item.aspect === 'square'
                  ? 'w-full max-w-xl aspect-square'
                  : 'h-[78vh] aspect-[3/4] max-w-full'
            }`}
          />
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
