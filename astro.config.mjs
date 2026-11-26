import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const [githubOwner, githubRepository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === 'true' && Boolean(githubOwner && githubRepository);
const isGitHubUserSite = githubRepository === `${githubOwner}.github.io`;
const base =
  isGitHubPagesBuild && !isGitHubUserSite ? `/${githubRepository}` : '/';
const isCloudflarePreview =
  Boolean(process.env.CF_PAGES_BRANCH) && process.env.CF_PAGES_BRANCH !== 'main';

const SHIKI_PRE_STYLE =
  /^(?:(?:background-color|color|--shiki-[a-z-]+|overflow-x|white-space|word-wrap)\s*:\s*(?:#[0-9a-fA-F]{3,8}|auto|pre-wrap|break-word)\s*;?\s*)+$/;
const SHIKI_SPAN_STYLE =
  /^(?:(?:color|background-color|--shiki-[a-z-]+|font-style|font-weight|text-decoration|user-select)\s*:\s*(?:#[0-9a-fA-F]{3,8}|italic|bold|underline|line-through|none)\s*;?\s*)+$/;

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || [])],
  attributes: {
    ...(defaultSchema.attributes || {}),
    pre: [
      ...(defaultSchema.attributes?.pre || []),
      ['className', 'astro-code', 'astro-code-themes', 'github-light', 'github-dark'],
      ['tabIndex', 0, '0'],
      ['dataLanguage', /^[a-z0-9_+-]+$/i],
      ['style', SHIKI_PRE_STYLE],
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      ['className', /^language-[a-z0-9_+-]+$/i, 'math-inline', 'math-display'],
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', 'math-inline', 'math-display', 'line'],
      ['style', SHIKI_SPAN_STYLE],
    ],
    div: [
      ...(defaultSchema.attributes?.div || []),
      ['className', 'math-display'],
    ],
  },
};

/** Normalizes Shiki's lowercase `class`/`tabindex` HAST props so `rehypeSanitize` keeps allowed classes cleanly. */
function rehypeNormalizeShikiProps() {
  return (tree) => {
    const normalize = (node, insideShikiPre) => {
      if (node?.type === 'element' && node.properties) {
        const isShikiPre =
          node.tagName === 'pre' &&
          typeof node.properties.dataLanguage === 'string';
        if (isShikiPre) {
          if (typeof node.properties.class === 'string') {
            node.properties.className = node.properties.class.split(/\s+/).filter(Boolean);
            delete node.properties.class;
          }
          if (node.properties.tabindex !== undefined) {
            node.properties.tabIndex = node.properties.tabindex;
            delete node.properties.tabindex;
          }
        } else if (insideShikiPre && node.tagName === 'span' && node.properties.class === 'line') {
          node.properties.className = ['line'];
          delete node.properties.class;
        }
        if (Array.isArray(node.children)) {
          for (const child of node.children) normalize(child, insideShikiPre || isShikiPre);
        }
        return;
      }
      if (Array.isArray(node?.children)) {
        for (const child of node.children) normalize(child, insideShikiPre);
      }
    };
    normalize(tree, false);
  };
}

function isSafeUploadsPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return false;
  if (value.includes('..') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return false;
  try {
    const parsed = new URL(value, 'https://example.invalid');
    return parsed.origin === 'https://example.invalid' && parsed.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

/** Prefixes `/uploads/...` URLs with Astro `base` and upgrades `.glb` links into interactive 3D viewer containers. */
function rehypePrefixUploadsBase() {
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return (tree) => {
    const extractText = (n) => {
      if (!n) return '';
      if (n.type === 'text') return n.value || '';
      if (Array.isArray(n.children)) return n.children.map(extractText).join('');
      return '';
    };
    const visit = (node) => {
      if (node?.type === 'element' && node.tagName === 'img') {
        const src = node.properties?.src;
        if (prefix && isSafeUploadsPath(src)) {
          node.properties.src = `${prefix}${src}`;
        }
      }
      if (node?.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href;
        if (isSafeUploadsPath(href) && /\.glb(\?.*)?$/i.test(href)) {
          const resolvedSrc = prefix ? `${prefix}${href}` : href;
          const label = extractText(node).replace(/^3d:\s*/i, '').trim() || 'Modello 3D';
          node.tagName = 'div';
          node.properties = {
            className: ['model-3d-frame'],
            'data-src': resolvedSrc,
            'data-label': label,
          };
          node.children = [];
          return;
        }
        if (isSafeUploadsPath(href) && /\.(mp4|webm)(\?.*)?$/i.test(href)) {
          const resolvedSrc = prefix ? `${prefix}${href}` : href;
          const label = extractText(node).replace(/^video:\s*/i, '').trim() || 'Animazione video';
          node.tagName = 'video';
          node.properties = {
            className: ['article-video'],
            src: resolvedSrc,
            autoPlay: true,
            loop: true,
            muted: true,
            playsInline: true,
            controls: true,
            'aria-label': label,
          };
          node.children = [];
          return;
        }
      }
      if (Array.isArray(node?.children)) {
        for (const child of node.children) visit(child);
      }
    };
    visit(tree);
  };
}

export default defineConfig({
  site: isGitHubPagesBuild
    ? `https://${githubOwner}.github.io`
    : isCloudflarePreview && process.env.CF_PAGES_URL
      ? process.env.CF_PAGES_URL
      : 'https://ifratellicuscinetto.com',
  base,
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.endsWith('/admin/') && !page.endsWith('/admin'),
    }),
  ],
  vite: {
    server: {
      allowedHosts: process.env.ALLOW_CLOUDFLARE_TUNNEL === 'true' ? ['.trycloudflare.com'] : [],
    },
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      rehypeNormalizeShikiProps,
      [rehypeSanitize, sanitizeSchema],
      rehypeKatex,
      rehypePrefixUploadsBase,
    ],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
