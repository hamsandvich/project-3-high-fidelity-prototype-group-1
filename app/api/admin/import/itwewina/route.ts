import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";

import { hasAdminAccessFromRequest, unauthorizedAdminResponse } from "@/lib/admin";
import { importWords } from "@/lib/importers";
import { buildItwewinaImportBatch, type ItwewinaImportProgressEvent } from "@/lib/itwewina";

const itwewinaImportRequestSchema = z.object({
  text: z.string().min(1, "Import text is required.")
});

type ItwewinaImportStreamEvent =
  | ({ type: "progress" } & ItwewinaImportProgressEvent)
  | {
      type: "result";
      importedCount: number;
      queryCount: number;
      warnings?: string[];
    }
  | {
      type: "error";
      error: string;
    };

function encodeStreamEvent(encoder: TextEncoder, event: ItwewinaImportStreamEvent) {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: NextRequest) {
  if (!hasAdminAccessFromRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const payload = itwewinaImportRequestSchema.parse(await request.json());
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ItwewinaImportStreamEvent) => {
          controller.enqueue(encodeStreamEvent(encoder, event));
        };

        try {
          const parsed = await buildItwewinaImportBatch(payload.text, {
            onProgress(event) {
              send({
                type: "progress",
                ...event
              });
            }
          });

          if (parsed.words.length === 0) {
            send({
              type: "error",
              error: "No itwewina entries were found for the provided search terms."
            });
            return;
          }

          send({
            type: "progress",
            stage: "complete",
            completed: parsed.queryCount,
            total: parsed.queryCount,
            status: "Saving imported words to the database."
          });

          const result = await importWords(parsed.words);

          revalidatePath("/");
          revalidatePath("/search");
          revalidatePath("/admin");
          revalidatePath("/admin/words");

          send({
            type: "result",
            importedCount: result.importedCount,
            queryCount: parsed.queryCount,
            warnings: parsed.warnings.length > 0 ? parsed.warnings : undefined
          });
        } catch (error) {
          send({
            type: "error",
            error: error instanceof Error ? error.message : "Unable to complete import."
          });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store"
      }
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
