import { useCallback, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Play } from 'lucide-react';
import { Header } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { MediaLightbox } from './components/MediaLightbox';
import { AddMediaModal } from './components/AddMediaModal';
import { SafeImage } from './components/SafeImage';
import {
  ArchiveFilter,
  ArchiveItem,
  INITIAL_ARCHIVE_ITEMS,
} from './data/archive';

type LayoutMode = 'folha' | 'fluxo' | 'indice';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [loaderKey, setLoaderKey] = useState(0);
  const [items, setItems] = useState<ArchiveItem[]>(INITIAL_ARCHIVE_ITEMS);
  const [activeFilter, setActiveFilter] = useState<ArchiveFilter>('tudo');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('folha');
  const [selectedItem, setSelectedItem] = useState<ArchiveItem | null>(null);
  const [hoveredIndexItem, setHoveredIndexItem] = useState<ArchiveItem | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleReplayIntro = () => {
    setLoaderKey((k) => k + 1);
    setIsLoading(true);
  };

  const visibleItems =
    activeFilter === 'tudo'
      ? items
      : items.filter((item) => item.kind === activeFilter);

  const handleAddItem = (newItem: ArchiveItem) => {
    setItems((prev) => [newItem, ...prev]);
    setActiveFilter('tudo');
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedItem(null);
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#111111] flex flex-col">
      <AnimatePresence>
        {isLoading && (
          <LoadingScreen key={loaderKey} onComplete={handleLoadingComplete} />
        )}
      </AnimatePresence>

      <Header
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 md:px-8">
        {/* Raw Archival Strip — Zero Hero, Straight Into the Archive */}
        <div className="py-5 border-b border-[#DCDCD4] flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-3 text-[#666662]">
            <span className="text-[#111111]">arquivo pessoal</span>
            <span aria-hidden="true">/</span>
            <span className="tabular-nums">
              {String(visibleItems.length).padStart(2, '0')} itens
            </span>
          </div>

          {/* Mobile filter links + layout mode */}
          <div className="flex items-center gap-6">
            <div className="flex sm:hidden items-center gap-4 text-[#666662]">
              {(['tudo', 'foto', 'video'] as ArchiveFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  className={`cursor-pointer ${
                    activeFilter === f ? 'text-[#111111] underline underline-offset-4' : ''
                  }`}
                >
                  {f === 'foto' ? 'fotos' : f === 'video' ? 'vídeos' : 'tudo'}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="Modo de exibição"
              className="flex items-center gap-4 text-[#666662]"
            >
              {(['folha', 'fluxo', 'indice'] as LayoutMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLayoutMode(mode)}
                  aria-pressed={layoutMode === mode}
                  className={`transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    layoutMode === mode
                      ? 'text-[#111111] underline underline-offset-4 decoration-[#1A3AFF]'
                      : 'hover:text-[#111111]'
                  }`}
                >
                  {mode === 'indice' ? 'índice' : mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Archive Content Canvas */}
        <section aria-label="Acervo" className="py-10 md:py-14">
          {visibleItems.length === 0 ? (
            <div className="py-24 text-center font-mono text-xs text-[#666662]">
              <p>nenhum arquivo neste filtro.</p>
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="mt-4 text-[#111111] underline underline-offset-4 hover:text-[#1A3AFF] cursor-pointer"
              >
                + subir mídia
              </button>
            </div>
          ) : layoutMode === 'folha' ? (
            /* Contact Sheet View — Raw, Unboxed, Natural Proportions */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 items-end">
              {visibleItems.map((item) => {
                const isWide = item.aspect === 'landscape';
                const aspectClass =
                  item.aspect === 'landscape'
                    ? 'aspect-[16/10]'
                    : item.aspect === 'square'
                      ? 'aspect-square'
                      : 'aspect-[3/4]';

                return (
                  <article
                    key={item.id}
                    className={isWide ? 'sm:col-span-2' : 'col-span-1'}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="group block w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]"
                    >
                      <div
                        className={`relative w-full overflow-hidden transition-opacity duration-150 group-hover:opacity-90 ${aspectClass}`}
                        style={{ backgroundColor: item.swatchColor }}
                      >
                        {item.kind === 'video' && item.videoUrl ? (
                          <video
                            src={item.videoUrl}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : item.imageUrl ? (
                          <SafeImage
                            src={item.imageUrl}
                            alt={item.title}
                            fallbackLabel={item.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : null}

                        {item.kind === 'video' && (
                          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] bg-[#0A0A09]/85 text-[#F7F7F5] border border-white/15 tabular-nums">
                            <Play className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
                            <span>{item.duration || '00:30'}</span>
                          </span>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-baseline justify-between gap-3 font-mono text-[11px]">
                        <span className="text-[#111111] group-hover:text-[#1A3AFF] transition-colors truncate">
                          {item.filename}
                        </span>
                        <span className="text-[#666662] tabular-nums shrink-0">
                          {item.date}
                        </span>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : layoutMode === 'fluxo' ? (
            /* Single-Column Raw Stream (Zine / Personal Diary Scroll) */
            <div className="max-w-3xl mx-auto space-y-20">
              {visibleItems.map((item) => {
                const streamAspect =
                  item.aspect === 'landscape'
                    ? 'aspect-[16/10]'
                    : item.aspect === 'square'
                      ? 'aspect-square max-w-xl mx-auto'
                      : 'aspect-[3/4] max-w-lg mx-auto';

                return (
                  <article key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="group block w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]"
                    >
                      <div
                        className={`relative w-full overflow-hidden transition-opacity duration-150 group-hover:opacity-90 ${
                          item.imageUrl || item.videoUrl ? 'bg-[#EAEAE4]' : streamAspect
                        }`}
                        style={{
                          backgroundColor:
                            item.imageUrl || item.videoUrl ? undefined : item.swatchColor,
                        }}
                      >
                        {item.kind === 'video' && item.videoUrl ? (
                          <video
                            src={item.videoUrl}
                            muted
                            playsInline
                            className="w-full max-h-[75vh] object-contain bg-[#0A0A09]"
                          />
                        ) : item.imageUrl ? (
                          <SafeImage
                            src={item.imageUrl}
                            alt={item.title}
                            fallbackLabel={item.filename}
                            className="w-full max-h-[75vh] object-contain mx-auto"
                          />
                        ) : null}

                        {item.kind === 'video' && (
                          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs bg-[#0A0A09]/85 text-[#F7F7F5] border border-white/15 tabular-nums">
                            <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                            <span>{item.duration || '00:30'}</span>
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <p className="text-sm text-[#111111] group-hover:text-[#1A3AFF] transition-colors">
                          {item.note}
                        </p>
                        <span className="font-mono text-xs text-[#666662] tabular-nums whitespace-nowrap shrink-0">
                          {item.filename} · {item.format} · {item.date}
                        </span>
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            /* Raw Text Directory Index with Side Hover Preview */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-8 border-t border-[#DCDCD4]">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    onMouseEnter={() => setHoveredIndexItem(item)}
                    onFocus={() => setHoveredIndexItem(item)}
                    className="w-full py-3.5 border-b border-[#DCDCD4] grid grid-cols-12 items-baseline gap-3 text-left font-mono text-xs hover:text-[#1A3AFF] transition-colors cursor-pointer group"
                  >
                    <span className="col-span-2 sm:col-span-1 text-[#666662] tabular-nums">
                      {item.index}
                    </span>
                    <span className="col-span-6 sm:col-span-5 text-[#111111] group-hover:text-[#1A3AFF] truncate">
                      {item.filename}
                    </span>
                    <span className="hidden sm:block sm:col-span-3 text-[#666662] truncate">
                      {item.format}
                      {item.duration ? ` · ${item.duration}` : ''}
                    </span>
                    <span className="hidden md:block md:col-span-2 text-[#666662] truncate">
                      {item.location}
                    </span>
                    <span className="col-span-4 sm:col-span-3 md:col-span-1 text-right text-[#666662] tabular-nums">
                      {item.date}
                    </span>
                  </button>
                ))}
              </div>

              <div className="hidden lg:block lg:col-span-4 sticky top-20">
                {(() => {
                  const preview = hoveredIndexItem || visibleItems[0];
                  if (!preview) return null;
                  return (
                    <div>
                      <div
                        className="overflow-hidden aspect-[4/3]"
                        style={{ backgroundColor: preview.swatchColor }}
                      >
                        {preview.kind === 'video' && preview.videoUrl ? (
                          <video
                            src={preview.videoUrl}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : preview.imageUrl ? (
                          <SafeImage
                            src={preview.imageUrl}
                            alt={preview.title}
                            fallbackLabel={preview.filename}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-[#111111]">{preview.note}</p>
                      <p className="mt-1 font-mono text-xs text-[#666662] tabular-nums">
                        {preview.filename} · {preview.location}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Minimal Raw Colophon / Info */}
        <section
          id="info"
          className="border-t border-[#DCDCD4] py-10 grid grid-cols-1 md:grid-cols-12 gap-6 text-xs font-mono text-[#666662]"
        >
          <div className="md:col-span-6 space-y-1.5">
            <p className="text-[#111111]">coffee — arquivo aberto</p>
            <p className="leading-relaxed max-w-md">
              pasta pessoal de fotos em 35mm, vídeos curtos e notas visuais de rua. sem algoritmo, sem feed.
            </p>
          </div>
          <div className="md:col-span-6 md:text-right flex flex-col md:items-end justify-between gap-2">
            <div className="flex flex-wrap items-center gap-5">
              <a
                href="mailto:oi@coffee.archive"
                className="text-[#111111] hover:text-[#1A3AFF] underline underline-offset-4"
              >
                oi@coffee.archive
              </a>
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="text-[#111111] hover:text-[#1A3AFF] underline underline-offset-4 cursor-pointer"
              >
                + subir arquivo
              </button>
              <button
                type="button"
                onClick={handleReplayIntro}
                className="text-[#666662] hover:text-[#111111] underline underline-offset-4 cursor-pointer"
              >
                rever abertura
              </button>
            </div>
            <span className="tabular-nums">são paulo · 2024—2026</span>
          </div>
        </section>
      </main>

      <MediaLightbox
        item={selectedItem}
        items={visibleItems}
        onClose={() => setSelectedItem(null)}
        onSelect={(next) => setSelectedItem(next)}
        onDelete={handleDeleteItem}
      />

      <AddMediaModal
        isOpen={isUploadOpen}
        nextSequence={items.length + 1}
        onClose={() => setIsUploadOpen(false)}
        onAdd={handleAddItem}
      />
    </div>
  );
}
