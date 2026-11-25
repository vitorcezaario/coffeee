import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Header, PublicLayoutMode } from './components/Header';
import { LoadingScreen } from './components/LoadingScreen';
import { MediaLightbox } from './components/MediaLightbox';
import { SafeImage } from './components/SafeImage';
import { AdminPanel, AdminSessionState } from './components/AdminPanel';
import {
  LayoutPatch,
  ResizablePortfolioItem,
} from './components/ResizablePortfolioItem';
import {
  DEFAULT_SITE_SETTINGS,
  formatItemDate,
  formatItemIndex,
  PortfolioItem,
  SiteSettings,
} from './data/archive';

const CANVAS_REF_WIDTH = 1200;

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

function getDefaultWidthPercent(item: PortfolioItem): number {
  if (item.displayWidth !== null) return item.displayWidth;
  return item.aspect === 'landscape' ? 46 : 30;
}

function estimateRefHeight(item: PortfolioItem, widthPercent: number): number {
  if (item.displayHeight !== null) return item.displayHeight + 36;
  const widthRef = (widthPercent / 100) * CANVAS_REF_WIDTH;
  const ratio =
    item.aspect === 'landscape'
      ? 0.68
      : item.aspect === 'square'
        ? 1.0
        : 1.32;
  return Math.round(widthRef * ratio) + 36;
}

interface ResolvedPlacement {
  x: number;
  y: number;
  width: number;
}

function resolveCanvasPlacements(
  items: PortfolioItem[],
  forceTidyGrid = false,
): Map<number, ResolvedPlacement> {
  const result = new Map<number, ResolvedPlacement>();

  let maxPositionedBottom = 0;
  if (!forceTidyGrid) {
    for (const item of items) {
      if (item.posX !== null && item.posY !== null) {
        const w = getDefaultWidthPercent(item);
        const clampedX = Math.max(0, Math.min(100 - w, item.posX));
        result.set(item.id, { x: clampedX, y: Math.max(0, item.posY), width: w });
        const estBottom = item.posY + estimateRefHeight(item, w);
        if (estBottom > maxPositionedBottom) {
          maxPositionedBottom = estBottom;
        }
      }
    }
  }

  let cursorX = 0;
  let cursorY = maxPositionedBottom > 0 ? maxPositionedBottom + 48 : 0;
  let rowHeight = 0;
  const gapX = 3;
  const gapY = 48;

  for (const item of items) {
    if (!forceTidyGrid && result.has(item.id)) continue;

    const w = forceTidyGrid
      ? item.aspect === 'landscape'
        ? 46
        : 30
      : getDefaultWidthPercent(item);

    if (cursorX > 0 && cursorX + w > 100) {
      cursorX = 0;
      cursorY += rowHeight + gapY;
      rowHeight = 0;
    }

    const clampedX = Math.round(Math.max(0, Math.min(100 - w, cursorX)) * 10) / 10;
    result.set(item.id, {
      x: clampedX,
      y: Math.round(cursorY),
      width: w,
    });

    const estH = estimateRefHeight(
      forceTidyGrid ? { ...item, displayHeight: null } : item,
      w,
    );
    if (estH > rowHeight) rowHeight = estH;
    cursorX += w + gapX;
  }

  return result;
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
  const [activeEditItemId, setActiveEditItemId] = useState<number | null>(null);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [isTidying, setIsTidying] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);

  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [hoveredIndexItem, setHoveredIndexItem] = useState<PortfolioItem | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState<number>(CANVAS_REF_WIDTH);
  const itemBottomsRef = useRef<Map<number, number>>(new Map());
  const [measuredMaxBottom, setMeasuredMaxBottom] = useState<number>(0);

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

  // Track canvas container width so spatial coordinates scale cleanly on every viewport
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = el.getBoundingClientRect().width;
      if (next > 0) setCanvasWidth(next);
    };

    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layoutMode, loadingPortfolio, items.length, onAdminPage]);

  const handleMeasureBottom = useCallback((id: number, bottomPx: number) => {
    const prev = itemBottomsRef.current.get(id);
    if (prev !== undefined && Math.abs(prev - bottomPx) < 1) return;
    itemBottomsRef.current.set(id, bottomPx);
    let maxB = 0;
    itemBottomsRef.current.forEach((val) => {
      if (val > maxB) maxB = val;
    });
    setMeasuredMaxBottom((curr) => (Math.abs(curr - maxB) >= 1 ? maxB : curr));
  }, []);

  // Prune stale measurements when items change
  useEffect(() => {
    const validIds = new Set(items.map((entry) => entry.id));
    let changed = false;
    itemBottomsRef.current.forEach((_val, key) => {
      if (!validIds.has(key)) {
        itemBottomsRef.current.delete(key);
        changed = true;
      }
    });
    if (changed) {
      let maxB = 0;
      itemBottomsRef.current.forEach((val) => {
        if (val > maxB) maxB = val;
      });
      setMeasuredMaxBottom(maxB);
    }
  }, [items]);

  const notifyAuthChanged = useCallback(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('coffee_admin_auth');
        channel.postMessage({ type: 'auth-changed' });
        channel.close();
      } catch {
        // Ignore BroadcastChannel errors in restricted contexts
      }
    }
  }, []);

  const syncAuthSession = useCallback(async (tokenOverride?: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (tokenOverride) {
        headers.Authorization = `Bearer ${tokenOverride}`;
      }
      const res = await fetch('/api/admin/auth/me', {
        credentials: 'include',
        cache: 'no-store',
        headers,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.authenticated) {
        setAdminSession((prev) => ({
          username: data.username || 'admin',
          envPasscodeActive: Boolean(data.envPasscodeActive),
          token: prev?.token ?? tokenOverride ?? null,
        }));
      } else {
        setAdminSession(null);
        setIsEditMode(false);
        setActiveEditItemId(null);
      }
    } catch {
      // Ignore transient network errors during silent session check
    } finally {
      setSessionChecked(true);
    }
  }, []);

  // Restore & keep admin session in sync across reloads, focus, visibility, and tabs
  useEffect(() => {
    syncAuthSession(adminSession?.token);

    const handleFocus = () => {
      syncAuthSession(adminSession?.token);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncAuthSession(adminSession?.token);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('coffee_admin_auth');
        channel.onmessage = () => {
          syncAuthSession();
        };
      } catch {
        channel = null;
      }
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel) channel.close();
    };
  }, [adminSession?.token, routeState.pathname, syncAuthSession]);

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

  const handleSessionChange = useCallback(
    (next: AdminSessionState | null) => {
      setAdminSession(next);
      if (!next) {
        setIsEditMode(false);
        setActiveEditItemId(null);
      }
      notifyAuthChanged();
    },
    [notifyAuthChanged],
  );

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
      setActiveEditItemId(null);
      setAdminSession(null);
      notifyAuthChanged();
    }
  }, [adminSession?.token, notifyAuthChanged]);

  const handleToggleEditMode = useCallback(() => {
    setEditError(null);
    setActiveEditItemId(null);
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
      setActiveEditItemId(null);
    }
  }, []);

  const placements = useMemo(() => resolveCanvasPlacements(items), [items]);
  const scale = canvasWidth / CANVAS_REF_WIDTH;

  const buildAdminHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'coffee-admin',
    };
    if (adminSession?.token) {
      headers.Authorization = `Bearer ${adminSession.token}`;
    }
    return headers;
  }, [adminSession?.token]);

  const handleLayoutCommit = useCallback(
    async (id: number, patch: LayoutPatch) => {
      if (!adminSession) return;
      setEditError(null);
      setSavingItemId(id);

      // Freeze any sibling items that haven't been positioned yet so they stay put
      const unpositionedSiblings = items.filter(
        (entry) => entry.id !== id && (entry.posX === null || entry.posY === null),
      );

      const currentPlacement = placements.get(id);
      const targetPatch: LayoutPatch = {
        posX: patch.posX !== undefined ? patch.posX : currentPlacement?.x ?? 0,
        posY: patch.posY !== undefined ? patch.posY : currentPlacement?.y ?? 0,
        ...(patch.displayWidth !== undefined
          ? { displayWidth: patch.displayWidth }
          : {}),
        ...(patch.displayHeight !== undefined
          ? { displayHeight: patch.displayHeight }
          : {}),
        ...(patch.zIndex !== undefined ? { zIndex: patch.zIndex } : {}),
      };

      const batchEntries: Array<{ id: number } & LayoutPatch> = [
        { id, ...targetPatch },
        ...unpositionedSiblings.map((sibling) => {
          const placed = placements.get(sibling.id);
          return {
            id: sibling.id,
            posX: placed?.x ?? 0,
            posY: placed?.y ?? 0,
            displayWidth: placed?.width ?? getDefaultWidthPercent(sibling),
          };
        }),
      ];

      // Optimistic local state update
      const patchById = new Map(batchEntries.map((entry) => [entry.id, entry]));
      setItems((prev) =>
        prev.map((entry) => {
          const delta = patchById.get(entry.id);
          if (!delta) return entry;
          return {
            ...entry,
            ...(delta.displayWidth !== undefined
              ? { displayWidth: delta.displayWidth }
              : {}),
            ...(delta.displayHeight !== undefined
              ? { displayHeight: delta.displayHeight }
              : {}),
            ...(delta.posX !== undefined ? { posX: delta.posX } : {}),
            ...(delta.posY !== undefined ? { posY: delta.posY } : {}),
            ...(delta.zIndex !== undefined ? { zIndex: delta.zIndex } : {}),
          };
        }),
      );

      try {
        const res =
          batchEntries.length === 1
            ? await fetch(`/api/admin/items/${id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: buildAdminHeaders(),
                body: JSON.stringify(targetPatch),
              })
            : await fetch('/api/admin/items/layout', {
                method: 'POST',
                credentials: 'include',
                headers: buildAdminHeaders(),
                body: JSON.stringify({ entries: batchEntries }),
              });

        if (res.status === 401) {
          setIsEditMode(false);
          setAdminSession(null);
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Não foi possível salvar a posição.');
        }

        if (batchEntries.length === 1) {
          const updated = (await res.json()) as PortfolioItem;
          setItems((prev) =>
            prev.map((entry) => (entry.id === id ? updated : entry)),
          );
        }
      } catch (err) {
        setEditError(
          err instanceof Error ? err.message : 'Erro ao salvar layout.',
        );
        fetchPortfolio();
      } finally {
        setSavingItemId(null);
      }
    },
    [adminSession, buildAdminHeaders, fetchPortfolio, items, placements],
  );

  const handleBringToFront = useCallback(
    (id: number) => {
      const maxZ = items.reduce((acc, entry) => Math.max(acc, entry.zIndex || 1), 1);
      handleLayoutCommit(id, { zIndex: maxZ + 1 });
    },
    [handleLayoutCommit, items],
  );

  const handleSendToBack = useCallback(
    async (id: number) => {
      if (!adminSession) return;
      setEditError(null);
      setSavingItemId(id);

      // Re-index all items so the target sits at zIndex 1 and everything else stays >= 2
      const others = items
        .filter((entry) => entry.id !== id)
        .sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1));

      const entries: Array<{ id: number; zIndex: number }> = [
        { id, zIndex: 1 },
        ...others.map((entry, idx) => ({ id: entry.id, zIndex: idx + 2 })),
      ];

      const zById = new Map(entries.map((entry) => [entry.id, entry.zIndex]));
      setItems((prev) =>
        prev.map((entry) => ({
          ...entry,
          zIndex: zById.get(entry.id) ?? entry.zIndex,
        })),
      );

      try {
        const res = await fetch('/api/admin/items/layout', {
          method: 'POST',
          credentials: 'include',
          headers: buildAdminHeaders(),
          body: JSON.stringify({ entries }),
        });

        if (res.status === 401) {
          setIsEditMode(false);
          setAdminSession(null);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Não foi possível ajustar a camada.');
        }
      } catch (err) {
        setEditError(
          err instanceof Error ? err.message : 'Erro ao ajustar camada.',
        );
        fetchPortfolio();
      } finally {
        setSavingItemId(null);
      }
    },
    [adminSession, buildAdminHeaders, fetchPortfolio, items],
  );

  const handleTidyGrid = useCallback(async () => {
    if (!adminSession || items.length === 0) return;
    setEditError(null);
    setIsTidying(true);

    const tidyMap = resolveCanvasPlacements(items, true);
    const entries = items.map((entry, idx) => {
      const placed = tidyMap.get(entry.id);
      return {
        id: entry.id,
        posX: placed?.x ?? 0,
        posY: placed?.y ?? 0,
        displayWidth: placed?.width ?? (entry.aspect === 'landscape' ? 46 : 30),
        displayHeight: null as number | null,
        zIndex: idx + 1,
      };
    });

    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    setItems((prev) =>
      prev.map((entry) => {
        const next = byId.get(entry.id);
        return next
          ? {
              ...entry,
              posX: next.posX,
              posY: next.posY,
              displayWidth: next.displayWidth,
              displayHeight: null,
              zIndex: next.zIndex,
            }
          : entry;
      }),
    );

    try {
      const res = await fetch('/api/admin/items/layout', {
        method: 'POST',
        credentials: 'include',
        headers: buildAdminHeaders(),
        body: JSON.stringify({ entries }),
      });

      if (res.status === 401) {
        setIsEditMode(false);
        setAdminSession(null);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível reorganizar a grade.');
      }
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Erro ao reorganizar.',
      );
      fetchPortfolio();
    } finally {
      setIsTidying(false);
    }
  }, [adminSession, buildAdminHeaders, fetchPortfolio, items]);

  const handleNavigateHome = useCallback(() => {
    navigate('/');
    fetchPortfolio();
  }, [fetchPortfolio, navigate]);

  const canvasMinHeightPx = Math.max(
    isEditMode ? 680 : 320,
    Math.ceil(measuredMaxBottom + (isEditMode ? 240 : 48)),
  );

  // Dedicated standalone Admin Page (/admin)
  if (onAdminPage) {
    return (
      <AdminPanel
        siteName={settings.siteName}
        session={adminSession}
        sessionChecked={sessionChecked}
        onSessionChange={handleSessionChange}
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
        onDiscreetAdminAccess={() => navigate('/admin')}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 md:px-8">
        {/* Subtle inline edit hint bar (visible ONLY while admin is in Edit Mode) */}
        {isEditMode && adminSession && (
          <div className="py-3 border-b border-[#DCDCD4] flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-[#666662]">
            <span>
              modo livre · arraste qualquer imagem para onde quiser e puxe as bordas ou cantos para mudar o tamanho
            </span>
            <div className="flex items-center gap-4">
              {items.length > 0 && (
                <button
                  type="button"
                  disabled={isTidying}
                  onClick={handleTidyGrid}
                  className="px-2.5 py-1 border border-[#DCDCD4] text-[#111111] hover:border-[#111111] transition-colors cursor-pointer disabled:opacity-40"
                >
                  {isTidying ? 'organizando...' : 'organizar grade'}
                </button>
              )}
              {editError ? (
                <span className="text-[#B91C1C]">{editError}</span>
              ) : savingItemId !== null ? (
                <span className="text-[#1A3AFF]">salvando...</span>
              ) : (
                <span className="text-[#111111]">salvo automaticamente</span>
              )}
            </div>
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
            /* Freeform Spatial Canvas — Move Anywhere & Resize Freely Inside Site Bounds */
            <div
              ref={canvasRef}
              onPointerDown={() => {
                if (isEditMode) setActiveEditItemId(null);
              }}
              style={{
                minHeight: `${canvasMinHeightPx}px`,
                backgroundImage:
                  isEditMode && adminSession
                    ? 'radial-gradient(#D2D2CA 1px, transparent 1px)'
                    : undefined,
                backgroundSize:
                  isEditMode && adminSession ? '24px 24px' : undefined,
              }}
              className={`relative w-full overflow-x-clip ${
                isEditMode && adminSession
                  ? 'border border-dashed border-[#DCDCD4]'
                  : ''
              }`}
            >
              {items.map((item, idx) => {
                const placement = placements.get(item.id) ?? {
                  x: 0,
                  y: 0,
                  width: getDefaultWidthPercent(item),
                };
                return (
                  <ResizablePortfolioItem
                    key={item.id}
                    item={item}
                    index={idx}
                    resolvedX={placement.x}
                    resolvedY={placement.y}
                    resolvedWidth={placement.width}
                    canvasWidth={canvasWidth}
                    scale={scale}
                    isEditMode={isEditMode && Boolean(adminSession)}
                    isActive={activeEditItemId === item.id}
                    isSaving={savingItemId === item.id}
                    onSelectForView={setSelectedItem}
                    onActivate={(targetId) => setActiveEditItemId(targetId)}
                    onBringToFront={handleBringToFront}
                    onSendToBack={handleSendToBack}
                    onLayoutCommit={handleLayoutCommit}
                    onMeasureBottom={handleMeasureBottom}
                  />
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
