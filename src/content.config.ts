import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    language: z.enum(['it', 'en']).default('it'),
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.enum(['federico-pappafava', 'alessandro-rossi', 'alessandro-capialbi']),
    category: z.enum(['Meccanica', 'AI & Software', 'Meccatronica & Hybrid']),
    tags: z.array(z.string()).default([]),
    level: z.enum(['Divulgativo', 'Intermedio', 'Tecnico / Avanzato']).default('Intermedio'),
    draft: z.boolean().default(false),
    coverImage: z
      .string()
      .refine((v) => {
        if (v.includes('..') || v.includes('\\') || !/^\/(uploads|covers)\/[a-zA-Z0-9._/-]+$/.test(v)) {
          return false;
        }
        try {
          const p = new URL(v, 'https://example.invalid').pathname;
          return p.startsWith('/uploads/') || p.startsWith('/covers/');
        } catch {
          return false;
        }
      }, 'coverImage must be a safe path under /uploads/ or /covers/')
      .optional(),
    sourceHash: z.string().optional(),
  }),
});

export const collections = { articles };
