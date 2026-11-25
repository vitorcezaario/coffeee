import { ArchiveFilter } from '../data/archive';

interface HeaderProps {
  activeFilter: ArchiveFilter;
  onSelectFilter: (filter: ArchiveFilter) => void;
  onReplayIntro: () => void;
}

export function Header({
  activeFilter,
  onSelectFilter,
  onReplayIntro,
}: HeaderProps) {
  const handleFilterClick = (filter: ArchiveFilter) => {
    onSelectFilter(filter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F7F7F5] border-b border-[#DCDCD4]">
      <div className="max-w-[1440px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Raw lowercase wordmark */}
        <button
          type="button"
          onClick={() => handleFilterClick('tudo')}
          className="font-display text-lg font-bold tracking-[-0.04em] text-[#111111] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]"
        >
          coffee
        </button>

        {/* Zone 2: 4 raw single-line links */}
        <nav
          aria-label="Filtros e navegação"
          className="hidden sm:flex items-center gap-7 font-mono text-xs text-[#666662]"
        >
          <button
            type="button"
            onClick={() => handleFilterClick('tudo')}
            className={`py-1 border-b transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              activeFilter === 'tudo'
                ? 'text-[#111111] border-[#111111]'
                : 'border-transparent hover:text-[#111111]'
            }`}
          >
            tudo
          </button>
          <button
            type="button"
            onClick={() => handleFilterClick('foto')}
            className={`py-1 border-b transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              activeFilter === 'foto'
                ? 'text-[#111111] border-[#111111]'
                : 'border-transparent hover:text-[#111111]'
            }`}
          >
            fotos
          </button>
          <button
            type="button"
            onClick={() => handleFilterClick('video')}
            className={`py-1 border-b transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
              activeFilter === 'video'
                ? 'text-[#111111] border-[#111111]'
                : 'border-transparent hover:text-[#111111]'
            }`}
          >
            vídeos
          </button>
          <a
            href="#info"
            className="py-1 border-b border-transparent hover:text-[#111111] transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            info
          </a>
        </nav>

        {/* Zone 3: 1 raw primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onReplayIntro}
            className="px-3.5 py-2 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A3AFF]"
          >
            abertura
          </button>
        </div>
      </div>
    </header>
  );
}
