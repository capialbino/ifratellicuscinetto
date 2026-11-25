import type { Locale } from '../utils/articles';

export interface Author {
  id: 'marco' | 'luca' | 'alessandro';
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
  marco: {
    id: 'marco',
    name: 'Federico Pappafava',
    role: 'Ingegnere Meccanico',
    discipline: 'Turbo & Formula 1',
    bio: 'Lavora sui turbocompressori di Formula 1, tra meccanica e sistemi ad alte prestazioni.',
    initials: 'FP',
    accentColor: '#c85a17',
  },
  luca: {
    id: 'luca',
    name: 'Alessandro Rossi',
    role: 'Ingegnere Meccanico',
    discipline: 'Ingegneria Meccanica',
    bio: 'Si occupa di ingegneria meccanica e racconta le idee e le applicazioni che incontra nel suo lavoro.',
    initials: 'AR',
    accentColor: '#0f766e',
  },
  alessandro: {
    id: 'alessandro',
    name: 'Alessandro Capialbi',
    role: 'Ingegnere Informatico & AI Engineer',
    discipline: 'Intelligenza Artificiale & Software',
    bio: 'Costruisce ponti tra reti neurali e mondo fisico: PINN, manutenzione predittiva, edge AI e architetture software ad alte prestazioni.',
    initials: 'AC',
    accentColor: '#2563eb',
  },
};

const ENGLISH_AUTHORS: Record<Author['id'], Pick<Author, 'role' | 'discipline' | 'bio'>> = {
  marco: {
    role: 'Mechanical Engineer',
    discipline: 'Turbochargers & Formula 1',
    bio: 'Works on Formula 1 turbochargers, at the intersection of mechanical engineering and high-performance systems.',
  },
  luca: {
    role: 'Mechanical Engineer',
    discipline: 'Mechanical Engineering',
    bio: 'Works in mechanical engineering and shares the ideas and applications he encounters in his work.',
  },
  alessandro: {
    role: 'Computer Engineer & AI Engineer',
    discipline: 'Artificial Intelligence & Software',
    bio: 'Builds bridges between neural networks and the physical world: PINNs, predictive maintenance, edge AI, and high-performance software architectures.',
  },
};

export function getAuthor(id: Author['id'], locale: Locale = 'it'): Author {
  return locale === 'en' ? { ...AUTHORS[id], ...ENGLISH_AUTHORS[id] } : AUTHORS[id];
}
