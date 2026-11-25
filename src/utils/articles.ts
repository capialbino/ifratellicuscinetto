const ITALIAN_MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

const ENGLISH_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type Locale = 'it' | 'en';

export function formatDate(date: Date, locale: Locale = 'it'): string {
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  if (locale === 'en') {
    return `${ENGLISH_MONTHS[date.getUTCMonth()]} ${day}, ${year}`;
  }
  return `${day} ${ITALIAN_MONTHS[date.getUTCMonth()]} ${year}`;
}

export const CATEGORY_LABELS: Record<Locale, Record<keyof typeof CATEGORY_META, string>> = {
  it: {
    Meccanica: 'Meccanica',
    'AI & Software': 'AI & Software',
    'Meccatronica & Hybrid': 'Meccanica × AI',
  },
  en: {
    Meccanica: 'Mechanical Engineering',
    'AI & Software': 'AI & Software',
    'Meccatronica & Hybrid': 'Mechanical × AI',
  },
};

export const LEVEL_LABELS: Record<Locale, Record<'Divulgativo' | 'Intermedio' | 'Tecnico / Avanzato', string>> = {
  it: {
    Divulgativo: 'Divulgativo',
    Intermedio: 'Intermedio',
    'Tecnico / Avanzato': 'Tecnico / Avanzato',
  },
  en: {
    Divulgativo: 'Introductory',
    Intermedio: 'Intermediate',
    'Tecnico / Avanzato': 'Technical / Advanced',
  },
};

export function estimateReadingTime(body: string | undefined): number {
  if (!body) return 1;
  const cleaned = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/[#*_`>\-\[\]()]/g, ' ');
  const words = cleaned.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 190));
}

export const CATEGORY_META: Record<
  'Meccanica' | 'AI & Software' | 'Meccatronica & Hybrid',
  { slug: string; badgeClass: string; shortLabel: string }
> = {
  Meccanica: {
    slug: 'meccanica',
    badgeClass: 'badge-mech',
    shortLabel: 'Meccanica',
  },
  'AI & Software': {
    slug: 'ai-software',
    badgeClass: 'badge-ai',
    shortLabel: 'AI & Software',
  },
  'Meccatronica & Hybrid': {
    slug: 'meccatronica-hybrid',
    badgeClass: 'badge-hybrid',
    shortLabel: 'Meccanica × AI',
  },
};
