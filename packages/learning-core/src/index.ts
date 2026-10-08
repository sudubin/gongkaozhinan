import type { Attempt, DailyPlan, Favorite, MistakeNote, Note, ReviewState, SpeedSession } from "@gongkao/contracts";

export interface Clock { now(): Date; localDate(): string }
export interface RandomSource { next(): number }
export interface LearningRecordRepository {
  saveAttemptOnce(attempt: Attempt): Promise<"created" | "duplicate">;
  saveReview(state: ReviewState): Promise<void>;
  saveNote(note: Note): Promise<void>;
  saveFavorite(favorite: Favorite): Promise<void>;
  savePlan(plan: DailyPlan): Promise<void>;
  saveMistakeNote(note: MistakeNote): Promise<void>;
  saveSpeedSession(session: SpeedSession): Promise<void>;
}

export interface ContentCatalog {
  search(query: { module?: string; topic?: string; date?: string; text?: string }): Promise<unknown[]>;
  resolveKnowledge(knowledgeId: string): Promise<Array<{ stableId: string; status: "available" | "withdrawn" | "module-disabled" }>>;
}

export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;

export interface DailyPlanCandidate { stableId: string; knowledgeId: string }
export interface QuestionCandidate { stableId: string; knowledgeId: string }

export function buildDailyPlan(input: {
  localDate: string;
  content: DailyPlanCandidate[];
  questions: QuestionCandidate[];
  previouslyCompletedIds?: Iterable<string>;
  maxCards?: number;
  maxQuestions?: number;
}): DailyPlan {
  const completed = new Set(input.previouslyCompletedIds ?? []);
  const maxCards = Math.max(0, input.maxCards ?? 5);
  const maxQuestions = Math.max(0, input.maxQuestions ?? 5);
  const uniqueContent = [...new Map(input.content.map((item) => [item.stableId, item])).values()]
    .filter((item) => !completed.has(item.stableId))
    .slice(0, maxCards);
  const knowledgeIds = new Set(uniqueContent.map((item) => item.knowledgeId));
  const uniqueQuestions = [...new Map(input.questions.map((item) => [item.stableId, item])).values()]
    .filter((item) => knowledgeIds.has(item.knowledgeId) && !completed.has(item.stableId))
    .slice(0, maxQuestions);
  return {
    localDate: input.localDate,
    contentIds: uniqueContent.map((item) => item.stableId),
    questionIds: uniqueQuestions.map((item) => item.stableId),
    completedIds: [],
  };
}

const addLocalDays = (localDate: string, days: number): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error("localDate 必须为 YYYY-MM-DD");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function startReview(stableId: string, evaluationLocalDate: string): ReviewState {
  return { stableId, stage: 0, dueLocalDate: addLocalDays(evaluationLocalDate, 1) };
}

export function rateReview(state: ReviewState, rating: "remembered" | "forgot", evaluationLocalDate: string): ReviewState {
  if (rating === "forgot") return { stableId: state.stableId, stage: 0, dueLocalDate: addLocalDays(evaluationLocalDate, 1), lastReviewedLocalDate: evaluationLocalDate };
  const nextStage = Math.min(state.stage + 1, REVIEW_INTERVAL_DAYS.length - 1);
  return {
    stableId: state.stableId,
    stage: nextStage,
    dueLocalDate: addLocalDays(evaluationLocalDate, REVIEW_INTERVAL_DAYS[nextStage]!),
    lastReviewedLocalDate: evaluationLocalDate,
  };
}

export const isReviewDue = (state: ReviewState, localDate: string): boolean => state.dueLocalDate <= localDate;

