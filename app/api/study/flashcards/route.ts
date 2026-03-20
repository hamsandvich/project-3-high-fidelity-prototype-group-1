import { z } from "zod";
import { NextResponse } from "next/server";

import { generateFlashcardDeck } from "@/lib/ai";

export const runtime = "nodejs";

const requestSchema = z.object({
  wordIds: z.array(z.string().trim().min(1)).min(1, "Save at least one word before generating flashcards.")
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const result = await generateFlashcardDeck(payload.wordIds);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid flashcard request."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate flashcards."
      },
      { status: 500 }
    );
  }
}
