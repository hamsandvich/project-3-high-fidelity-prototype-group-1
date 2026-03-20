import type { Prisma } from "@/generated/prisma/client";

export function buildWordSearchWhere(query: string): Prisma.WordWhereInput {
  const normalized = query.trim();

  return {
    OR: [
      { lemma: { contains: normalized, mode: "insensitive" } },
      { syllabics: { contains: normalized, mode: "insensitive" } },
      { plainEnglish: { contains: normalized, mode: "insensitive" } },
      { notes: { contains: normalized, mode: "insensitive" } },
      {
        meanings: {
          some: {
            gloss: {
              contains: normalized,
              mode: "insensitive"
            }
          }
        }
      }
    ]
  };
}
