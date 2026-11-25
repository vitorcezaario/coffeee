export type MediaKind = 'foto' | 'video';
export type ArchiveFilter = 'tudo' | MediaKind;

export interface ArchiveItem {
  id: string;
  index: string;
  filename: string;
  title: string;
  kind: MediaKind;
  date: string;
  location: string;
  format: string;
  duration?: string;
  aspect: 'portrait' | 'landscape' | 'square';
  swatchColor: string;
  imageUrl?: string;
  videoUrl?: string;
  note: string;
  isUserUpload?: boolean;
}

export const INITIAL_ARCHIVE_ITEMS: ArchiveItem[] = [
  {
    id: 'raw-001',
    index: '001',
    filename: '001_trem_minidv.mov',
    title: 'Janela do trem no fim da tarde',
    kind: 'video',
    date: '2026-10',
    location: 'são paulo',
    format: 'minidv hi8',
    duration: '00:34',
    aspect: 'landscape',
    swatchColor: '#1C1B1A',
    note: 'voltando pro centro perto das 18h, vidro riscado e céu virando laranja.',
  },
  {
    id: 'raw-002',
    index: '002',
    filename: '002_calcada_flash.jpg',
    title: 'Calçada molhada, flash direto',
    kind: 'foto',
    date: '2026-10',
    location: 'centro sp',
    format: '35mm · flash',
    aspect: 'portrait',
    swatchColor: '#D9D8D0',
    note: 'depois de uma garoa rápida, ponto e disparo sem pensar muito.',
  },
  {
    id: 'raw-003',
    index: '003',
    filename: '003_mesa_k7.jpg',
    title: 'Cópias, fita k7 e café frio',
    kind: 'foto',
    date: '2026-09',
    location: 'estúdio',
    format: '35mm · natural',
    aspect: 'square',
    swatchColor: '#3B2F28',
    note: 'separando testes em p&b espalhados no compensado.',
  },
  {
    id: 'raw-004',
    index: '004',
    filename: '004_praca_16mm.mov',
    title: 'Praça aberta, sombra longa',
    kind: 'video',
    date: '2026-09',
    location: 'são paulo',
    format: '16mm · 24fps',
    duration: '00:48',
    aspect: 'landscape',
    swatchColor: '#1A3AFF',
    note: 'take único acompanhando a linha de sol na pedra antes de escurecer.',
  },
  {
    id: 'raw-005',
    index: '005',
    filename: '005_janela_caixa.jpg',
    title: 'Sombra da janela na parede',
    kind: 'foto',
    date: '2026-08',
    location: 'apto',
    format: '35mm · portra',
    aspect: 'portrait',
    swatchColor: '#C6C5BC',
    note: '16h30 batendo no reboco velho ao lado do monitor de áudio.',
  },
  {
    id: 'raw-006',
    index: '006',
    filename: '006_corrimao_azul.jpg',
    title: 'Diagonal e corrimão azul',
    kind: 'foto',
    date: '2026-07',
    location: 'higienópolis',
    format: '35mm · f/8',
    aspect: 'portrait',
    swatchColor: '#2E2D2B',
    note: 'só sombra, cal branco e ferro pintado.',
  },
  {
    id: 'raw-007',
    index: '007',
    filename: '007_rolo14_contato.mov',
    title: 'Folhas de contato — rolo 14',
    kind: 'video',
    date: '2026-06',
    location: 'estúdio',
    format: '16mm · mudo',
    duration: '01:05',
    aspect: 'landscape',
    swatchColor: '#E4E3DC',
    note: 'folheando negativos revelados e anotações do caderno azul.',
  },
  {
    id: 'raw-008',
    index: '008',
    filename: '008_espresso_vidro.jpg',
    title: 'Café gelado e câmera na mesa',
    kind: 'foto',
    date: '2026-05',
    location: 'pinheiros',
    format: '120mm',
    aspect: 'portrait',
    swatchColor: '#8C8980',
    note: 'luz atravessando o gelo antes de sair pra rua.',
  },
];
