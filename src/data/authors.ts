import type { Locale } from '../utils/articles';

export interface Author {
  id: 'federico-pappafava' | 'alessandro-rossi' | 'alessandro-capialbi';
  name: string;
  role: string;
  discipline: string;
  bio: string;
  initials: string;
  accentColor: string;
  github?: string;
  linkedin?: string;
}

export const AUTHORS: Record<Author['id'], Author> = {
  'federico-pappafava': {
    id: 'federico-pappafava',
    name: 'Federico Pappafava',
    role: 'Ingegnere Meccanico',
    discipline: 'Turbo & Formula 1',
    bio: 'Lavora sui turbocompressori di Formula 1, tra meccanica e sistemi ad alte prestazioni.',
    initials: 'FP',
    accentColor: '#c85a17',
  },
  'alessandro-rossi': {
    id: 'alessandro-rossi',
    name: 'Alessandro Rossi',
    role: 'Ingegnere Meccanico',
    discipline: 'Ingegneria Meccanica',
    bio: 'Si occupa di ingegneria meccanica e racconta le idee e le applicazioni che incontra nel suo lavoro.',
    initials: 'AR',
    accentColor: '#0f766e',
  },
  'alessandro-capialbi': {
    id: 'alessandro-capialbi',
    name: 'Alessandro Capialbi',
    role: 'Ingegnere Informatico & AI Engineer',
    discipline: 'Intelligenza Artificiale & Software',
    bio: 'Si occupa di intelligenza artificiale, sistemi software e applicazioni tecniche del machine learning.',
    initials: 'AC',
    accentColor: '#2563eb',
  },
};

const ENGLISH_AUTHORS: Record<Author['id'], Pick<Author, 'role' | 'discipline' | 'bio'>> = {
  'federico-pappafava': {
    role: 'Mechanical Engineer',
    discipline: 'Turbochargers & Formula 1',
    bio: 'Works on Formula 1 turbochargers, at the intersection of mechanical engineering and high-performance systems.',
  },
  'alessandro-rossi': {
    role: 'Mechanical Engineer',
    discipline: 'Mechanical Engineering',
    bio: 'Works in mechanical engineering and shares the ideas and applications he encounters in his work.',
  },
  'alessandro-capialbi': {
    role: 'Computer Engineer & AI Engineer',
    discipline: 'Artificial Intelligence & Software',
    bio: 'Works on artificial intelligence, software systems, and applied machine learning.',
  },
};

export function getAuthor(id: Author['id'], locale: Locale = 'it'): Author {
  return locale === 'en' ? { ...AUTHORS[id], ...ENGLISH_AUTHORS[id] } : AUTHORS[id];
}
