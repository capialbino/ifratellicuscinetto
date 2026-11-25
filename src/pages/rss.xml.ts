import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { withBase } from '../utils/paths';

export async function GET(context: APIContext) {
  const articles = (await getCollection('articles', ({ data }) => !data.draft && data.language === 'it')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  return rss({
    title: 'I Fratelli Cuscinetto',
    description: 'Divulgazione tecnica su ingegneria meccanica, intelligenza artificiale e sistemi.',
    site: context.site ?? 'https://ifratellicuscinetto.com',
    items: articles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.pubDate,
      description: article.data.description,
      link: withBase(`/articoli/${article.id}/`),
    })),
    customData: '<language>it-it</language>',
  });
}
