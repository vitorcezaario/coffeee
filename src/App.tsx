import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header, PublicLayoutMode } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { MediaLightbox } from './components/MediaLightbox';
import { SafeImage } from './components/SafeImage';
import { AdminPanel, AdminSessionState } from './components/AdminPanel';
import { ResizablePortfolioItem } from './components/ResizablePortfolioItem';
import {
  DEFAULT_SITE_SETTINGS,
  formatItemDate,
  formatItemIndex,
  PortfolioItem,
  SiteSettings,
} from './data/archive';

function isAdminRoute(pathname: string, hash: string): boolean {
  const cleanPath = pathname.trim().toLowerCase();
  const cleanHash = hash.replace(/^#/, '').trim().toLowerCase();
  return (
    cleanPath === '/admin' ||
    cleanPath.startsWith('/admin/') ||
    cleanHash === '/admin' ||
    cleanHash === 'admin' ||
    cleanHash.startsWith('/admin/')
  );
}

export default function App() {
  const [routeState, setRouteState] = useState<{ pathname: string; hash: string }>(() => ({
    pathname: window.location.pathname,
    hash: window.location.hash,
  }));
  const onAdminPage = isAdminRoute(routeState.pathname, routeState.hash);

  // Only show the intro loading animation when landing on the public home page
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !isAdminRoute(window.location.pathname, window.location.hash),
  );
  const [adminSession, setAdminSession] = useState<AdminSessionState | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [layoutMode, setLayoutMode] = useState<PublicLayoutMode>('folha');
  const [isEditMode, setIsEditMode] = useState(false);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [hoveredIndexItem, setHoveredIndexItem] = useState<PortfolioItem | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to || window.location.hash) {
      window.history.pushState({}, '', to);
    }
    setRouteState({ pathname: to, hash: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      setRouteState({
        pathname: window.location.pathname,
        hash: window.location.hash,
      });
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Silently restore persistent admin session via HttpOnly cookie on initial load
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const res = await fetch('/api/admin/auth/me', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.authenticated) {
          setAdminSession({
            username: data.username || 'admin',
            envPasscodeActive: Boolean(data.envPasscodeActive),
          });
        }
      } catch {
        // Ignore transient network errors during silent session check
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    };
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPortfolio = useCallback(async (attempt = 0) => {
    try {
      const res = await fetch('/api/portfolio', { cache: 'no-store' });
      if (!res.ok) {
        if (attempt < 2) {
          window.setTimeout(() => fetchPortfolio(attempt + 1), 1500);
          return;
        }
        setLoadingPortfolio(false);
        return;
      }
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
      if (Array.isArray(data.items)) {
        setItems(data.items);
      }
      setLoadingPortfolio(false);
    } catch {
      if (attempt < 2) {
        window.setTimeout(() => fetchPortfolio(attempt + 1), 1500);
        return;
      }
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    const baseName = settings.siteName || 'coffee';
    document.title = onAdminPage ? `${baseName} / admin` : baseName;
  }, [onAdminPage, settings.siteName]);

  const handleLogout = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'X-Requested-With': 'coffee-admin',
      };
      if (adminSession?.token) {
        headers.Authorization = `Bearer ${adminSession.token}`;
      }
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    } catch {
      // Ignore network error during logout
    } finally {
      setIsEditMode(false);
      setAdminSession(null);
    }
  }, [adminSession?.token]);

  const handleToggleEditMode = useCallback(() => {
    setEditError(null);
    setIsEditMode((prev) => {
      const next = !prev;
      if (next && layoutMode !== 'folha') {
        setLayoutMode('folha');
      }
      return next;
    });
  }, [layoutMode]);

  const handleSelectPublicLayout = useCallback((mode: PublicLayoutMode) => {
    setLayoutMode(mode);
    if (mode !== 'folha') {
      setIsEditMode(false);
    }
  }, []);

  const handleResizeCommit = useCallback(
    async (id: number, displayWidth: number | null) => {
      if (!adminSession) return;
      setEditError(null);
      setSavingItemId(id);

      // Optimistic update so the layout stays instant
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === id ? { ...entry, displayWidth } : entry,
        ),
      );

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Requested-With': 'coffee-admin',
        };
        if (adminSession.token) {
          headers.Authorization = `Bearer ${adminSession.token}`;
        }

        const res = await fetch(`/api/admin/items/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers,
          body: JSON.stringify({ displayWidth }),
        });

        if (res.status === 401) {
          setIsEditMode(false);
          setAdminSession(null);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Não foi possível salvar o tamanho.');
        }

        const updated = (await res.json()) as PortfolioItem;
        setItems((prev) =>
          prev.map((entry) => (entry.id === id ? updated : entry)),
        );
      } catch (err) {
        setEditError(
          err instanceof Error ? err.message : 'Erro ao salvar redimensionamento.',
        );
        fetchPortfolio();
      } finally {
        setSavingItemId(null);
      }
    },
    [adminSession, fetchPortfolio],
  );

  const handleNavigateHome = useCallback(() => {
    navigate('/');
    fetchPortfolio();
  }, [fetchPortfolio, navigate]);

  // Dedicated standalone Admin Page (/admin)
  if (onAdminPage) {
    return (
      <AdminPanel
        siteName={settings.siteName}
        session={adminSession}
        sessionChecked={sessionChecked}
        onSessionChange={setAdminSession}
        onLogout={handleLogout}
        onNavigateHome={handleNavigateHome}
        onContentChanged={fetchPortfolio}
      />
    );
  }

  // Dedicated Public Home Page (/)
  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#111111] flex flex-col">
      <AnimatePresence>
        {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}
      </AnimatePresence>

      <Header
        siteName={settings.siteName}
        publicLayoutMode={layoutMode}
        hasPublicItems={items.length > 0}
        itemCount={items.length}
        canEdit={Boolean(adminSession)}
        isEditMode={isEditMode}
        onSelectPublicLayout={handleSelectPublicLayout}
        onToggleEditMode={handleToggleEditMode}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 md:px-8">
        {/* Subtle inline edit hint bar (visible ONLY while admin is in Edit Mode) */}
        {isEditMode && adminSession && (
          <div className="py-3 border-b border-[#DCDCD4] flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-[#666662]">
            <span>
              arraste o canto inferior direito ou use <span className="text-[#111111]">− / +</span> para redimensionar respeitando a resolução
            </span>
            {editError ? (
              <span className="text-[#B91C1C]">{editError}</span>
            ) : savingItemId !== null ? (
              <span className="text-[#1A3AFF]">salvando...</span>
            ) : (
              <span className="text-[#111111]">alterações salvas automaticamente</span>
            )}
          </div>
        )}

        {/* Public Portfolio Canvas */}
        <section aria-label="Acervo" className="py-10 md:py-14">
          {loadingPortfolio ? (
            <div className="py-24 text-center font-mono text-xs text-[#666662]">
              carregando...
            </div>
          ) : items.length === 0 ? (
            <div className="py-24 md:py-32 max-w-md mx-auto text-center">
              <p className="font-mono text-xs text-[#666662]">
                o portfólio ainda está vazio.
              </p>
            </div>
          ) : layoutMode === 'folha' ? (
            /* Contact Sheet View — True Resolution Proportions + Admin Inline Resize */
            <div
              ref={galleryRef}
              className="flex flex-wrap items-end gap-x-6 gap-y-12"
            >
              {items.map((item, idx) => (
                <ResizablePortfolioItem
                  key={item.id}
                  item={item}
                  index={idx}
                  isEditMode={isEditMode && Boolean(adminSession)}
                  isSaving={savingItemId === item.id}
                  containerRef={galleryRef}
                  onSelect={setSelectedItem}
                  onResizeCommit={handleResizeCommit}
                />
              ))}
            </div>
          ) : (
            /* Raw Text Directory Index with Side Hover Preview */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-8 border-t border-[#DCDCD4]">
                {items.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    onMouseEnter={() => setHoveredIndexItem(item)}
                    onFocus={() => setHoveredIndexItem(item)}
                    className="w-full py-3.5 border-b border-[#DCDCD4] grid grid-cols-12 items-baseline gap-3 text-left font-mono text-xs hover:text-[#1A3AFF] transition-colors cursor-pointer group"
                  >
                    <span className="col-span-2 text-[#666662] tabular-nums">
                      {formatItemIndex(idx)}
                    </span>
                    <span className="col-span-5 text-[#111111] group-hover:text-[#1A3AFF] truncate">
                      {item.title || '—'}
                    </span>
                    <span className="col-span-2 sm:col-span-3 text-[#666662] truncate">
                      {item.kind === 'video' ? 'vídeo' : 'foto'}
                      {item.duration ? ` · ${item.duration}` : ''}
                    </span>
                    <span className="col-span-3 sm:col-span-2 text-right text-[#666662] tabular-nums">
                      {formatItemDate(item.createdAt)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="hidden lg:block lg:col-span-4 sticky top-20">
                {(() => {
                  const preview = hoveredIndexItem || items[0];
                  if (!preview) return null;
                  return (
                    <div>
                      <div className="overflow-hidden bg-[#EAEAE4]">
                        {preview.kind === 'video' ? (
                          <video
                            src={preview.mediaUrl}
                            muted
                            playsInline
                            className="block w-full h-auto"
                          />
                        ) : (
                          <SafeImage
                            src={preview.mediaUrl}
                            alt={preview.title || `Item ${preview.id}`}
                            fallbackLabel={preview.title || String(preview.id)}
                            className="block w-full h-auto"
                          />
                        )}
                      </div>
                      {preview.title && (
                        <p className="mt-3 font-mono text-xs text-[#111111]">
                          {preview.title}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </section>

        {/* Minimal Raw Footer — Discreet admin shortcuts appear ONLY when already logged in */}
        <footer className="border-t border-[#DCDCD4] py-10 grid grid-cols-1 md:grid-cols-12 gap-6 text-xs font-mono text-[#666662]">
          <div className="md:col-span-6 space-y-1.5">
            <p className="text-[#111111]">{settings.siteName}</p>
            <p className="leading-relaxed max-w-md">
              {settings.footerDescription}
            </p>
          </div>
          <div className="md:col-span-6 md:text-right flex flex-col md:items-end justify-between gap-2">
            {settings.contactEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="text-[#111111] hover:text-[#1A3AFF] underline underline-offset-4"
              >
                {settings.contactEmail}
              </a>
            )}
            <div className="flex flex-wrap items-center md:justify-end gap-4">
              <span>{settings.footerCredit}</span>
              {adminSession && (
                <>
                  <span aria-hidden="true" className="text-[#DCDCD4]">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/admin')}
                    className="text-[#666662] hover:text-[#111111] transition-colors cursor-pointer"
                  >
                    painel
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-[#666662] hover:text-[#111111] transition-colors cursor-pointer"
                  >
                    sair
                  </button>
                </>
              )}
            </div>
          </div>
        </footer>
      </main>

      <MediaLightbox
        item={selectedItem}
        items={items}
        onClose={() => setSelectedItem(null)}
        onSelect={(next) => setSelectedItem(next)}
      />
    </div>
  );
}
