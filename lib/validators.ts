import { z } from "zod";

import { RELATION_TYPE_VALUES } from "@/lib/constants";

const relationTypeSchema = z.enum(RELATION_TYPE_VALUES);

export const meaningInputSchema = z.object({
  gloss: z.string().trim().min(1, "Gloss is required"),
  description: z.string().trim().optional().or(z.literal("")),
  sortOrder: z.number().int().nonnegative().default(0)
});

export const morphologyEntryInputSchema = z.object({
  rowLabel: z.string().trim().min(1, "Row label is required"),
  columnLabel: z.string().trim().optional().or(z.literal("")),
  plainLabel: z.string().trim().optional().or(z.literal("")),
  value: z.string().trim().min(1, "A morphology value is required"),
  sortOrder: z.number().int().nonnegative().default(0)
});

export const morphologyTableInputSchema = z.object({
  title: z.string().trim().min(1, "Table title is required"),
  description: z.string().trim().optional().or(z.literal("")),
  isPlainEnglish: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  entries: z.array(morphologyEntryInputSchema).default([])
});

const itwewinaRelatedReferenceSchema = z.object({
  kind: z.enum(["rapidwords", "wordnet"]),
  label: z.string().trim().min(1, "Reference label is required"),
  detail: z.string().trim().optional().or(z.literal("")),
  url: z.string().trim().optional().or(z.literal(""))
});

const itwewinaInflectionalClassSchema = z.object({
  code: z.string().trim().optional().or(z.literal("")),
  emoji: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  examples: z.string().trim().optional().or(z.literal(""))
});

const itwewinaMetadataSchema = z.object({
  relatedReferences: z.array(itwewinaRelatedReferenceSchema).optional(),
  inflectionalClass: itwewinaInflectionalClassSchema.optional()
});

export const relationInputSchema = z.object({
  toWordId: z.string().trim().min(1, "Select a related word"),
  relationType: relationTypeSchema,
  label: z.string().trim().optional().or(z.literal("")),
  isBidirectional: z.boolean().default(false)
});

export const wordFormSchema = z.object({
  id: z.string().trim().optional(),
  lemma: z.string().trim().min(1, "Cree lemma is required"),
  syllabics: z.string().trim().optional().or(z.literal("")),
  plainEnglish: z.string().trim().min(1, "Plain English gloss is required"),
  partOfSpeech: z.string().trim().min(1, "Part of speech is required"),
  linguisticClass: z.string().trim().optional().or(z.literal("")),
  rootStem: z.string().trim().optional().or(z.literal("")),
  pronunciation: z.string().trim().optional().or(z.literal("")),
  audioUrl: z.string().trim().optional().or(z.literal("")),
  source: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  itwewinaMetadata: itwewinaMetadataSchema.optional(),
  beginnerExplanation: z.string().trim().optional().or(z.literal("")),
  expertExplanation: z.string().trim().optional().or(z.literal("")),
  meanings: z.array(meaningInputSchema).default([]),
  categoryIds: z.array(z.string().trim()).default([]),
  morphologyTables: z.array(morphologyTableInputSchema).default([]),
  relations: z.array(relationInputSchema).default([]),
  isDemo: z.boolean().default(true)
});

export const categorySchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(1, "Category name is required"),
  slug: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().optional().or(z.literal("")),
  colorToken: z.string().trim().optional().or(z.literal(""))
});

const importRelationSchema = relationInputSchema.extend({
  toWordId: z.string().trim().optional(),
  targetLemma: z.string().trim().optional(),
  targetSlug: z.string().trim().optional()
});

export const importWordSchema = wordFormSchema.extend({
  categoryIds: z.array(z.string().trim()).optional(),
  categorySlugs: z.array(z.string().trim()).optional(),
  categoryNames: z.array(z.string().trim()).optional(),
  relations: z.array(importRelationSchema).optional()
});

export const importBatchSchema = z.array(importWordSchema);
