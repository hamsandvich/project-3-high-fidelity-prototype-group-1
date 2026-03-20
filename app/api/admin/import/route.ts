import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";

import { hasAdminAccessFromRequest, unauthorizedAdminResponse } from "@/lib/admin";
import { enrichVocabularyCatalogWithAI } from "@/lib/ai";
import { importWords, parseImportInput } from "@/lib/importers";
import { buildItwewinaImportBatch } from "@/lib/itwewina";

const importRequestSchema = z.object({
  mode: z.enum(["json", "csv", "itwewina"]),
  text: z.string().min(1, "Import text is required.")
});

export async function POST(request: NextRequest) {
  if (!hasAdminAccessFromRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const payload = importRequestSchema.parse(await request.json());
    const parsed =
      payload.mode === "itwewina"
        ? await buildItwewinaImportBatch(payload.text)
        : { queryCount: undefined, words: parseImportInput(payload.mode, payload.text), warnings: [] as string[] };

    if (payload.mode === "itwewina" && parsed.words.length === 0) {
      return NextResponse.json(
        {
          error: "No itwewina entries were found for the provided search terms."
        },
        { status: 400 }
      );
    }

    const result = await importWords(parsed.words);
    const warnings = [...parsed.warnings];
    let ai: Awaited<ReturnType<typeof enrichVocabularyCatalogWithAI>> | undefined;

    try {
      ai = await enrichVocabularyCatalogWithAI();

      if (ai.warning) {
        warnings.push(ai.warning);
      }
    } catch (error) {
      warnings.push(`AI enrichment skipped: ${error instanceof Error ? error.message : "Unknown error."}`);
    }

    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath("/admin");
    revalidatePath("/admin/words");

    return NextResponse.json({
      ...result,
      ai,
      queryCount: parsed.queryCount,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid import payload." }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to complete import." }, { status: 500 });
  }
}
