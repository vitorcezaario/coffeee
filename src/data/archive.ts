export type MediaKind = 'foto' | 'video';
export type MediaAspect = 'portrait' | 'landscape' | 'square';

export interface PortfolioItem {
  id: number;
  title: string;
  kind: MediaKind;
  aspect: MediaAspect;
  mimeType: string;
  duration: string | null;
  displayWidth: number | null;
  displayHeight: number | null;
  posX: number | null;
  posY: number | null;
  zIndex: number;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  mediaUrl: string;
}

export interface SiteSettings {
  siteName: string;
  footerDescription: string;
  contactEmail: string;
  footerCredit: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: 'coffee',
  footerDescription: 'arquivo pessoal, feito para portifolios customizados',
  contactEmail: 'vitorcezario1@hotmail.com',
  footerCredit: 'feito por vitor cezario',
};

export function formatItemDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${month}.${year}`;
}

export function formatItemIndex(position: number): string {
  return String(position + 1).padStart(3, '0');
}
