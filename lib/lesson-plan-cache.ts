import "server-only";

import { access, readFile } from "node:fs/promises";
import path from "node:path";

function getLessonPlanFilename(categorySlug: string) {
  return `${categorySlug}-lesson-plan.pdf`;
}

function getLessonPlanPath(categorySlug: string) {
  return path.join(process.cwd(), "LessonPlans", getLessonPlanFilename(categorySlug));
}

export async function hasCachedLessonPlan(categorySlug: string) {
  try {
    await access(getLessonPlanPath(categorySlug));
    return true;
  } catch {
    return false;
  }
}

export async function readCachedLessonPlan(categorySlug: string) {
  const filename = getLessonPlanFilename(categorySlug);

  try {
    const buffer = await readFile(getLessonPlanPath(categorySlug));
    return { buffer, filename };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("A cached lesson plan is not available for this theme yet.");
    }

    throw error;
  }
}
