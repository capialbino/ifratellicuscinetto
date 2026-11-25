import rawConfig from '../data/site-config.json';

export interface SiteConfig {
  brand: {
    name: string;
    subtitleIt: string;
    subtitleEn: string;
  };
  theme: {
    preset: 'alabaster' | 'ceramic' | 'graphite' | 'obsidian';
    accentLight: string;
    accentDark: string;
    headingFont: 'sans' | 'serif';
    proseFont: 'sans' | 'serif';
    radius: 'sharp' | 'ive' | 'soft';
    spacing: 'airy' | 'balanced' | 'compact';
    heroAlign: 'center' | 'left';
    showBearingMark: boolean;
  };
  hero: {
    kickerIt: string;
    kickerEn: string;
    titleIt: string;
    titleEn: string;
    leadIt: string;
    leadEn: string;
    showPillars: boolean;
    pillars: Array<{
      codeIt: string;
      codeEn: string;
      textIt: string;
      textEn: string;
    }>;
  };
  footer: {
    taglineIt: string;
    taglineEn: string;
  };
}

export const siteConfig = rawConfig as SiteConfig;

const RADIUS_MAP: Record<SiteConfig['theme']['radius'], { card: string; control: string }> = {
  sharp: { card: '10px', control: '8px' },
  ive: { card: '22px', control: '12px' },
  soft: { card: '28px', control: '16px' },
};

const SPACING_MAP: Record<SiteConfig['theme']['spacing'], { heroPad: string; sectionGap: string }> = {
  airy: { heroPad: 'clamp(4.5rem, 10vw, 7.5rem)', sectionGap: '3.5rem' },
  balanced: { heroPad: 'clamp(3.25rem, 7vw, 5.25rem)', sectionGap: '2.5rem' },
  compact: { heroPad: 'clamp(2.25rem, 5vw, 3.5rem)', sectionGap: '1.75rem' },
};

export function buildThemeStyleVars(cfg: SiteConfig = siteConfig): string {
  const rad = RADIUS_MAP[cfg.theme.radius] ?? RADIUS_MAP.ive;
  const space = SPACING_MAP[cfg.theme.spacing] ?? SPACING_MAP.airy;
  const headingVar = cfg.theme.headingFont === 'serif' ? 'var(--font-serif)' : 'var(--font-display)';
  const proseVar = cfg.theme.proseFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';

  return [
    `--user-accent-light: ${cfg.theme.accentLight};`,
    `--user-accent-dark: ${cfg.theme.accentDark};`,
    `--radius-card: ${rad.card};`,
    `--radius-control: ${rad.control};`,
    `--hero-pad-y: ${space.heroPad};`,
    `--section-gap: ${space.sectionGap};`,
    `--font-heading: ${headingVar};`,
    `--font-prose: ${proseVar};`,
  ].join(' ');
}
