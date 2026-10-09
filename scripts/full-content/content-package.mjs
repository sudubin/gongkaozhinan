import { createHash } from "node:crypto";
import { canonicalJson, validateContentPackage } from "@gongkao/contracts";

export const contentKey = item => `${item.module}:${item.region}:${item.title.normalize("NFKC").replace(/[\s\p{P}]/gu, "").toLowerCase()}`;
export function verifiedPackage(content) {
  const { contentHash, ...payload } = content;
  if (!validateContentPackage(content).ok || contentHash !== `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`) throw new Error("existing_feed_integrity_failed");
  return content;
}
export function createPackage(items, questions, releaseId, date) {
  const payload = { schemaVersion: "content-package-v1", releaseId, createdAt: date, reviewedAt: date,
    rightsNote: "公考指南原创 / AI 辅助学习摘要；自动结构检查不等于事实准确性保证，AI 练习不是考试真题。", items, questions };
  const result = { ...payload, contentHash: `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}` };
  const validation = validateContentPackage(result);
  if (!validation.ok) throw new Error(validation.issues.map(issue => `${issue.path}: ${issue.message}`).join("；"));
  return result;
}
export function mergeEntries(current, entries) {
  const items = [...current.items], questions = [...current.questions];
  const keys = new Set(items.map(contentKey));
  for (const entry of entries) {
    if (keys.has(contentKey(entry.item))) continue;
    if (items.some(item => item.stableId === entry.item.stableId)) throw new Error("条目标识冲突");
    if (entry.questions.some(question => questions.some(old => old.stableId === question.stableId))) throw new Error("题目标识冲突");
    keys.add(contentKey(entry.item)); items.push(entry.item); questions.push(...entry.questions);
  }
  return { items, questions, added: items.length - current.items.length };
}
