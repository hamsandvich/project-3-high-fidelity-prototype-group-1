import { NextResponse } from "next/server";

import { readCachedLessonPlan } from "@/lib/lesson-plan-cache";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const lessonPlan = await readCachedLessonPlan(slug);

    return new NextResponse(lessonPlan.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${lessonPlan.filename}"`,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download the lesson plan.";
    return NextResponse.json(
      {
        error: message
      },
      {
        status: message.includes("not available") ? 404 : 500
      }
    );
  }
}

export { GET as POST };
