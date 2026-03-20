import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { type NextRequest, NextResponse } from "next/server";

import { hasAdminAccessFromRequest, unauthorizedAdminResponse } from "@/lib/admin";
import { deleteWord, saveWord, setWordDemoStatus } from "@/lib/word-service";
import { wordFormSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const updateDemoStatusSchema = z.object({
  isDemo: z.boolean()
});

export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!hasAdminAccessFromRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const payload = wordFormSchema.parse(await request.json());
    const { id } = await params;
    const word = await saveWord(payload, id);

    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath("/admin");
    revalidatePath("/admin/words");
    revalidatePath(`/word/${word.slug}`);

    return NextResponse.json({ word });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid word payload." }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to update word." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!hasAdminAccessFromRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const { id } = await params;
    await deleteWord(id);

    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath("/admin");
    revalidatePath("/admin/words");

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to delete word." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!hasAdminAccessFromRequest(request)) {
    return unauthorizedAdminResponse();
  }

  try {
    const payload = updateDemoStatusSchema.parse(await request.json());
    const { id } = await params;
    const word = await setWordDemoStatus(id, payload.isDemo);

    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath("/admin");
    revalidatePath("/admin/words");
    revalidatePath(`/word/${word.slug}`);

    return NextResponse.json({ word });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid demo status payload." }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to update demo status." }, { status: 500 });
  }
}
