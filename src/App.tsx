import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Play } from 'lucide-react';
import { Header, PublicLayoutMode } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { MediaLightbox } from './components/MediaLightbox';
import { SafeImage } from './components/SafeImage';
import { AdminPanel, AdminSessionState } from './components/AdminPanel';
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

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [hoveredIndexItem, setHoveredIndexItem] = useState<PortfolioItem | null>(null);

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
      setAdminSession(null);
    }
  }, [adminSession?.token]);

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
        onSelectPublicLayout={setLayoutMode}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 md:px-8">
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
            /* Contact Sheet View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 items-end">
              {items.map((item, idx) => {
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
                        className={`relative w-full overflow-hidden bg-[#EAEAE4] transition-opacity duration-150 group-hover:opacity-90 ${aspectClass}`}
                      >
                        {item.kind === 'video' ? (
                          <video
                            src={item.mediaUrl}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <SafeImage
                            src={item.mediaUrl}
                            alt={item.title || `Item ${formatItemIndex(idx)}`}
                            fallbackLabel={item.title || formatItemIndex(idx)}
                            className="w-full h-full object-cover"
                          />
                        )}

                        {item.kind === 'video' && item.duration && (
                          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[11px] bg-[#0A0A09]/85 text-[#F7F7F5] border border-white/15 tabular-nums">
                            <Play
                              className="w-2.5 h-2.5 fill-current"
                              aria-hidden="true"
                            />
                            <span>{item.duration}</span>
                          </span>
                        )}
                      </div>

                      {item.title && (
                        <div className="mt-2.5 flex items-baseline justify-between gap-3 font-mono text-[11px]">
                          <span className="text-[#111111] group-hover:text-[#1A3AFF] transition-colors truncate">
                            {item.title}
                          </span>
                          <span className="text-[#666662] tabular-nums shrink-0">
                            {formatItemDate(item.createdAt)}
                          </span>
                        </div>
                      )}
                    </button>
                  </article>
                );
              })}
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
                      <div className="overflow-hidden aspect-[4/3] bg-[#EAEAE4]">
                        {preview.kind === 'video' ? (
                          <video
                            src={preview.mediaUrl}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <SafeImage
                            src={preview.mediaUrl}
                            alt={preview.title || `Item ${preview.id}`}
                            fallbackLabel={preview.title || String(preview.id)}
                            className="w-full h-full object-cover"
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
