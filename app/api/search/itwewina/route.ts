import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";

import { importSearchTermFromItwewina } from "@/lib/search-service";

const searchImportRequestSchema = z.object({
  query: z.string().trim().min(1, "Search query is required.").max(120, "Search query is too long.")
});

export async function POST(request: NextRequest) {
  try {
    const payload = searchImportRequestSchema.parse(await request.json());
    const result = await importSearchTermFromItwewina(payload.query);

    if (result.status === "imported") {
      revalidatePath("/");
      revalidatePath("/search");
      revalidatePath("/admin");
      revalidatePath("/admin/words");
    }

    if (result.status === "not_found") {
      return NextResponse.json(
        {
          ...result,
          error: `No importable Itwewina matches were found for "${payload.query.trim()}".`
        },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid search payload." }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to search Itwewina right now." }, { status: 500 });
  }
}
