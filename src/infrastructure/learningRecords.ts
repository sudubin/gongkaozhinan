import type { ChoiceAttempt, MistakeNote, Note, Question } from "@gongkao/contracts";
import { buildDailyPlan, isReviewDue, rateReview, startReview } from "@gongkao/learning-core";
import type { LearningDatabase } from "./contentDatabase";

export const currentLocalDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function getOrCreateDailyPlan(db: LearningDatabase, localDate = currentLocalDate()) {
  const existing = await db.dailyPlans.get(localDate);
  if (existing && (existing.contentIds.length > 0 || existing.questionIds.length > 0)) return existing;
  const [content, questions, oldPlans] = await Promise.all([
    db.contentItems.where("status").equals("published").toArray(),
    db.questions.toArray(),
    db.dailyPlans.toArray(),
  ]);
  const plan = buildDailyPlan({
    localDate,
    content: content.map(({ stableId, knowledgeId }) => ({ stableId, knowledgeId })),
    questions: questions.map(({ stableId, knowledgeId }) => ({ stableId, knowledgeId })),
    previouslyCompletedIds: oldPlans.flatMap((item) => item.completedIds),
  });
  await db.dailyPlans.put(plan);
  return plan;
}

export async function markDailyPlanCompleted(db: LearningDatabase, localDate: string, stableId: string) {
  await db.transaction("rw", db.dailyPlans, async () => {
    const plan = await db.dailyPlans.get(localDate);
    if (!plan || plan.completedIds.includes(stableId)) return;
    await db.dailyPlans.put({ ...plan, completedIds: [...plan.completedIds, stableId] });
  });
}

export async function addCardToReview(db: LearningDatabase, stableId: string, localDate = currentLocalDate()) {
  const existing = await db.reviewStates.get(stableId);
  if (existing) return existing;
  const state = startReview(stableId, localDate);
  await db.reviewStates.add(state);
  return state;
}

export async function evaluateCardReview(db: LearningDatabase, stableId: string, rating: "remembered" | "forgot", localDate = currentLocalDate()) {
  const current = await db.reviewStates.get(stableId);
  if (!current) throw new Error("复习卡不存在");
  const next = rateReview(current, rating, localDate);
  await db.reviewStates.put(next);
  return next;
}

export async function dueReviews(db: LearningDatabase, localDate = currentLocalDate()) {
  return (await db.reviewStates.toArray()).filter((state) => isReviewDue(state, localDate));
}

export async function toggleFavorite(db: LearningDatabase, stableId: string) {
  const existing = await db.favorites.get(stableId);
  if (existing) { await db.favorites.delete(stableId); return false; }
  await db.favorites.add({ stableId, createdAt: new Date().toISOString() });
  return true;
}

export async function savePersonalNote(db: LearningDatabase, stableId: string, text: string) {
  const note: Note = { noteId: `content:${stableId}`, stableId, text: text.trim(), updatedAt: new Date().toISOString() };
  await db.notes.put(note);
  return note;
}

export async function saveMistakeReason(db: LearningDatabase, note: MistakeNote) {
  if (!await db.attempts.get(note.attemptId)) throw new Error("错因引用的作答不存在");
  await db.mistakeNotes.put({ ...note, distinction: note.distinction.trim() });
}

export async function saveChoiceAttemptOnce(
  db: LearningDatabase,
  input: { attemptId: string; question: Question; selectedOptionId: string; answeredAt?: string },
): Promise<{ result: "created" | "duplicate"; attempt: ChoiceAttempt }> {
  const attempt: ChoiceAttempt = {
    kind: "choice",
    attemptId: input.attemptId,
    questionId: input.question.stableId,
    selectedOptionId: input.selectedOptionId,
    correct: input.selectedOptionId === input.question.correctOptionId,
    answeredAt: input.answeredAt ?? new Date().toISOString(),
    snapshot: {
      questionId: input.question.stableId,
      questionRevision: input.question.revision,
      prompt: input.question.prompt,
      options: input.question.options.map((option) => ({ id: option.id, text: option.text })),
      correctOptionId: input.question.correctOptionId,
      explanation: input.question.explanation,
    },
  };
  try { await db.attempts.add(attempt); return { result: "created", attempt }; }
  catch (error) {
    if (error instanceof Error && error.name === "ConstraintError") {
      const existing = await db.attempts.get(input.attemptId);
      if (existing?.kind === "choice") return { result: "duplicate", attempt: existing };
    }
    throw error;
  }
}
