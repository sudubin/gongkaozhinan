import Dexie, { type EntityTable } from "dexie";
import {
  canonicalJson,
  type ContentItem,
  type ContentPackageV1,
  type Attempt,
  type DailyPlan,
  type Favorite,
  type MistakeNote,
  type Note,
  type Question,
  type ReviewState,
  type SpeedSession,
  validateContentPackage,
} from "@gongkao/contracts";

export interface ContentMeta { key: string; value: string }
export interface StoredRelease { releaseId: string; importedAt: string; contentHash: string; package: ContentPackageV1 }
export interface MobileCandidate { id: string; createdAt: string; status: "pending" | "approved" | "rejected" | "failed"; payload: { item: ContentItem; questions: Question[] }; sourceUrls: string[]; model: string; error?: string }

export class LearningDatabase extends Dexie {
  contentItems!: EntityTable<ContentItem, "stableId">;
  questions!: EntityTable<Question, "stableId">;
  contentMeta!: EntityTable<ContentMeta, "key">;
  releases!: EntityTable<StoredRelease, "releaseId">;
  attempts!: EntityTable<Attempt, "attemptId">;
  reviewStates!: EntityTable<ReviewState, "stableId">;
  notes!: EntityTable<Note, "noteId">;
  favorites!: EntityTable<Favorite, "stableId">;
  dailyPlans!: EntityTable<DailyPlan, "localDate">;
  mistakeNotes!: EntityTable<MistakeNote, "attemptId">;
  speedSessions!: EntityTable<SpeedSession, "sessionId">;
  mobileCandidates!: EntityTable<MobileCandidate, "id">;

  constructor(name = "gongkao-learning-v1") {
    super(name);
    this.version(1).stores({
      contentItems: "&stableId, module, topic, knowledgeId, status, sourcePublishedAt",
      questions: "&stableId, module, knowledgeId",
      contentMeta: "&key",
      releases: "&releaseId, importedAt",
    });
    this.version(2).stores({
      contentItems: "&stableId, module, topic, knowledgeId, status, sourcePublishedAt",
      questions: "&stableId, module, knowledgeId",
      contentMeta: "&key",
      releases: "&releaseId, importedAt",
      attempts: "&attemptId, questionId, answeredAt, kind",
      reviewStates: "&stableId, dueLocalDate",
      notes: "&noteId, stableId, updatedAt",
      favorites: "&stableId, createdAt",
      dailyPlans: "&localDate",
      mistakeNotes: "&attemptId, reason",
      speedSessions: "&sessionId, status, trainingType",
    });
    this.version(3).stores({
      contentItems: "&stableId, module, topic, knowledgeId, status, sourcePublishedAt",
      questions: "&stableId, module, knowledgeId",
      contentMeta: "&key",
      releases: "&releaseId, importedAt",
      attempts: "&attemptId, questionId, answeredAt, kind",
      reviewStates: "&stableId, dueLocalDate",
      notes: "&noteId, stableId, updatedAt",
      favorites: "&stableId, createdAt",
      dailyPlans: "&localDate",
      mistakeNotes: "&attemptId, reason",
      speedSessions: "&sessionId, status, trainingType",
      mobileCandidates: "&id, status, createdAt, [status+createdAt]",
    });
  }
}

export interface ContentImportPreview {
  releaseId: string;
  currentReleaseId: string | null;
  items: { total: number; added: number; updated: number; removed: number };
  questions: { total: number; added: number; updated: number; removed: number };
}

export class ContentImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const sha256 = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

export async function validateContentPackageIntegrity(value: unknown): Promise<ContentPackageV1> {
  const validation = validateContentPackage(value);
  if (!validation.ok) throw new ContentImportError("invalid_package", validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  const { contentHash, ...payload } = validation.value;
  if (await sha256(canonicalJson(payload)) !== contentHash) throw new ContentImportError("hash_mismatch", "内容包完整性摘要不匹配");
  return validation.value;
}

const diff = (current: Array<{ stableId: string; revision: number }>, incoming: Array<{ stableId: string; revision: number }>) => {
  const existing = new Map(current.map((entry) => [entry.stableId, entry.revision]));
  const next = new Set(incoming.map((entry) => entry.stableId));
  return {
    total: incoming.length,
    added: incoming.filter((entry) => !existing.has(entry.stableId)).length,
    updated: incoming.filter((entry) => existing.has(entry.stableId) && existing.get(entry.stableId) !== entry.revision).length,
    removed: current.filter((entry) => !next.has(entry.stableId)).length,
  };
};

export async function previewContentImport(db: LearningDatabase, value: unknown): Promise<{ package: ContentPackageV1; preview: ContentImportPreview }> {
  const contentPackage = await validateContentPackageIntegrity(value);
  const [items, questions, currentRelease] = await Promise.all([
    db.contentItems.toArray(), db.questions.toArray(), db.contentMeta.get("currentReleaseId"),
  ]);
  return {
    package: contentPackage,
    preview: {
      releaseId: contentPackage.releaseId,
      currentReleaseId: currentRelease?.value ?? null,
      items: diff(items, contentPackage.items),
      questions: diff(questions, contentPackage.questions),
    },
  };
}

export async function applyContentPackage(
  db: LearningDatabase,
  contentPackage: ContentPackageV1,
  options: { beforeCommit?: () => void | Promise<void> } = {},
): Promise<void> {
  await validateContentPackageIntegrity(contentPackage);
  await db.transaction("rw", db.contentItems, db.questions, db.contentMeta, db.releases, async () => {
    await db.contentItems.clear();
    await db.questions.clear();
    await db.contentItems.bulkPut(contentPackage.items);
    await db.questions.bulkPut(contentPackage.questions);
    await db.releases.put({ releaseId: contentPackage.releaseId, importedAt: new Date().toISOString(), contentHash: contentPackage.contentHash, package: contentPackage });
    await options.beforeCommit?.();
    await db.contentMeta.put({ key: "currentReleaseId", value: contentPackage.releaseId });
  });
}

export async function currentContentRelease(db: LearningDatabase): Promise<string | null> {
  return (await db.contentMeta.get("currentReleaseId"))?.value ?? null;
}
