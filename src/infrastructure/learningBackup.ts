import { BACKUP_SCHEMA_VERSION, type AttemptSnapshot, type BackupV1, validateBackup } from "@gongkao/contracts";
import type { LearningDatabase } from "./contentDatabase";

export class BackupError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const uniqueSnapshots = (snapshots: AttemptSnapshot[]) => [...new Map(snapshots.map((snapshot) => [`${snapshot.questionId}@${snapshot.questionRevision}`, snapshot])).values()];

export async function exportLearningBackup(db: LearningDatabase): Promise<BackupV1> {
  const [release, attempts, speedSessions, reviews, notes, favorites, dailyPlans, mistakeNotes] = await Promise.all([
    db.contentMeta.get("currentReleaseId"), db.attempts.toArray(), db.speedSessions.toArray(), db.reviewStates.toArray(),
    db.notes.toArray(), db.favorites.toArray(), db.dailyPlans.toArray(), db.mistakeNotes.toArray(),
  ]);
  const backup: BackupV1 = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    contentReleaseId: release?.value ?? "no-content-release",
    attempts, speedSessions, reviews, notes, favorites, dailyPlans, mistakeNotes,
    questionSnapshots: uniqueSnapshots(attempts.flatMap((attempt) => attempt.kind === "choice" ? [attempt.snapshot] : [])),
  };
  const validation = validateBackup(backup);
  if (!validation.ok) throw new BackupError("invalid_export", validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  return backup;
}

export interface RestorePreview {
  contentReleaseId: string;
  attempts: number;
  speedSessions: number;
  reviews: number;
  notes: number;
  favorites: number;
  dailyPlans: number;
  mistakeNotes: number;
}

export function previewLearningRestore(value: unknown): { backup: BackupV1; preview: RestorePreview } {
  const validation = validateBackup(value);
  if (!validation.ok) throw new BackupError("invalid_backup", validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("；"));
  const backup = validation.value;
  const snapshotKeys = new Set(backup.questionSnapshots.map((snapshot) => `${snapshot.questionId}@${snapshot.questionRevision}`));
  for (const attempt of backup.attempts) {
    if (attempt.kind === "choice" && !snapshotKeys.has(`${attempt.snapshot.questionId}@${attempt.snapshot.questionRevision}`)) {
      throw new BackupError("broken_reference", `作答 ${attempt.attemptId} 缺少题目快照`);
    }
  }
  return { backup, preview: {
    contentReleaseId: backup.contentReleaseId,
    attempts: backup.attempts.length, speedSessions: backup.speedSessions.length, reviews: backup.reviews.length,
    notes: backup.notes.length, favorites: backup.favorites.length, dailyPlans: backup.dailyPlans.length, mistakeNotes: backup.mistakeNotes.length,
  } };
}

export async function restoreLearningBackup(
  db: LearningDatabase,
  backup: BackupV1,
  options: { beforeCommit?: () => void | Promise<void> } = {},
): Promise<void> {
  previewLearningRestore(backup);
  const tables = [db.attempts, db.speedSessions, db.reviewStates, db.notes, db.favorites, db.dailyPlans, db.mistakeNotes] as const;
  await db.transaction("rw", tables, async () => {
    await Promise.all(tables.map((table) => table.clear()));
    await db.attempts.bulkPut(backup.attempts);
    await db.speedSessions.bulkPut(backup.speedSessions);
    await db.reviewStates.bulkPut(backup.reviews);
    await db.notes.bulkPut(backup.notes);
    await db.favorites.bulkPut(backup.favorites);
    await db.dailyPlans.bulkPut(backup.dailyPlans);
    await db.mistakeNotes.bulkPut(backup.mistakeNotes);
    await options.beforeCommit?.();
  });
}
