import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { ContentItem, ContentPackageV1, Question } from "@gongkao/contracts";
import { type LearningDatabase, ContentImportError, validateContentPackageIntegrity } from "./contentDatabase";

export const CONTENT_FEED = "https://raw.githubusercontent.com/sudubin/gongkaozhinan/main/public/content/latest.json";
const CHECK_INTERVAL = 60 * 60 * 1000;
const RETRY_INTERVAL = 15 * 60 * 1000;
const inFlight = new WeakMap<LearningDatabase, Promise<SyncResult>>();
export interface SyncResult { status: "updated" | "unchanged" | "disabled" | "deferred"; added: number; updated: number; date?: string }

export function checkOpenSourceScope(content: ContentPackageV1): void {
  if (content.items.some(item => !["affairs", "general", "idiom", "essay"].includes(item.module) || item.region === "zhejiang" || (item.module === "affairs" && item.region !== "national"))) {
    throw new ContentImportError("excluded_module", "开源内容包不能包含地方专项内容");
  }
  const itemByKnowledge = new Map(content.items.map(item => [item.knowledgeId, item]));
  for (const question of content.questions) {
    const item = itemByKnowledge.get(question.knowledgeId);
    if (!item || item.module !== question.module || question.label !== "practice") throw new ContentImportError("invalid_question_link", "练习题与内容不匹配，或冒充真题");
  }
}

export function newerRevisions<T extends ContentItem | Question>(current: T[], incoming: T[]): T[] {
  const revisions = new Map(current.map(item => [item.stableId, item.revision]));
  return incoming.filter(item => !revisions.has(item.stableId) || item.revision > revisions.get(item.stableId)!);
}

// Unlike full-package restore, automatic releases are additive and never clear
// learning content, notes, favorites, attempts or existing revision snapshots.
export async function mergePublishedContent(db: LearningDatabase, value: unknown): Promise<SyncResult> {
  const content = await validateContentPackageIntegrity(value);
  checkOpenSourceScope(content);
  return db.transaction("rw", db.contentItems, db.questions, db.contentMeta, db.releases, async () => {
    const current = await db.contentItems.toArray();
    const nextItems = newerRevisions(current, content.items);
    const nextQuestions = newerRevisions(await db.questions.toArray(), content.questions);
    const existingIds = new Set(current.map(item => item.stableId));
    const added = nextItems.filter(item => !existingIds.has(item.stableId)).length;
    if (nextItems.length || nextQuestions.length) {
      await db.contentItems.bulkPut(nextItems);
      await db.questions.bulkPut(nextQuestions);
      await db.releases.put({ releaseId: content.releaseId, importedAt: new Date().toISOString(), contentHash: content.contentHash, package: content });
      await db.contentMeta.put({ key: "currentReleaseId", value: content.releaseId });
    }
    return { status: nextItems.length || nextQuestions.length ? "updated" : "unchanged", added, updated: nextItems.length - added, date: content.createdAt };
  });
}

export async function ensureInitialContent(db: LearningDatabase): Promise<void> {
  if ((await db.contentMeta.get("initialContentVersion"))?.value === "seed-v1-100") return;
  const response = await fetch(`${import.meta.env.BASE_URL}content/seed.json`);
  if (!response.ok) throw new ContentImportError("missing_seed", "内置内容包读取失败");
  const content = await response.json();
  await mergePublishedContent(db, content);
  await db.contentMeta.put({ key: "initialContentVersion", value: "seed-v1-100" });
}

export async function automaticUpdatesEnabled(db: LearningDatabase): Promise<boolean> {
  return (await db.contentMeta.get("automaticContentUpdates"))?.value !== "false";
}
export async function setAutomaticUpdates(db: LearningDatabase, enabled: boolean): Promise<void> {
  await db.contentMeta.put({ key: "automaticContentUpdates", value: String(enabled) });
}

export function syncPublishedContent(db: LearningDatabase, options: { force?: boolean; now?: number } = {}): Promise<SyncResult> {
  const existing = inFlight.get(db);
  if (existing) return existing;
  const promise = (async (): Promise<SyncResult> => {
    if (!options.force && !await automaticUpdatesEnabled(db)) return { status: "disabled", added: 0, updated: 0 };
    const now = options.now ?? Date.now();
    const last = Number((await db.contentMeta.get("contentFeedLastAttempt"))?.value ?? 0);
    const failed = (await db.contentMeta.get("contentFeedLastFailed"))?.value === "true";
    if (!options.force && now - last < (failed ? RETRY_INTERVAL : CHECK_INTERVAL)) return { status: "deferred", added: 0, updated: 0 };
    await db.contentMeta.put({ key: "contentFeedLastAttempt", value: String(now) });
    try {
      let value: unknown;
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.get({ url: `${CONTENT_FEED}?check=${now}`, connectTimeout: 15000, readTimeout: 30000 });
        if (response.status !== 200) throw new Error(`内容服务暂不可用（${response.status}）`);
        value = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      } else {
        const response = await fetch(`${CONTENT_FEED}?check=${now}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`内容服务暂不可用（${response.status}）`);
        value = await response.json();
      }
      const result = await mergePublishedContent(db, value);
      await db.contentMeta.bulkPut([{ key: "contentFeedLastFailed", value: "false" }, { key: "contentFeedLastSuccess", value: new Date(now).toISOString() }]);
      return result;
    } catch (error) {
      await db.contentMeta.put({ key: "contentFeedLastFailed", value: "true" });
      throw error;
    }
  })();
  inFlight.set(db, promise);
  void promise.finally(() => inFlight.delete(db)).catch(() => undefined);
  return promise;
}
