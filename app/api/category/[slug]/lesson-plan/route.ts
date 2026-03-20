import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";

import { generateLessonPlanForCategory, type GeneratedLessonPlan } from "@/lib/ai";
import { isMailConfigured, sendEmail } from "@/lib/mailer";
import { buildPdfDocument, type PdfSection } from "@/lib/pdf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

const requestSchema = z.object({
  email: z.string().trim().email("Enter a valid teacher email address.")
});

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

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    if (!isMailConfigured()) {
      return NextResponse.json(
        {
          error: "Email sending is not configured. Add SMTP_USER and SMTP_PASS for your university Google account."
        },
        { status: 500 }
      );
    }

    const payload = requestSchema.parse(await request.json());
    const { slug } = await params;
    const lessonPlan = await generateLessonPlanForCategory(slug);
    const pdfBuffer = await buildPdfDocument({
      title: lessonPlan.plan.title,
      subtitle: `${lessonPlan.category.name} theme lesson plan generated from ${lessonPlan.wordCount} vocabulary entries.`,
      sections: buildLessonPlanSections(lessonPlan.category.name, lessonPlan.wordCount, lessonPlan.plan)
    });
    const filename = `${lessonPlan.category.slug}-lesson-plan-${new Date().toISOString().slice(0, 10)}.pdf`;

    await sendEmail({
      to: payload.email,
      subject: lessonPlan.plan.emailSubject,
      text: [
        `Your AI lesson plan for the ${lessonPlan.category.name} theme is attached as a PDF.`,
        "",
        lessonPlan.plan.emailPreview,
        "",
        `Title: ${lessonPlan.plan.title}`,
        `Vocabulary entries used: ${lessonPlan.wordCount}`
      ].join("\n"),
      html: `
        <div style="font-family: Avenir Next, Segoe UI, Arial, sans-serif; color: #24323b; line-height: 1.6;">
          <h1 style="font-family: Georgia, serif; font-size: 24px; margin-bottom: 8px;">${lessonPlan.plan.title}</h1>
          <p style="margin-top: 0;">${lessonPlan.plan.emailPreview}</p>
          <p><strong>Theme:</strong> ${lessonPlan.category.name}</p>
          <p><strong>Vocabulary entries used:</strong> ${lessonPlan.wordCount}</p>
          <p>The PDF lesson plan is attached to this email.</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });

    return NextResponse.json({
      message: `Lesson plan emailed to ${payload.email}.`,
      title: lessonPlan.plan.title,
      wordCount: lessonPlan.wordCount
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Invalid lesson plan request."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate the lesson plan."
      },
      { status: 500 }
    );
  }
}
