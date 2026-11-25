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

export default defineConfig({
  site: isGitHubPagesBuild
    ? `https://${githubOwner}.github.io`
    : 'https://ifratellicuscinetto.com',
  base,
  integrations: [mdx(), sitemap()],
  vite: {
    server: {
      allowedHosts: ['.trycloudflare.com'],
    },
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },
});
