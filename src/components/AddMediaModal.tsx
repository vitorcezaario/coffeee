import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ArchiveItem, MediaKind } from '../data/archive';

interface AddMediaModalProps {
  isOpen: boolean;
  nextSequence: number;
  onClose: () => void;
  onAdd: (item: ArchiveItem) => void;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:15';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function AddMediaModal({
  isOpen,
  nextSequence,
  onClose,
  onAdd,
}: AddMediaModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MediaKind>('foto');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isVideoFile, setIsVideoFile] = useState(false);
  const [duration, setDuration] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle('');
    setKind('foto');
    setPreviewUrl('');
    setIsVideoFile(false);
    setDuration(undefined);
    setErrorMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      setErrorMessage('use jpg, png, webp, mp4, mov ou webm.');
      return;
    }

    setErrorMessage('');
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsVideoFile(isVideo);

    if (isVideo) {
      setKind('video');
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.src = objectUrl;
      probe.onloadedmetadata = () => {
        setDuration(formatDuration(probe.duration));
      };
    } else {
      setKind('foto');
      setDuration(undefined);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (!previewUrl) {
      setErrorMessage('escolha uma foto ou vídeo antes de salvar.');
      return;
    }

    const indexStr = String(nextSequence).padStart(3, '0');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const newItem: ArchiveItem = {
      id: `user-${Date.now()}`,
      index: indexStr,
      title: title.trim(),
      kind,
      date: dateStr,
      duration: isVideoFile ? duration || '00:20' : undefined,
      aspect: isVideoFile ? 'landscape' : 'portrait',
      swatchColor: '#D9D8D0',
      imageUrl: isVideoFile ? undefined : previewUrl,
      videoUrl: isVideoFile ? previewUrl : undefined,
      isUserUpload: true,
    };

    onAdd(newItem);
    resetForm();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111111]/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="raw-upload-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#F7F7F5] border border-[#111111] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#DCDCD4] flex items-center justify-between gap-4">
          <h2 id="raw-upload-title" className="font-mono text-xs text-[#111111]">
            + subir mídia ({String(nextSequence).padStart(3, '0')})
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 flex items-center justify-center text-[#111111] hover:bg-[#ECECE8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="sr-only"
              id="raw-file-input"
            />
            <label
              htmlFor="raw-file-input"
              className="block border border-dashed border-[#111111]/40 bg-[#EFEFEB] hover:border-[#1A3AFF] transition-colors cursor-pointer"
            >
              {previewUrl ? (
                <div className="relative aspect-video bg-[#0A0A09] flex items-center justify-center">
                  {isVideoFile ? (
                    <video
                      src={previewUrl}
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Prévia"
                      className="w-full h-full object-contain"
                    />
                  )}
                  <span className="absolute bottom-2 right-2 px-2.5 py-1 font-mono text-[11px] bg-[#F7F7F5] text-[#111111]">
                    trocar
                  </span>
                </div>
              ) : (
                <div className="py-10 px-4 text-center">
                  <p className="font-mono text-xs text-[#111111]">
                    clicar para escolher foto ou vídeo
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[#666662]">
                    jpg · png · webp · mp4 · mov · webm
                  </p>
                </div>
              )}
            </label>
          </div>

          <div>
            <label htmlFor="raw-title" className="block font-mono text-[11px] text-[#666662] mb-1.5">
              título (opcional)
            </label>
            <input
              id="raw-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="escolha um título para a imagem..."
              className="w-full px-3 py-2.5 text-sm bg-white border border-[#DCDCD4] text-[#111111] placeholder:text-[#666662]/60 focus:outline-none focus:border-[#111111]"
            />
          </div>

          {errorMessage && (
            <p className="font-mono text-xs text-[#B91C1C]" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 font-mono text-xs text-[#666662] hover:text-[#111111] cursor-pointer"
            >
              cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 font-mono text-xs bg-[#111111] text-[#F7F7F5] hover:bg-[#1A3AFF] transition-colors cursor-pointer"
            >
              guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
