export type PublicLayoutMode = 'folha' | 'indice';

interface HeaderProps {
  siteName: string;
  publicLayoutMode: PublicLayoutMode;
  hasPublicItems: boolean;
  itemCount: number;
  canEdit: boolean;
  isEditMode: boolean;
  onSelectPublicLayout: (mode: PublicLayoutMode) => void;
  onToggleEditMode: () => void;
  onDiscreetAdminAccess: () => void;
}

export function Header({
  siteName,
  publicLayoutMode,
  hasPublicItems,
  itemCount,
  canEdit,
  isEditMode,
  onSelectPublicLayout,
  onToggleEditMode,
  onDiscreetAdminAccess,
}: HeaderProps) {
  const handleLogoClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#F7F7F5] border-b border-[#DCDCD4]">
      <div className="max-w-[1440px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Raw lowercase wordmark */}
        <button
          type="button"
          onClick={handleLogoClick}
          onDoubleClick={onDiscreetAdminAccess}
          className="font-display text-lg font-bold tracking-[-0.04em] text-[#111111] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]"
        >
          {siteName || 'coffee'}
        </button>

        {/* Zone 2: Minimal public layout mode switcher */}
        {hasPublicItems ? (
          <nav
            aria-label="Modo de exibição"
            className="flex items-center gap-7 font-mono text-xs text-[#666662]"
          >
            {(
              [
                { id: 'folha', label: 'folha' },
                { id: 'indice', label: 'índice' },
              ] as { id: PublicLayoutMode; label: string }[]
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onSelectPublicLayout(mode.id)}
                className={`py-1 border-b transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  publicLayoutMode === mode.id
                    ? 'text-[#111111] border-[#1A3AFF]'
                    : 'border-transparent hover:text-[#111111]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </nav>
        ) : (
          <div aria-hidden="true" />
        )}

        {/* Zone 3: Top-right edit button (visible ONLY to logged-in admin), otherwise discreet item count */}
        <div className="shrink-0 flex items-center gap-4">
          {canEdit && hasPublicItems ? (
            <button
              type="button"
              onClick={onToggleEditMode}
              className={`px-3.5 py-2 font-mono text-xs transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A3AFF] ${
                isEditMode
                  ? 'bg-[#1A3AFF] text-[#F7F7F5] hover:bg-[#111111]'
                  : 'bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF]'
              }`}
            >
              {isEditMode ? 'concluir' : 'editar'}
            </button>
          ) : (
            <span className="font-mono text-xs text-[#666662] tabular-nums whitespace-nowrap">
              {String(itemCount).padStart(2, '0')} {itemCount === 1 ? 'item' : 'itens'}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
