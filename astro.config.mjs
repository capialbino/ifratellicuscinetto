import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const [githubOwner, githubRepository] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === 'true' && Boolean(githubOwner && githubRepository);
const isGitHubUserSite = githubRepository === `${githubOwner}.github.io`;
const base =
  isGitHubPagesBuild && !isGitHubUserSite ? `/${githubRepository}` : '/';

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
    : process.env.CF_PAGES_URL || 'https://ifratellicuscinetto.com',
  base,
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.endsWith('/admin/') && !page.endsWith('/admin'),
    }),
  ],
  vite: {
    server: {
      allowedHosts: ['.trycloudflare.com'],
    },
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex, rehypePrefixUploadsBase],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
