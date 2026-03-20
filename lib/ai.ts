import { z } from "zod";

import { generateStructuredObject, isOpenAIConfigured } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { uniqueBy } from "@/lib/utils";

const AI_RELATION_TYPE_VALUES = [
  "synonym",
  "antonym",
  "broader",
  "narrower",
  "associated",
  "variant",
  "similar"
] as const;
const AI_RELATION_TYPE_SET = new Set<string>(AI_RELATION_TYPE_VALUES);
const SYMMETRIC_RELATION_TYPES = new Set(["synonym", "antonym", "associated", "variant", "similar"]);
const ENRICHMENT_BATCH_SIZE = 10;

const catalogWordSuggestionSchema = z.object({
  wordId: z.string().trim().min(1),
  categorySlugs: z.array(z.string().trim().min(1)).max(3).default([]),
  relations: z
    .array(
      z.object({
        targetWordId: z.string().trim().min(1),
        relationType: z.enum(AI_RELATION_TYPE_VALUES),
        rationale: z.string().trim().max(220).optional().or(z.literal(""))
      })
    )
    .max(5)
    .default([])
});

const catalogEnrichmentSchema = z.object({
  words: z.array(catalogWordSuggestionSchema).default([])
});

const lessonPlanSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  targetAudience: z.string().trim().min(1),
  totalDurationMinutes: z.number().int().min(15).max(180),
  objectives: z.array(z.string().trim().min(1)).min(3).max(6),
  materials: z.array(z.string().trim().min(1)).min(3).max(8),
  vocabularyFocus: z
    .array(
      z.object({
        lemma: z.string().trim().min(1),
        plainEnglish: z.string().trim().min(1),
        teachingTip: z.string().trim().min(1)
      })
    )
    .min(3)
    .max(10),
  lessonSegments: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        durationMinutes: z.number().int().min(5).max(60),
        description: z.string().trim().min(1)
      })
    )
    .min(3)
    .max(6),
  assessment: z.string().trim().min(1),
  differentiation: z.object({
    support: z.array(z.string().trim().min(1)).min(2).max(4),
    extension: z.array(z.string().trim().min(1)).min(2).max(4)
  }),
  homeConnection: z.string().trim().min(1),
  emailSubject: z.string().trim().min(1),
  emailPreview: z.string().trim().min(1)
});

const flashcardDeckSchema = z.object({
  title: z.string().trim().min(1),
  studyTip: z.string().trim().min(1),
  cards: z
    .array(
      z.object({
        wordId: z.string().trim().min(1),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
        hint: z.string().trim().min(1),
        practicePrompt: z.string().trim().min(1)
      })
    )
    .min(1)
});

export type CatalogEnrichmentResult = {
  skipped: boolean;
  processedWords: number;
  addedCategoryAssignments: number;
  addedRelations: number;
  warning?: string;
};

export type GeneratedLessonPlan = z.infer<typeof lessonPlanSchema>;
export type GeneratedFlashcardDeck = z.infer<typeof flashcardDeckSchema>;

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildRelationEquivalenceKey(fromWordId: string, toWordId: string, relationType: (typeof AI_RELATION_TYPE_VALUES)[number]) {
  if (relationType === "broader") {
    return `${fromWordId}:${toWordId}:broader`;
  }

  if (relationType === "narrower") {
    return `${toWordId}:${fromWordId}:broader`;
  }

  if (SYMMETRIC_RELATION_TYPES.has(relationType)) {
    const [leftId, rightId] = [fromWordId, toWordId].sort();
    return `${leftId}:${rightId}:${relationType}`;
  }

  return `${fromWordId}:${toWordId}:${relationType}`;
}

function buildFallbackFlashcardDeck(
  words: Array<{
    id: string;
    lemma: string;
    syllabics?: string | null;
    plainEnglish: string;
    partOfSpeech: string;
    beginnerExplanation?: string | null;
    meanings: Array<{ gloss: string }>;
    categories: Array<{ category: { name: string } }>;
  }>
): GeneratedFlashcardDeck {
  return {
    title: "Saved words study deck",
    studyTip: "Try saying the Cree word aloud before flipping each card.",
    cards: words.map((word) => ({
      wordId: word.id,
      front: word.syllabics ? `${word.lemma}\n${word.syllabics}` : word.lemma,
      back: `${word.plainEnglish} (${word.partOfSpeech})`,
      hint:
        word.beginnerExplanation?.trim() ||
        `Think about ${word.categories[0]?.category.name?.toLowerCase() ?? "the theme"} and the gloss ${
          word.meanings[0]?.gloss ?? word.plainEnglish
        }.`,
      practicePrompt: `Use ${word.lemma} in a quick oral or written sentence about ${word.plainEnglish}.`
    }))
  };
}

export async function enrichVocabularyCatalogWithAI(): Promise<CatalogEnrichmentResult> {
  const [categories, words, existingRelations] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true
      }
    }),
    prisma.word.findMany({
      orderBy: [{ lemma: "asc" }],
      select: {
        id: true,
        lemma: true,
        syllabics: true,
        plainEnglish: true,
        partOfSpeech: true,
        linguisticClass: true,
        beginnerExplanation: true,
        expertExplanation: true,
        meanings: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            gloss: true,
            description: true
          }
        },
        categories: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            category: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    }),
    prisma.relation.findMany({
      select: {
        fromWordId: true,
        toWordId: true,
        relationType: true
      }
    })
  ]);

  if (!isOpenAIConfigured()) {
    return {
      skipped: true,
      processedWords: words.length,
      addedCategoryAssignments: 0,
      addedRelations: 0,
      warning: "AI enrichment skipped because OPENAI_API_KEY is not set."
    };
  }

  if (words.length === 0) {
    return {
      skipped: false,
      processedWords: 0,
      addedCategoryAssignments: 0,
      addedRelations: 0
    };
  }

  const catalogSummary = words.map((word) => ({
    id: word.id,
    lemma: word.lemma,
    syllabics: word.syllabics,
    plainEnglish: word.plainEnglish,
    partOfSpeech: word.partOfSpeech,
    linguisticClass: word.linguisticClass,
    categories: word.categories.map((entry) => entry.category.slug),
    meanings: word.meanings.map((meaning) => meaning.gloss)
  }));

  const suggestions: z.infer<typeof catalogWordSuggestionSchema>[] = [];

  for (const batch of chunkItems(words, ENRICHMENT_BATCH_SIZE)) {
    const parsed = await generateStructuredObject({
      task: "catalogEnrichment",
      schema: catalogEnrichmentSchema,
      schemaName: "vocabulary_catalog_enrichment",
      reasoningEffort: "low",
      instructions: [
        "You are enriching a Plains Cree vocabulary database used for education.",
        "For each focus word, choose up to 3 matching category slugs from the provided category list.",
        "Only use category slugs that already exist in the input.",
        "Then suggest up to 5 high-confidence relations from the focus word to other words already in the catalog.",
        "Use only these relation types: synonym, antonym, broader, narrower, associated, variant, similar.",
        "When you choose broader, the target word must be a broader term than the source word.",
        "When you choose narrower, the target word must be a narrower term than the source word.",
        "Do not invent new words, new categories, or low-confidence links.",
        "Theme membership is handled through categories, so do not use categoryMember relations."
      ].join("\n"),
      input: JSON.stringify(
        {
          categories,
          catalogWords: catalogSummary,
          focusWords: batch.map((word) => ({
            id: word.id,
            lemma: word.lemma,
            syllabics: word.syllabics,
            plainEnglish: word.plainEnglish,
            partOfSpeech: word.partOfSpeech,
            linguisticClass: word.linguisticClass,
            beginnerExplanation: word.beginnerExplanation,
            expertExplanation: word.expertExplanation,
            meanings: word.meanings,
            categories: word.categories.map((entry) => entry.category.slug)
          }))
        },
        null,
        2
      )
    });

    suggestions.push(
      ...(parsed.words ?? []).map((word) => ({
        wordId: word.wordId,
        categorySlugs: word.categorySlugs ?? [],
        relations: word.relations ?? []
      }))
    );
  }

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const wordById = new Map(words.map((word) => [word.id, word]));
  const existingCategoryKeys = new Set(
    words.flatMap((word) => word.categories.map((entry) => `${word.id}:${entry.category.id}`))
  );
  const nextCategorySortOrderByWordId = new Map(words.map((word) => [word.id, word.categories.length]));
  const seenRelationKeys = new Set(
    existingRelations
      .filter((relation) => AI_RELATION_TYPE_SET.has(relation.relationType))
      .map((relation) =>
        buildRelationEquivalenceKey(
          relation.fromWordId,
          relation.toWordId,
          relation.relationType as (typeof AI_RELATION_TYPE_VALUES)[number]
        )
      )
  );

  const categoryAssignments: Array<{ wordId: string; categoryId: string; sortOrder: number }> = [];
  const relationRows: Array<{
    fromWordId: string;
    toWordId: string;
    relationType: (typeof AI_RELATION_TYPE_VALUES)[number];
    isBidirectional: boolean;
  }> = [];

  for (const suggestion of suggestions) {
    const sourceWord = wordById.get(suggestion.wordId);

    if (!sourceWord) {
      continue;
    }

    for (const slug of uniqueBy(
      (suggestion.categorySlugs ?? []).map((value) => value.trim()).filter(Boolean),
      (value) => value
    )) {
      const category = categoryBySlug.get(slug);

      if (!category) {
        continue;
      }

      const categoryKey = `${sourceWord.id}:${category.id}`;

      if (existingCategoryKeys.has(categoryKey)) {
        continue;
      }

      const nextSortOrder = nextCategorySortOrderByWordId.get(sourceWord.id) ?? 0;

      categoryAssignments.push({
        wordId: sourceWord.id,
        categoryId: category.id,
        sortOrder: nextSortOrder
      });
      existingCategoryKeys.add(categoryKey);
      nextCategorySortOrderByWordId.set(sourceWord.id, nextSortOrder + 1);
    }

    for (const relation of uniqueBy(
      (suggestion.relations ?? []).filter((item) => item.targetWordId !== sourceWord.id),
      (item) => `${item.targetWordId}:${item.relationType}`
    )) {
      const targetWord = wordById.get(relation.targetWordId);

      if (!targetWord) {
        continue;
      }

      const relationKey = buildRelationEquivalenceKey(sourceWord.id, targetWord.id, relation.relationType);

      if (seenRelationKeys.has(relationKey)) {
        continue;
      }

      relationRows.push({
        fromWordId: sourceWord.id,
        toWordId: targetWord.id,
        relationType: relation.relationType,
        isBidirectional: true
      });
      seenRelationKeys.add(relationKey);
    }
  }

  let addedCategoryAssignments = 0;
  let addedRelations = 0;

  if (categoryAssignments.length > 0) {
    const result = await prisma.wordCategory.createMany({
      data: categoryAssignments,
      skipDuplicates: true
    });
    addedCategoryAssignments = result.count;
  }

  if (relationRows.length > 0) {
    const result = await prisma.relation.createMany({
      data: relationRows,
      skipDuplicates: true
    });
    addedRelations = result.count;
  }

  return {
    skipped: false,
    processedWords: words.length,
    addedCategoryAssignments,
    addedRelations
  };
}

export async function generateLessonPlanForCategory(categorySlug: string) {
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
    include: {
      words: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          word: {
            select: {
              id: true,
              lemma: true,
              syllabics: true,
              plainEnglish: true,
              partOfSpeech: true,
              linguisticClass: true,
              beginnerExplanation: true,
              expertExplanation: true,
              source: true,
              notes: true,
              meanings: {
                orderBy: [{ sortOrder: "asc" }],
                select: {
                  gloss: true,
                  description: true
                }
              },
              categories: {
                orderBy: [{ sortOrder: "asc" }],
                select: {
                  category: {
                    select: {
                      name: true,
                      slug: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!category) {
    throw new Error("Theme not found.");
  }

  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not set. Add it before generating lesson plans.");
  }

  const words = category.words.map((entry) => entry.word);

  if (words.length === 0) {
    throw new Error("This theme does not have enough words yet to build a lesson plan.");
  }

  const plan = await generateStructuredObject({
    task: "lessonPlan",
    schema: lessonPlanSchema,
    schemaName: "theme_lesson_plan",
    reasoningEffort: "medium",
    instructions: [
      "You are helping a teacher create a classroom-ready lesson plan.",
      "Ground the plan only in the theme information and the supplied vocabulary records.",
      "Do not invent new vocabulary items or grammatical facts that are not supported by the input.",
      "Make the plan practical for a single class session and teacher-friendly.",
      "Include concrete activity ideas that use the provided Cree vocabulary."
    ].join("\n"),
    input: JSON.stringify(
      {
        theme: {
          name: category.name,
          slug: category.slug,
          description: category.description
        },
        words: words.map((word) => ({
          lemma: word.lemma,
          syllabics: word.syllabics,
          plainEnglish: word.plainEnglish,
          partOfSpeech: word.partOfSpeech,
          linguisticClass: word.linguisticClass,
          beginnerExplanation: word.beginnerExplanation,
          expertExplanation: word.expertExplanation,
          source: word.source,
          notes: word.notes,
          meanings: word.meanings,
          relatedThemes: word.categories.map((entry) => entry.category.name)
        }))
      },
      null,
      2
    )
  });

  return {
    category: {
      name: category.name,
      slug: category.slug,
      description: category.description
    },
    plan,
    wordCount: words.length
  };
}

export async function generateFlashcardDeck(wordIds: string[]) {
  const words = await prisma.word.findMany({
    where: {
      id: {
        in: wordIds
      }
    },
    select: {
      id: true,
      lemma: true,
      syllabics: true,
      plainEnglish: true,
      partOfSpeech: true,
      beginnerExplanation: true,
      expertExplanation: true,
      meanings: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          gloss: true,
          description: true
        }
      },
      categories: {
        orderBy: [{ sortOrder: "asc" }],
        select: {
          category: {
            select: {
              name: true,
              slug: true
            }
          }
        }
      }
    }
  });

  if (words.length === 0) {
    throw new Error("No saved words were found in the database for this flashcard request.");
  }

  const orderedWords = wordIds
    .map((wordId) => words.find((word) => word.id === wordId))
    .filter((word): word is (typeof words)[number] => Boolean(word));

  if (!isOpenAIConfigured()) {
    return {
      deck: buildFallbackFlashcardDeck(orderedWords),
      usedFallback: true
    };
  }

  const generatedDeck = await generateStructuredObject({
    task: "flashcards",
    schema: flashcardDeckSchema,
    schemaName: "study_flashcard_deck",
    reasoningEffort: "low",
    instructions: [
      "Create a concise flashcard deck to help a learner study Plains Cree vocabulary.",
      "Return one flashcard per provided word ID.",
      "Keep the front brief and memorable.",
      "Use the back for meaning and a short study explanation.",
      "Use the hint and practicePrompt to support recall and active practice.",
      "Ground everything in the supplied vocabulary data."
    ].join("\n"),
    input: JSON.stringify(
      {
        savedWords: orderedWords.map((word) => ({
          wordId: word.id,
          lemma: word.lemma,
          syllabics: word.syllabics,
          plainEnglish: word.plainEnglish,
          partOfSpeech: word.partOfSpeech,
          beginnerExplanation: word.beginnerExplanation,
          expertExplanation: word.expertExplanation,
          meanings: word.meanings,
          categories: word.categories.map((entry) => entry.category.name)
        }))
      },
      null,
      2
    )
  });

  const fallbackDeck = buildFallbackFlashcardDeck(orderedWords);
  const fallbackCardByWordId = new Map(fallbackDeck.cards.map((card) => [card.wordId, card]));
  const generatedCardByWordId = new Map(generatedDeck.cards.map((card) => [card.wordId, card]));
  const completedCards = orderedWords.map((word) => generatedCardByWordId.get(word.id) ?? fallbackCardByWordId.get(word.id));

  return {
    deck: {
      title: generatedDeck.title,
      studyTip: generatedDeck.studyTip,
      cards: completedCards.filter(
        (card): card is NonNullable<(typeof completedCards)[number]> => Boolean(card)
      )
    },
    usedFallback: false
  };
}
