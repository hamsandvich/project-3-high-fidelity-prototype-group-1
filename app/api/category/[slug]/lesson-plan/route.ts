import { NextResponse } from "next/server";

import { generateLessonPlanForCategory, type GeneratedLessonPlan } from "@/lib/ai";
import { buildPdfDocument, type PdfSection } from "@/lib/pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function buildLessonPlanSections(
  categoryName: string,
  wordCount: number,
  plan: GeneratedLessonPlan
): PdfSection[] {
  return [
    {
      heading: "Overview",
      lines: [
        plan.summary,
        `Theme: ${categoryName}`,
        `Target audience: ${plan.targetAudience}`,
        `Time: ${plan.totalDurationMinutes} minutes`,
        `Vocabulary entries used: ${wordCount}`
      ]
    },
    {
      heading: "Objectives",
      lines: plan.objectives.map((item) => `• ${item}`)
    },
    {
      heading: "Materials",
      lines: plan.materials.map((item) => `• ${item}`)
    },
    {
      heading: "Vocabulary Focus",
      lines: plan.vocabularyFocus.map((item) => `• ${item.lemma} - ${item.plainEnglish}: ${item.teachingTip}`)
    },
    {
      heading: "Lesson Flow",
      lines: plan.lessonSegments.map((segment) => `• ${segment.title} (${segment.durationMinutes} min): ${segment.description}`)
    },
    {
      heading: "Assessment",
      lines: [plan.assessment]
    },
    {
      heading: "Differentiation",
      lines: [
        "Support:",
        ...plan.differentiation.support.map((item) => `• ${item}`),
        "",
        "Extension:",
        ...plan.differentiation.extension.map((item) => `• ${item}`)
      ]
    },
    {
      heading: "Home Connection",
      lines: [plan.homeConnection]
    }
  ];
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const lessonPlan = await generateLessonPlanForCategory(slug);
    const pdfBuffer = await buildPdfDocument({
      title: lessonPlan.plan.title,
      subtitle: `${lessonPlan.category.name} theme lesson plan generated from ${lessonPlan.wordCount} vocabulary entries.`,
      sections: buildLessonPlanSections(lessonPlan.category.name, lessonPlan.wordCount, lessonPlan.plan)
    });
    const filename = `${lessonPlan.category.slug}-lesson-plan-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Lesson-Plan-Title": encodeURIComponent(lessonPlan.plan.title),
        "X-Lesson-Plan-Word-Count": String(lessonPlan.wordCount)
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate the lesson plan."
      },
      { status: 500 }
    );
  }
}
