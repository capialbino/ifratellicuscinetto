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

const katexMathTags = [
  'math',
  'semantics',
  'mrow',
  'mi',
  'mo',
  'mn',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mspace',
  'mover',
  'munder',
  'munderover',
  'annotation',
];

const katexSvgTags = ['svg', 'path', 'line', 'rect', 'g'];

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    ...katexMathTags,
    ...katexSvgTags,
    'span',
    'video',
  ],
  attributes: {
    ...(defaultSchema.attributes || {}),
    '*': [
      ...(defaultSchema.attributes?.['*'] || []),
      'className',
      'ariaHidden',
      'aria-hidden',
    ],
    div: [
      ...(defaultSchema.attributes?.div || []),
      'className',
      'dataSrc',
      'dataLabel',
      'data-src',
      'data-label',
    ],
    span: [
      ...(defaultSchema.attributes?.span || []),
      'className',
      'style',
      'ariaHidden',
      'aria-hidden',
    ],
    pre: [
      ...(defaultSchema.attributes?.pre || []),
      'className',
      'style',
      'tabIndex',
      'dataLanguage',
      'data-language',
    ],
    code: [
      ...(defaultSchema.attributes?.code || []),
      'className',
      'style',
    ],
    video: [
      'className',
      'src',
      'autoplay',
      'autoPlay',
      'loop',
      'muted',
      'playsinline',
      'playsInline',
      'controls',
      'ariaLabel',
      'aria-label',
    ],
    math: ['xmlns', 'display', 'className', 'style', 'ariaHidden', 'aria-hidden'],
    annotation: ['encoding', 'className'],
    svg: [
      'xmlns',
      'viewBox',
      'width',
      'height',
      'preserveAspectRatio',
      'className',
      'style',
      'ariaHidden',
      'aria-hidden',
    ],
    path: ['d', 'className', 'style'],
    line: ['x1', 'y1', 'x2', 'y2', 'className', 'style'],
    rect: ['x', 'y', 'width', 'height', 'className', 'style'],
    g: ['className', 'style'],
    ...Object.fromEntries(
      katexMathTags
        .filter((tag) => tag !== 'math' && tag !== 'annotation')
        .map((tag) => [tag, ['className', 'style', 'ariaHidden', 'aria-hidden']])
    ),
  },
};

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
        if (prefix && typeof src === 'string' && src.startsWith('/uploads/')) {
          node.properties.src = `${prefix}${src}`;
        }
      }
      if (node?.type === 'element' && node.tagName === 'a') {
        const href = node.properties?.href;
        if (typeof href === 'string' && /\.glb(\?.*)?$/i.test(href) && href.startsWith('/uploads/')) {
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
        if (typeof href === 'string' && /\.(mp4|webm)(\?.*)?$/i.test(href) && href.startsWith('/uploads/')) {
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
      rehypeKatex,
      rehypePrefixUploadsBase,
      [rehypeSanitize, sanitizeSchema],
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
