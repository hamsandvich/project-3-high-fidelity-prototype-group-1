import { Prisma } from "@/generated/prisma/client";
import { unstable_noStore as noStore } from "next/cache";

import { HOME_CATEGORY_SLUGS, RELATION_TYPE_VALUES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { buildWordSearchWhere } from "@/lib/search";
import { getInverseRelationType, uniqueBy } from "@/lib/utils";
import { createEmptyWordPayload } from "@/lib/word-service";
import type { ItwewinaMetadata } from "@/types";

function getSerializedItwewinaMetadata(record: unknown) {
  return (record as { itwewinaMetadata?: Prisma.JsonValue | null }).itwewinaMetadata as
    | ItwewinaMetadata
    | null
    | undefined;
}

const wordCardSelect = {
  id: true,
  slug: true,
  lemma: true,
  syllabics: true,
  plainEnglish: true,
  partOfSpeech: true,
  categories: {
    orderBy: { sortOrder: "asc" },
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          colorToken: true
        }
      }
    }
  }
} satisfies Prisma.WordSelect;

export async function getHomePageData() {
  noStore();

  const categories = await prisma.category.findMany({
    where: {
      slug: {
        in: HOME_CATEGORY_SLUGS.filter((slug) => slug !== "feeling-lucky")
      }
    },
    include: {
      _count: {
        select: {
          words: true
        }
      },
      words: {
        take: 3,
        orderBy: [{ sortOrder: "asc" }],
        include: {
          word: {
            select: wordCardSelect
          }
        }
      }
    }
  });

  const orderedCategories = HOME_CATEGORY_SLUGS.filter((slug) => slug !== "feeling-lucky")
    .map((slug) => categories.find((category) => category.slug === slug))
    .filter((category): category is NonNullable<(typeof categories)[number]> => Boolean(category));

  const candidateWords = await prisma.word.findMany({
    select: {
      slug: true
    }
  });

  const randomWordSlug =
    candidateWords[Math.floor(Math.random() * Math.max(candidateWords.length, 1))]?.slug ?? null;

  return {
    categories: orderedCategories,
    randomWordSlug
  };
}

export async function getCategoryBySlug(slug: string) {
  noStore();

  return prisma.category.findUnique({
    where: { slug },
    include: {
      words: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          word: {
            select: wordCardSelect
          }
        }
      }
    }
  });
}

export async function searchWords(query: string) {
  noStore();

  const normalized = query.trim();

  if (!normalized) {
    return [];
  }

  return prisma.word.findMany({
    where: buildWordSearchWhere(normalized),
    orderBy: [{ lemma: "asc" }],
    select: wordCardSelect,
    take: 50
  });
}

export async function getWordBySlug(slug: string) {
  noStore();

  const word = await prisma.word.findUnique({
    where: { slug },
    include: {
      meanings: {
        orderBy: [{ sortOrder: "asc" }]
      },
      morphologyTables: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          entries: {
            orderBy: [{ sortOrder: "asc" }]
          }
        }
      },
      categories: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          category: true
        }
      },
      outgoingRelations: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          toWord: {
            select: wordCardSelect
          }
        }
      },
      incomingRelations: {
        where: { isBidirectional: true },
        orderBy: [{ createdAt: "asc" }],
        include: {
          fromWord: {
            select: wordCardSelect
          }
        }
      }
    }
  });

  if (!word) {
    return null;
  }

  const outgoing = word.outgoingRelations.map((relation) => ({
    id: relation.id,
    relationType: relation.relationType,
    label: relation.label,
    isBidirectional: relation.isBidirectional,
    word: relation.toWord
  }));

  const incoming = word.incomingRelations.map((relation) => ({
    id: relation.id,
    relationType: getInverseRelationType(relation.relationType),
    label: relation.label,
    isBidirectional: relation.isBidirectional,
    word: relation.fromWord
  }));

  const relatedWords = uniqueBy([...outgoing, ...incoming], (item) => `${item.relationType}:${item.word.id}`);

  const relatedSections = RELATION_TYPE_VALUES.map((relationType) => ({
    relationType,
    items: relatedWords.filter((item) => item.relationType === relationType)
  })).filter((section) => section.items.length > 0);

  return {
    ...word,
    itwewinaMetadata: getSerializedItwewinaMetadata(word) ?? null,
    relatedWords,
    relatedSections
  };
}

export async function getDashboardData() {
  noStore();

  const [wordCount, categoryCount, relationCount, recentWords, categories] = await Promise.all([
    prisma.word.count(),
    prisma.category.count(),
    prisma.relation.count(),
    prisma.word.findMany({
      take: 6,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        lemma: true,
        slug: true,
        plainEnglish: true,
        updatedAt: true
      }
    }),
    prisma.category.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        _count: {
          select: {
            words: true
          }
        }
      }
    })
  ]);

  return {
    wordCount,
    categoryCount,
    relationCount,
    recentWords,
    categories
  };
}

export async function getAdminWords(query?: string, demoStatus: "all" | "demo" | "live" = "all") {
  noStore();

  const normalized = query?.trim();
  const demoFilter =
    demoStatus === "demo" ? true : demoStatus === "live" ? false : undefined;

  return prisma.word.findMany({
    where: {
      ...(normalized
        ? {
            OR: [
              { lemma: { contains: normalized, mode: "insensitive" } },
              { plainEnglish: { contains: normalized, mode: "insensitive" } },
              { slug: { contains: normalized, mode: "insensitive" } },
              { partOfSpeech: { contains: normalized, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(demoFilter === undefined ? {} : { isDemo: demoFilter })
    },
    include: {
      categories: {
        orderBy: [{ sortOrder: "asc" }],
        include: {
          category: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { lemma: "asc" }]
  });
}

export async function getCategoryOptions() {
  noStore();

  return prisma.category.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      colorToken: true
    }
  });
}

export async function getWordOptions(excludeWordId?: string) {
  noStore();

  return prisma.word.findMany({
    where: excludeWordId
      ? {
          NOT: {
            id: excludeWordId
          }
        }
      : undefined,
    orderBy: [{ lemma: "asc" }],
    select: {
      id: true,
      slug: true,
      lemma: true,
      plainEnglish: true
    }
  });
}

export async function getWordEditorData(wordId?: string) {
  noStore();

  const [categories, wordOptions, word] = await Promise.all([
    getCategoryOptions(),
    getWordOptions(wordId),
    wordId
      ? prisma.word.findUnique({
          where: { id: wordId },
          include: {
            meanings: {
              orderBy: [{ sortOrder: "asc" }]
            },
            categories: {
              orderBy: [{ sortOrder: "asc" }]
            },
            morphologyTables: {
              orderBy: [{ sortOrder: "asc" }],
              include: {
                entries: {
                  orderBy: [{ sortOrder: "asc" }]
                }
              }
            },
            outgoingRelations: {
              orderBy: [{ createdAt: "asc" }]
            }
          }
        })
      : Promise.resolve(null)
  ]);

  if (!word) {
    return {
      categories,
      wordOptions,
      initialPayload: createEmptyWordPayload()
    };
  }

  return {
    categories,
    wordOptions,
    initialPayload: {
      id: word.id,
      lemma: word.lemma,
      syllabics: word.syllabics ?? "",
      plainEnglish: word.plainEnglish,
      partOfSpeech: word.partOfSpeech,
      linguisticClass: word.linguisticClass ?? "",
      rootStem: word.rootStem ?? "",
      pronunciation: word.pronunciation ?? "",
      audioUrl: word.audioUrl ?? "",
      source: word.source ?? "",
      notes: word.notes ?? "",
      itwewinaMetadata: getSerializedItwewinaMetadata(word) ?? undefined,
      beginnerExplanation: word.beginnerExplanation ?? "",
      expertExplanation: word.expertExplanation ?? "",
      isDemo: word.isDemo,
      categoryIds: word.categories.map((category) => category.categoryId),
      meanings:
        word.meanings.length > 0
          ? word.meanings.map((meaning) => ({
              gloss: meaning.gloss,
              description: meaning.description ?? "",
              sortOrder: meaning.sortOrder
            }))
          : [
              {
                gloss: word.plainEnglish,
                description: "Primary gloss",
                sortOrder: 0
              }
            ],
      morphologyTables: word.morphologyTables.map((table) => ({
        title: table.title,
        description: table.description ?? "",
        isPlainEnglish: table.isPlainEnglish,
        sortOrder: table.sortOrder,
        entries: table.entries.map((entry) => ({
          rowLabel: entry.rowLabel,
          columnLabel: entry.columnLabel ?? "",
          plainLabel: entry.plainLabel ?? "",
          value: entry.value,
          sortOrder: entry.sortOrder
        }))
      })),
      relations: word.outgoingRelations.map((relation) => ({
        toWordId: relation.toWordId,
        relationType: relation.relationType,
        label: relation.label ?? "",
        isBidirectional: relation.isBidirectional
      }))
    }
  };
}
