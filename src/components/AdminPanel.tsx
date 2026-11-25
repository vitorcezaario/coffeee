import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  LogOut,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_SITE_SETTINGS,
  formatItemDate,
  formatItemIndex,
  MediaAspect,
  PortfolioItem,
  SiteSettings,
} from '../data/archive';
import { SafeImage } from './SafeImage';
import { MediaLightbox } from './MediaLightbox';

export type AdminSection = 'acervo' | 'fluxo' | 'config';

export interface AdminSessionState {
  username: string;
  envPasscodeActive: boolean;
  token?: string | null;
}

interface AdminPanelProps {
  siteName: string;
  session: AdminSessionState | null;
  sessionChecked: boolean;
  onSessionChange: (session: AdminSessionState | null) => void;
  onLogout: () => Promise<void>;
  onNavigateHome: () => void;
  onContentChanged: () => void;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function formatVideoDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function guessAspectFromDimensions(width: number, height: number): MediaAspect {
  if (!width || !height) return 'portrait';
  const ratio = width / height;
  if (ratio > 1.15) return 'landscape';
  if (ratio < 0.88) return 'portrait';
  return 'square';
}

export function AdminPanel({
  siteName,
  session,
  sessionChecked,
  onSessionChange,
  onLogout,
  onNavigateHome,
  onContentChanged,
}: AdminPanelProps) {
  const [section, setSection] = useState<AdminSection>('acervo');

  // Standalone Auth Status & Form State
  const [checkingStatus, setCheckingStatus] = useState(!session);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Portfolio & Settings State
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Draft authenticated blob URLs (in memory only)
  const [draftUrls, setDraftUrls] = useState<Record<number, string>>({});
  const draftUrlsRef = useRef<Record<number, string>>({});

  // Upload form state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAspect, setUploadAspect] = useState<MediaAspect>('portrait');
  const [uploadDuration, setUploadDuration] = useState<string | null>(null);
  const [uploadPublished, setUploadPublished] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Per-item editing & delete confirmation state
  const [titleDrafts, setTitleDrafts] = useState<Record<number, string>>({});
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  // Change password form state (in config tab)
  const [nextUsername, setNextUsername] = useState(session?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Admin Lightbox (for both acervo previews & fluxo tab)
  const [lightboxItem, setLightboxItem] = useState<PortfolioItem | null>(null);

  const buildHeaders = useCallback(
    (extra?: Record<string, string>): Record<string, string> => {
      const headers: Record<string, string> = {
        'X-Requested-With': 'coffee-admin',
        ...(extra || {}),
      };
      if (session?.token) {
        headers.Authorization = `Bearer ${session.token}`;
      }
      return headers;
    },
    [session?.token],
  );

  const showTempFeedback = useCallback((message: string) => {
    setErrorMessage(null);
    setFeedback(message);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (session?.username) {
      setNextUsername(session.username);
    }
  }, [session?.username]);

  // Check whether first-run setup is required when unauthenticated (after session restoration completes)
  useEffect(() => {
    if (!sessionChecked) return;
    if (session) {
      setCheckingStatus(false);
      return;
    }

    let cancelled = false;
    const checkStatus = async () => {
      setCheckingStatus(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/admin/auth/status', {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setNeedsSetup(Boolean(data.needsSetup));
        } else {
          setAuthError(data.error || 'Não foi possível verificar o acesso.');
        }
      } catch {
        if (!cancelled) {
          setAuthError('Erro de conexão com o servidor.');
        }
      } finally {
        if (!cancelled) setCheckingStatus(false);
      }
    };

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [session, sessionChecked]);

  const handleUnauthorized = useCallback(() => {
    onSessionChange(null);
    setItems([]);
    setAuthError('Sua sessão expirou. Entre novamente.');
  }, [onSessionChange]);

  const loadOverview = useCallback(async () => {
    if (!session) return;
    setLoadingOverview(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/overview', {
        credentials: 'include',
        headers: buildHeaders(),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível carregar o acervo.');
      }
      const data = await res.json();
      const loadedItems: PortfolioItem[] = Array.isArray(data.items) ? data.items : [];
      const loadedSettings: SiteSettings = data.settings || DEFAULT_SITE_SETTINGS;
      setItems(loadedItems);
      setSettings(loadedSettings);
      setSettingsForm(loadedSettings);
      setTitleDrafts(
        Object.fromEntries(loadedItems.map((entry) => [entry.id, entry.title])),
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao carregar o painel.',
      );
    } finally {
      setLoadingOverview(false);
    }
  }, [buildHeaders, handleUnauthorized, session]);

  useEffect(() => {
    if (session) {
      loadOverview();
    }
  }, [loadOverview, session]);

  // Resolve authenticated Blob URLs for unpublished draft items
  const draftItemIds = useMemo(
    () => items.filter((entry) => !entry.published).map((entry) => entry.id),
    [items],
  );

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const syncDraftPreviews = async () => {
      const missingIds = draftItemIds.filter((id) => !draftUrlsRef.current[id]);
      if (missingIds.length === 0) return;
      try {
        const fetchedEntries: [number, string][] = [];
        for (const id of missingIds) {
          const res = await fetch(`/api/media/${id}/file`, {
            credentials: 'include',
            headers: buildHeaders(),
          });
          if (!res.ok) continue;
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          fetchedEntries.push([id, objectUrl]);
        }
        if (cancelled) {
          fetchedEntries.forEach(([, url]) => URL.revokeObjectURL(url));
          return;
        }
        if (fetchedEntries.length > 0) {
          const nextMap = { ...draftUrlsRef.current };
          for (const [id, url] of fetchedEntries) {
            nextMap[id] = url;
          }
          draftUrlsRef.current = nextMap;
          setDraftUrls(nextMap);
        }
      } catch {
        // Ignore transient draft preview failures
      }
    };

    syncDraftPreviews();
    return () => {
      cancelled = true;
    };
  }, [buildHeaders, draftItemIds, session]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(draftUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);

    if (needsSetup) {
      if (loginPassword !== confirmPassword) {
        setAuthError('As senhas não conferem.');
        return;
      }
      if (loginPassword.length < 8) {
        setAuthError('A senha deve ter pelo menos 8 caracteres.');
        return;
      }
    }

    setAuthSubmitting(true);
    try {
      const endpoint = needsSetup
        ? '/api/admin/auth/setup'
        : '/api/admin/auth/login';

      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'coffee-admin',
        },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Não foi possível entrar.');
      }

      onSessionChange({
        token: body.token,
        username: body.username,
        envPasscodeActive: Boolean(body.envPasscodeActive),
      });
      setLoginPassword('');
      setConfirmPassword('');
      setNeedsSetup(false);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Erro ao autenticar.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
      setItems([]);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setErrorMessage(
        'Formato não suportado. Use JPG, PNG, WEBP, GIF, MP4, WEBM ou MOV.',
      );
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrorMessage('O arquivo excede o limite de 25 MB.');
      return;
    }

    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setLocalPreviewUrl(previewUrl);
    setUploadDuration(null);

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = previewUrl;
      video.onloadedmetadata = () => {
        setUploadAspect(
          guessAspectFromDimensions(video.videoWidth, video.videoHeight),
        );
        setUploadDuration(formatVideoDuration(video.duration));
      };
    } else {
      const img = new Image();
      img.src = previewUrl;
      img.onload = () => {
        setUploadAspect(
          guessAspectFromDimensions(img.naturalWidth, img.naturalHeight),
        );
      };
    }
  };

  const resetUploadForm = () => {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setSelectedFile(null);
    setLocalPreviewUrl(null);
    setUploadTitle('');
    setUploadAspect('portrait');
    setUploadDuration(null);
    setUploadPublished(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    if (!selectedFile) {
      setErrorMessage('Escolha uma foto ou vídeo antes de enviar.');
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', uploadTitle.trim());
      formData.append('aspect', uploadAspect);
      formData.append('published', uploadPublished ? 'true' : 'false');
      if (uploadDuration) formData.append('duration', uploadDuration);

      const res = await fetch('/api/admin/items', {
        method: 'POST',
        credentials: 'include',
        headers: buildHeaders(),
        body: formData,
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao enviar arquivo.');
      }

      const created = body as PortfolioItem;
      setItems((prev) => [created, ...prev]);
      setTitleDrafts((prev) => ({ ...prev, [created.id]: created.title }));
      resetUploadForm();
      onContentChanged();
      showTempFeedback('arquivo adicionado ao portfólio.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao enviar arquivo.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateItem = async (
    id: number,
    patch: { title?: string; aspect?: MediaAspect; published?: boolean },
  ) => {
    if (!session) return;
    setBusyItemId(id);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/items/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao atualizar item.');
      }
      const updated = body as PortfolioItem;
      setItems((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
      setTitleDrafts((prev) => ({ ...prev, [id]: updated.title }));
      onContentChanged();
      showTempFeedback('alteração salva.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao salvar alteração.',
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const handleMoveItem = async (index: number, direction: -1 | 1) => {
    if (!session) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length || reordering) return;

    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, moved);

    setItems(nextItems);
    setReordering(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/items/reorder', {
        method: 'POST',
        credentials: 'include',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderedIds: nextItems.map((entry) => entry.id) }),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        throw new Error('Não foi possível salvar a nova ordem.');
      }
      onContentChanged();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao reordenar.',
      );
      await loadOverview();
    } finally {
      setReordering(false);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!session) return;
    setBusyItemId(id);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/items/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: buildHeaders(),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao excluir item.');
      }
      setItems((prev) => prev.filter((entry) => entry.id !== id));
      setConfirmDeleteId(null);
      if (draftUrlsRef.current[id]) {
        URL.revokeObjectURL(draftUrlsRef.current[id]);
        const nextMap = { ...draftUrlsRef.current };
        delete nextMap[id];
        draftUrlsRef.current = nextMap;
        setDraftUrls(nextMap);
      }
      onContentChanged();
      showTempFeedback('item removido.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao excluir item.',
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const handleSaveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setSavingSettings(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(settingsForm),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao salvar configurações.');
      }
      const updated = body as SiteSettings;
      setSettings(updated);
      setSettingsForm(updated);
      onContentChanged();
      showTempFeedback('configurações atualizadas.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao salvar configurações.',
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('As novas senhas não conferem.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setSavingPassword(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          username: nextUsername.trim(),
          currentPassword,
          newPassword,
        }),
      });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Senha atual incorreta.');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Erro ao atualizar credenciais.');
      }
      onSessionChange({
        ...session,
        username: body.username || nextUsername.trim(),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      showTempFeedback('credenciais de acesso atualizadas.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao atualizar credenciais.',
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const getMediaSrc = (item: PortfolioItem) =>
    item.published ? item.mediaUrl : draftUrls[item.id] || '';

  const publishedCount = items.filter((entry) => entry.published).length;

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#111111] flex flex-col">
      {/* Dedicated Discreet Standalone Admin Header */}
      <header className="sticky top-0 z-40 bg-[#F7F7F5] border-b border-[#DCDCD4]">
        <div className="max-w-[1440px] mx-auto px-5 md:px-8 h-14 flex items-center justify-between gap-8">
          <div className="flex items-baseline gap-2.5 whitespace-nowrap shrink-0">
            <span className="font-display text-lg font-bold tracking-[-0.04em] text-[#111111]">
              {settings.siteName || siteName || 'coffee'}
            </span>
            <span className="font-mono text-xs text-[#666662]">/ admin</span>
          </div>

          {session ? (
            <nav
              aria-label="Seções do admin"
              className="hidden sm:flex items-center gap-7 font-mono text-xs text-[#666662]"
            >
              {(
                [
                  { id: 'acervo', label: 'acervo' },
                  { id: 'fluxo', label: 'fluxo' },
                  { id: 'config', label: 'config' },
                ] as { id: AdminSection; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSection(tab.id)}
                  className={`py-1 border-b transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                    section === tab.id
                      ? 'text-[#111111] border-[#1A3AFF]'
                      : 'border-transparent hover:text-[#111111]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          ) : (
            <div aria-hidden="true" />
          )}

          <div className="shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-3.5 py-2 font-mono text-xs border border-[#DCDCD4] text-[#111111] hover:border-[#111111] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              ver site
            </button>
            {session && (
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogoutClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] disabled:opacity-50 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{loggingOut ? 'saindo...' : 'sair'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 md:px-8">
        {!sessionChecked || checkingStatus ? (
          <section className="py-24 max-w-md mx-auto text-center font-mono text-xs text-[#666662]">
            carregando painel...
          </section>
        ) : !session ? (
          /* Standalone Username & Password Setup / Login */
          <section className="py-20 md:py-28 max-w-md mx-auto">
            <div className="border border-[#DCDCD4] bg-[#F7F7F5] p-8 space-y-6">
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-[#111111]">
                  {needsSetup ? 'criar acesso' : 'entrar'}
                </h1>
                <p className="text-sm text-[#666662] leading-relaxed">
                  {needsSetup
                    ? 'Defina o usuário e a senha próprios do seu painel.'
                    : 'Seu acesso permanece conectado neste navegador até você sair.'}
                </p>
              </div>

              {authError && (
                <p className="font-mono text-xs text-[#B91C1C]">{authError}</p>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="admin-username"
                    className="block font-mono text-xs text-[#666662]"
                  >
                    usuário
                  </label>
                  <input
                    id="admin-username"
                    type="text"
                    required
                    autoComplete="username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder={needsSetup ? 'ex: vitor' : 'seu usuário'}
                    className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="admin-password"
                    className="block font-mono text-xs text-[#666662]"
                  >
                    senha
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    minLength={needsSetup ? 8 : 1}
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={needsSetup ? 'mínimo 8 caracteres' : '••••••••'}
                    className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                  />
                </div>

                {needsSetup && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="admin-password-confirm"
                      className="block font-mono text-xs text-[#666662]"
                    >
                      confirmar senha
                    </label>
                    <input
                      id="admin-password-confirm"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="repita a senha"
                      className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full py-3 px-4 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {authSubmitting
                    ? 'aguarde...'
                    : needsSetup
                      ? 'definir acesso e entrar'
                      : 'entrar'}
                </button>
              </form>
            </div>
          </section>
        ) : (
          /* Authenticated Admin Workspace */
          <div className="pb-16">
            {/* Admin sub-strip */}
            <div className="py-5 border-b border-[#DCDCD4] flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
              <div className="flex flex-wrap items-center gap-3 text-[#666662]">
                <span className="text-[#111111]">{session.username}</span>
                <span aria-hidden="true">/</span>
                <span className="tabular-nums">
                  {String(items.length).padStart(2, '0')} itens ({publishedCount} públicos)
                </span>
              </div>

              {/* Mobile admin section nav */}
              <div className="flex sm:hidden items-center gap-4 text-[#666662]">
                {(
                  [
                    { id: 'acervo', label: 'acervo' },
                    { id: 'fluxo', label: 'fluxo' },
                    { id: 'config', label: 'config' },
                  ] as { id: AdminSection; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSection(tab.id)}
                    className={`cursor-pointer ${
                      section === tab.id
                        ? 'text-[#111111] underline underline-offset-4 decoration-[#1A3AFF]'
                        : ''
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inline feedback / error strip */}
            {(feedback || errorMessage) && (
              <div className="mt-5 py-2.5 px-3.5 border border-[#DCDCD4] font-mono text-xs flex items-center justify-between gap-4">
                <span className={errorMessage ? 'text-[#B91C1C]' : 'text-[#1A3AFF]'}>
                  {errorMessage || feedback}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setErrorMessage(null);
                  }}
                  className="text-[#666662] hover:text-[#111111] cursor-pointer"
                >
                  fechar
                </button>
              </div>
            )}

            {/* TAB 1: ACERVO (Upload + Manage SQL Items) */}
            {section === 'acervo' && (
              <div className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                {/* Upload Column */}
                <section className="lg:col-span-4 lg:sticky lg:top-20 border border-[#DCDCD4] p-6 space-y-5">
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-bold tracking-[-0.02em] text-[#111111]">
                      novo envio
                    </h2>
                    <p className="font-mono text-[11px] text-[#666662]">
                      jpg, png, webp, gif, mp4, webm ou mov · até 25 mb
                    </p>
                  </div>

                  <form onSubmit={handleUploadSubmit} className="space-y-4">
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                        onChange={handleFileSelected}
                        className="hidden"
                        id="portfolio-file-upload"
                      />
                      <label
                        htmlFor="portfolio-file-upload"
                        className="block border border-dashed border-[#B8B8AE] hover:border-[#111111] transition-colors p-5 text-center cursor-pointer"
                      >
                        {localPreviewUrl && selectedFile ? (
                          <div className="space-y-3">
                            <div className="aspect-[4/3] bg-[#EAEAE4] overflow-hidden">
                              {selectedFile.type.startsWith('video/') ? (
                                <video
                                  src={localPreviewUrl}
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <img
                                  src={localPreviewUrl}
                                  alt="Pré-visualização"
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                            <p className="font-mono text-[11px] text-[#111111] truncate">
                              {selectedFile.name}
                            </p>
                          </div>
                        ) : (
                          <div className="py-4 flex flex-col items-center gap-2 font-mono text-xs text-[#666662]">
                            <Upload className="w-4 h-4 text-[#111111]" />
                            <span>escolher foto ou vídeo</span>
                          </div>
                        )}
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="upload-title"
                        className="block font-mono text-[11px] text-[#666662]"
                      >
                        título (opcional)
                      </label>
                      <input
                        id="upload-title"
                        type="text"
                        maxLength={160}
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="sem título"
                        className="w-full px-3 py-2 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="block font-mono text-[11px] text-[#666662]">
                        proporção na folha
                      </span>
                      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                        {(
                          [
                            { value: 'portrait', label: 'retrato' },
                            { value: 'landscape', label: 'paisagem' },
                            { value: 'square', label: 'quadrado' },
                          ] as { value: MediaAspect; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setUploadAspect(opt.value)}
                            className={`py-2 border transition-colors cursor-pointer ${
                              uploadAspect === opt.value
                                ? 'border-[#111111] bg-[#111111] text-[#F7F7F5]'
                                : 'border-[#DCDCD4] text-[#666662] hover:border-[#111111] hover:text-[#111111]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 font-mono text-xs text-[#111111] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={uploadPublished}
                        onChange={(e) => setUploadPublished(e.target.checked)}
                        className="accent-[#1A3AFF] w-3.5 h-3.5"
                      />
                      <span>publicar imediatamente no site</span>
                    </label>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="submit"
                        disabled={!selectedFile || uploading}
                        className="flex-1 py-2.5 px-4 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        {uploading ? 'enviando...' : 'enviar arquivo'}
                      </button>
                      {selectedFile && !uploading && (
                        <button
                          type="button"
                          onClick={resetUploadForm}
                          className="py-2.5 px-3 font-mono text-xs border border-[#DCDCD4] text-[#666662] hover:text-[#111111] hover:border-[#111111] transition-colors cursor-pointer"
                        >
                          limpar
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                {/* Items Management List */}
                <section className="lg:col-span-8 space-y-4">
                  <div className="flex items-baseline justify-between border-b border-[#DCDCD4] pb-3">
                    <h2 className="font-display text-base font-bold tracking-[-0.02em] text-[#111111]">
                      arquivos enviados
                    </h2>
                    <span className="font-mono text-[11px] text-[#666662] tabular-nums">
                      ordem de exibição no site
                    </span>
                  </div>

                  {loadingOverview ? (
                    <p className="py-12 font-mono text-xs text-[#666662]">
                      carregando arquivos...
                    </p>
                  ) : items.length === 0 ? (
                    <div className="py-16 border border-dashed border-[#DCDCD4] text-center font-mono text-xs text-[#666662]">
                      nenhum arquivo enviado ainda. use o formulário ao lado para publicar o primeiro item.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#DCDCD4] border-b border-[#DCDCD4]">
                      {items.map((item, idx) => {
                        const src = getMediaSrc(item);
                        const draftTitle = titleDrafts[item.id] ?? item.title;
                        const titleDirty = draftTitle.trim() !== item.title;
                        const isBusy = busyItemId === item.id;

                        return (
                          <div
                            key={item.id}
                            className="py-4 flex flex-col sm:flex-row sm:items-center gap-4"
                          >
                            {/* Thumbnail + Index */}
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono text-[11px] text-[#666662] tabular-nums w-7">
                                {formatItemIndex(idx)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setLightboxItem(item)}
                                className="relative w-20 h-20 bg-[#EAEAE4] overflow-hidden shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
                                aria-label={`Visualizar ${item.title || `item ${idx + 1}`}`}
                              >
                                {!src ? (
                                  <span className="flex items-center justify-center w-full h-full font-mono text-[10px] text-[#666662]">
                                    ...
                                  </span>
                                ) : item.kind === 'video' ? (
                                  <video
                                    src={src}
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <SafeImage
                                    src={src}
                                    alt={item.title || `Item ${idx + 1}`}
                                    fallbackLabel={formatItemIndex(idx)}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                                {item.kind === 'video' && (
                                  <span className="absolute bottom-1 right-1 bg-[#0A0A09]/80 text-[#F7F7F5] p-1">
                                    <Play className="w-2.5 h-2.5 fill-current" />
                                  </span>
                                )}
                              </button>
                            </div>

                            {/* Metadata & Controls */}
                            <div className="flex-1 min-w-0 space-y-2.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  maxLength={160}
                                  value={draftTitle}
                                  onChange={(e) =>
                                    setTitleDrafts((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && titleDirty) {
                                      e.preventDefault();
                                      handleUpdateItem(item.id, { title: draftTitle });
                                    }
                                  }}
                                  placeholder="sem título"
                                  aria-label="Título do item"
                                  className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                                />
                                {titleDirty && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      handleUpdateItem(item.id, { title: draftTitle })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] transition-colors cursor-pointer shrink-0"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>salvar</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] text-[#666662]">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span>
                                    {item.kind === 'video' ? 'vídeo' : 'foto'}
                                    {item.duration ? ` · ${item.duration}` : ''}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">
                                    {formatItemDate(item.createdAt)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <select
                                    aria-label="Proporção"
                                    disabled={isBusy}
                                    value={item.aspect}
                                    onChange={(e) =>
                                      handleUpdateItem(item.id, {
                                        aspect: e.target.value as MediaAspect,
                                      })
                                    }
                                    className="bg-transparent text-[#111111] border-b border-[#DCDCD4] focus:border-[#111111] focus:outline-none cursor-pointer"
                                  >
                                    <option value="portrait">retrato</option>
                                    <option value="landscape">paisagem</option>
                                    <option value="square">quadrado</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() =>
                                      handleUpdateItem(item.id, {
                                        published: !item.published,
                                      })
                                    }
                                    className={`inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                      item.published
                                        ? 'text-[#111111] hover:text-[#1A3AFF]'
                                        : 'text-[#666662] hover:text-[#111111]'
                                    }`}
                                  >
                                    {item.published ? (
                                      <>
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>público</span>
                                      </>
                                    ) : (
                                      <>
                                        <EyeOff className="w-3.5 h-3.5" />
                                        <span>rascunho</span>
                                      </>
                                    )}
                                  </button>

                                  <div className="flex items-center gap-1 border-l border-[#DCDCD4] pl-3">
                                    <button
                                      type="button"
                                      disabled={idx === 0 || reordering}
                                      onClick={() => handleMoveItem(idx, -1)}
                                      aria-label="Mover para cima"
                                      className="p-1 text-[#666662] hover:text-[#111111] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === items.length - 1 || reordering}
                                      onClick={() => handleMoveItem(idx, 1)}
                                      aria-label="Mover para baixo"
                                      className="p-1 text-[#666662] hover:text-[#111111] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="border-l border-[#DCDCD4] pl-3">
                                    {confirmDeleteId === item.id ? (
                                      <span className="inline-flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={isBusy}
                                          onClick={() => handleDeleteItem(item.id)}
                                          className="text-[#B91C1C] underline underline-offset-2 cursor-pointer"
                                        >
                                          confirmar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="text-[#666662] hover:text-[#111111] cursor-pointer"
                                        >
                                          cancelar
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => setConfirmDeleteId(item.id)}
                                        aria-label="Excluir item"
                                        className="text-[#666662] hover:text-[#B91C1C] transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* TAB 2: FLUXO */}
            {section === 'fluxo' && (
              <section aria-label="Fluxo do acervo" className="py-10 md:py-14">
                {loadingOverview ? (
                  <p className="py-12 text-center font-mono text-xs text-[#666662]">
                    carregando fluxo...
                  </p>
                ) : items.length === 0 ? (
                  <div className="py-20 text-center font-mono text-xs text-[#666662] space-y-3">
                    <p>nenhum arquivo no fluxo ainda.</p>
                    <button
                      type="button"
                      onClick={() => setSection('acervo')}
                      className="text-[#111111] underline underline-offset-4 hover:text-[#1A3AFF] cursor-pointer"
                    >
                      ir para acervo e enviar mídia
                    </button>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-20">
                    {items.map((item, idx) => {
                      const src = getMediaSrc(item);
                      return (
                        <article key={item.id}>
                          <button
                            type="button"
                            onClick={() => setLightboxItem(item)}
                            className="group block w-full text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1A3AFF]"
                          >
                            <div className="relative w-full overflow-hidden bg-[#EAEAE4] transition-opacity duration-150 group-hover:opacity-90">
                              {!src ? (
                                <div className="aspect-[16/10] flex items-center justify-center font-mono text-xs text-[#666662]">
                                  carregando prévia...
                                </div>
                              ) : item.kind === 'video' ? (
                                <video
                                  src={src}
                                  muted
                                  playsInline
                                  className="w-full max-h-[75vh] object-contain bg-[#0A0A09]"
                                />
                              ) : (
                                <SafeImage
                                  src={src}
                                  alt={item.title || `Item ${formatItemIndex(idx)}`}
                                  fallbackLabel={item.title || formatItemIndex(idx)}
                                  className="w-full max-h-[75vh] object-contain mx-auto"
                                />
                              )}

                              {item.kind === 'video' && item.duration && (
                                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs bg-[#0A0A09]/85 text-[#F7F7F5] border border-white/15 tabular-nums">
                                  <Play className="w-3 h-3 fill-current" aria-hidden="true" />
                                  <span>{item.duration}</span>
                                </span>
                              )}
                            </div>

                            <div className="mt-3 flex items-baseline justify-between gap-4">
                              <p className="text-sm text-[#111111] group-hover:text-[#1A3AFF] transition-colors">
                                {item.title || formatItemIndex(idx)}
                              </p>
                              <span className="font-mono text-xs text-[#666662] tabular-nums whitespace-nowrap shrink-0">
                                {!item.published ? 'rascunho · ' : ''}
                                {formatItemDate(item.createdAt)}
                              </span>
                            </div>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* TAB 3: CONFIG (Site Settings + Standalone Credentials) */}
            {section === 'config' && (
              <div className="py-10 grid grid-cols-1 lg:grid-cols-12 gap-14 items-start">
                <section className="lg:col-span-6">
                  <div className="space-y-1 pb-6 border-b border-[#DCDCD4]">
                    <h2 className="font-display text-base font-bold tracking-[-0.02em] text-[#111111]">
                      informações do site
                    </h2>
                    <p className="font-mono text-xs text-[#666662]">
                      edite o nome, a descrição, o e-mail de contato e os créditos do rodapé.
                    </p>
                  </div>

                  <form onSubmit={handleSaveSettings} className="pt-6 space-y-5">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="setting-site-name"
                        className="block font-mono text-xs text-[#666662]"
                      >
                        nome do site
                      </label>
                      <input
                        id="setting-site-name"
                        type="text"
                        required
                        maxLength={60}
                        value={settingsForm.siteName}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            siteName: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="setting-footer-desc"
                        className="block font-mono text-xs text-[#666662]"
                      >
                        descrição do rodapé
                      </label>
                      <textarea
                        id="setting-footer-desc"
                        rows={3}
                        maxLength={240}
                        value={settingsForm.footerDescription}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            footerDescription: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111] resize-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="setting-email"
                        className="block font-mono text-xs text-[#666662]"
                      >
                        e-mail de contato
                      </label>
                      <input
                        id="setting-email"
                        type="email"
                        maxLength={120}
                        value={settingsForm.contactEmail}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            contactEmail: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="setting-credit"
                        className="block font-mono text-xs text-[#666662]"
                      >
                        crédito do rodapé
                      </label>
                      <input
                        id="setting-credit"
                        type="text"
                        maxLength={120}
                        value={settingsForm.footerCredit}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            footerCredit: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                      />
                    </div>

                    <div className="pt-2 flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="px-5 py-2.5 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        {savingSettings ? 'salvando...' : 'salvar alterações'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsForm(settings)}
                        className="px-4 py-2.5 font-mono text-xs border border-[#DCDCD4] text-[#666662] hover:text-[#111111] hover:border-[#111111] transition-colors cursor-pointer"
                      >
                        reverter
                      </button>
                    </div>
                  </form>
                </section>

                {/* Change Admin Credentials Section */}
                {!session.envPasscodeActive && (
                  <section className="lg:col-span-6">
                    <div className="space-y-1 pb-6 border-b border-[#DCDCD4]">
                      <h2 className="font-display text-base font-bold tracking-[-0.02em] text-[#111111]">
                        acesso ao painel
                      </h2>
                      <p className="font-mono text-xs text-[#666662]">
                        altere seu usuário e senha próprios de administrador.
                      </p>
                    </div>

                    <form onSubmit={handleChangePassword} className="pt-6 space-y-5">
                      <div className="space-y-1.5">
                        <label
                          htmlFor="cred-username"
                          className="block font-mono text-xs text-[#666662]"
                        >
                          usuário
                        </label>
                        <input
                          id="cred-username"
                          type="text"
                          required
                          value={nextUsername}
                          onChange={(e) => setNextUsername(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="cred-current-password"
                          className="block font-mono text-xs text-[#666662]"
                        >
                          senha atual
                        </label>
                        <input
                          id="cred-current-password"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="cred-new-password"
                          className="block font-mono text-xs text-[#666662]"
                        >
                          nova senha
                        </label>
                        <input
                          id="cred-new-password"
                          type="password"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="mínimo 8 caracteres"
                          className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="cred-confirm-password"
                          className="block font-mono text-xs text-[#666662]"
                        >
                          confirmar nova senha
                        </label>
                        <input
                          id="cred-confirm-password"
                          type="password"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm bg-transparent border border-[#DCDCD4] focus:border-[#111111] focus:outline-none text-[#111111]"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={savingPassword}
                          className="px-5 py-2.5 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          {savingPassword ? 'atualizando...' : 'atualizar senha'}
                        </button>
                      </div>
                    </form>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <MediaLightbox
        item={lightboxItem}
        items={items}
        resolvedUrls={draftUrls}
        onClose={() => setLightboxItem(null)}
        onSelect={(next) => setLightboxItem(next)}
      />
    </div>
  );
}
