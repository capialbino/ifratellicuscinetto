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
      .regex(/^\/(uploads|covers)\//, 'coverImage must start with /uploads/ or /covers/')
      .optional(),
    sourceHash: z.string().optional(),
  }),
});

export const collections = { articles };
