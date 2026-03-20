import { importWords } from "@/lib/importers";
import { buildItwewinaImportBatch } from "@/lib/itwewina";
import { prisma } from "@/lib/prisma";
import { buildWordSearchWhere } from "@/lib/search";

export type SearchImportResult =
  | {
      status: "existing";
      importedCount: 0;
    }
  | {
      status: "not_found";
      importedCount: 0;
      warnings?: string[];
    }
  | {
      status: "imported";
      importedCount: number;
      warnings?: string[];
    };

export async function importSearchTermFromItwewina(query: string): Promise<SearchImportResult> {
  const normalized = query.trim();

  if (!normalized) {
    throw new Error("Search query is required.");
  }

  const existingWord = await prisma.word.findFirst({
    where: buildWordSearchWhere(normalized),
    select: { id: true }
  });

  if (existingWord) {
    return {
      status: "existing",
      importedCount: 0
    };
  }

  const parsed = await buildItwewinaImportBatch(normalized);

  if (parsed.words.length === 0) {
    return {
      status: "not_found",
      importedCount: 0,
      warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined
    };
  }

  const result = await importWords(parsed.words);

  return {
    status: "imported",
    importedCount: result.importedCount,
    warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined
  };
}
