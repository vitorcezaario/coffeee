export type MediaKind = 'foto' | 'video';
export type ArchiveFilter = 'tudo' | MediaKind;

export interface ArchiveItem {
  id: string;
  index: string;
  title: string;
  kind: MediaKind;
  date: string;
  duration?: string;
  aspect: 'portrait' | 'landscape' | 'square';
  swatchColor: string;
  imageUrl?: string;
  videoUrl?: string;
  isUserUpload?: boolean;
}

export const INITIAL_ARCHIVE_ITEMS: ArchiveItem[] = [
  {
    id: 'slot-001',
    index: '001',
    title: '',
    kind: 'video',
    date: '2026-10',
    aspect: 'landscape',
    swatchColor: '#1C1B1A',
  },
  {
    id: 'slot-002',
    index: '002',
    title: '',
    kind: 'foto',
    date: '2026-10',
    aspect: 'portrait',
    swatchColor: '#D9D8D0',
  },
  {
    id: 'slot-003',
    index: '003',
    title: '',
    kind: 'foto',
    date: '2026-09',
    aspect: 'square',
    swatchColor: '#3B2F28',
  },
  {
    id: 'slot-004',
    index: '004',
    title: '',
    kind: 'video',
    date: '2026-09',
    aspect: 'landscape',
    swatchColor: '#1A3AFF',
  },
  {
    id: 'slot-005',
    index: '005',
    title: '',
    kind: 'foto',
    date: '2026-08',
    aspect: 'portrait',
    swatchColor: '#C6C5BC',
  },
  {
    id: 'slot-006',
    index: '006',
    title: '',
    kind: 'foto',
    date: '2026-07',
    aspect: 'portrait',
    swatchColor: '#2E2D2B',
  },
  {
    id: 'slot-007',
    index: '007',
    title: '',
    kind: 'video',
    date: '2026-06',
    aspect: 'landscape',
    swatchColor: '#E4E3DC',
  },
  {
    id: 'slot-008',
    index: '008',
    title: '',
    kind: 'foto',
    date: '2026-05',
    aspect: 'portrait',
    swatchColor: '#8C8980',
  },
];
