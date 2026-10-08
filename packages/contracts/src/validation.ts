import {
  BACKUP_SCHEMA_VERSION,
  CONTENT_SCHEMA_VERSION,
  type BackupV1,
  type ContentItem,
  type ContentPackageV1,
  type ContractIssue,
  type Question,
  type ValidationResult,
} from "./types.js";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const array = (value: unknown): value is unknown[] => Array.isArray(value);
const date = (value: unknown): value is string => text(value) && !Number.isNaN(Date.parse(value));

function issue(issues: ContractIssue[], path: string, code: string, message: string) { issues.push({ path, code, message }); }
function required(issues: ContractIssue[], value: unknown, path: string) { if (!text(value)) issue(issues, path, "required", "必须是非空字符串"); }
function unique(issues: ContractIssue[], values: string[], path: string) {
  const seen = new Set<string>();
  for (const value of values) seen.has(value) ? issue(issues, path, "duplicate", `重复标识：${value}`) : seen.add(value);
}

function validateSource(value: unknown, path: string, issues: ContractIssue[]) {
  if (!object(value)) return issue(issues, path, "type", "来源必须是对象");
  for (const key of ["id", "title", "url", "publisher", "rightsNote"] as const) required(issues, value[key], `${path}.${key}`);
  if (!date(value.publishedAt)) issue(issues, `${path}.publishedAt`, "date", "发布日期无效");
  if (!date(value.verifiedAt)) issue(issues, `${path}.verifiedAt`, "date", "核验日期无效");
  if (text(value.url)) { try { new URL(value.url); } catch { issue(issues, `${path}.url`, "url", "来源链接无效"); } }
}

function validateItem(value: unknown, path: string, issues: ContractIssue[]) {
  if (!object(value)) return issue(issues, path, "type", "内容必须是对象");
  for (const key of ["stableId", "knowledgeId", "module", "region", "title", "topic", "sourcePublishedAt", "validFrom", "reviewedAt", "rightsNote", "status"] as const) required(issues, value[key], `${path}.${key}`);
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) issue(issues, `${path}.revision`, "revision", "修订号必须为正整数");
  if (!array(value.keywords)) issue(issues, `${path}.keywords`, "type", "关键词必须是数组");
  if (!array(value.sourceRefs) || value.sourceRefs.length === 0) issue(issues, `${path}.sourceRefs`, "required", "至少需要一个来源");
  else value.sourceRefs.forEach((source, index) => validateSource(source, `${path}.sourceRefs[${index}]`, issues));
  if (value.status !== "published" && value.status !== "withdrawn") issue(issues, `${path}.status`, "status", "内容包只允许已发布或已撤回内容");
  if (value.status === "withdrawn" && !text(value.withdrawnReason)) issue(issues, `${path}.withdrawnReason`, "required", "撤回内容必须说明原因");
  const moduleFields: Record<string, string[]> = {
    affairs: ["eventDate", "summary", "examPoints"], general: ["concept", "explanation"],
    idiom: ["pronunciation", "definition", "collocations", "example", "confusableWith"],
    essay: ["facts", "expressions", "scenarios", "aiSuggestions"],
    zhejiang: ["category", "keyPoint", "confusions", "applicableYears"],
    speed: ["algorithmVersion", "trainingType", "concept", "formula", "workedExample"],
  };
  const fields = text(value.module) ? moduleFields[value.module] : undefined;
  if (!fields) issue(issues, `${path}.module`, "enum", "未知模块");
  else for (const field of fields) if (value[field] === undefined || value[field] === "") issue(issues, `${path}.${field}`, "required", "缺少模块字段");
  if (value.module === "zhejiang" && value.region !== "zhejiang") issue(issues, `${path}.region`, "region", "浙江省情地域必须为浙江");
}

function validateQuestion(value: unknown, path: string, issues: ContractIssue[]) {
  if (!object(value)) return issue(issues, path, "type", "题目必须是对象");
  for (const key of ["stableId", "knowledgeId", "module", "prompt", "correctOptionId", "explanation", "reviewedAt", "label"] as const) required(issues, value[key], `${path}.${key}`);
  if (!array(value.options) || value.options.length < 2) return issue(issues, `${path}.options`, "options", "至少需要两个选项");
  const ids = value.options.flatMap((option) => object(option) && text(option.id) ? [option.id] : []);
  unique(issues, ids, `${path}.options`);
  if (!ids.includes(String(value.correctOptionId))) issue(issues, `${path}.correctOptionId`, "answer", "标准答案不属于选项");
  if (value.generatedByAi === true && value.label !== "practice") issue(issues, `${path}.label`, "label", "AI 生成题只能标为练习题");
}

export function validateContentPackage(value: unknown): ValidationResult<ContentPackageV1> {
  const issues: ContractIssue[] = [];
  if (!object(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "内容包必须是对象" }] };
  if (value.schemaVersion !== CONTENT_SCHEMA_VERSION) issue(issues, "$.schemaVersion", "version", "不支持的内容包版本");
  for (const key of ["releaseId", "rightsNote", "contentHash"] as const) required(issues, value[key], `$.${key}`);
  if (!date(value.createdAt)) issue(issues, "$.createdAt", "date", "创建日期无效");
  if (!date(value.reviewedAt)) issue(issues, "$.reviewedAt", "date", "审核日期无效");
  if (!array(value.items)) issue(issues, "$.items", "type", "内容列表必须是数组");
  else value.items.forEach((item, index) => validateItem(item, `$.items[${index}]`, issues));
  if (!array(value.questions)) issue(issues, "$.questions", "type", "题目列表必须是数组");
  else value.questions.forEach((question, index) => validateQuestion(question, `$.questions[${index}]`, issues));
  const items = array(value.items) ? value.items.filter(object) : [];
  const questions = array(value.questions) ? value.questions.filter(object) : [];
  unique(issues, items.flatMap((item) => text(item.stableId) ? [item.stableId] : []), "$.items");
  unique(issues, questions.flatMap((question) => text(question.stableId) ? [question.stableId] : []), "$.questions");
  const sourceIds = new Set(items.flatMap((item) => array(item.sourceRefs) ? item.sourceRefs.flatMap((source) => object(source) && text(source.id) ? [source.id] : []) : []));
  questions.forEach((question, index) => { if (array(question.sourceRefs)) for (const id of question.sourceRefs) if (text(id) && !sourceIds.has(id)) issue(issues, `$.questions[${index}].sourceRefs`, "reference", `来源引用不存在：${id}`); });
  return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as ContentPackageV1 };
}

export function validateBackup(value: unknown): ValidationResult<BackupV1> {
  const issues: ContractIssue[] = [];
  if (!object(value)) return { ok: false, issues: [{ path: "$", code: "type", message: "备份必须是对象" }] };
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) issue(issues, "$.schemaVersion", "version", "不支持的备份版本");
  if (!date(value.exportedAt)) issue(issues, "$.exportedAt", "date", "导出日期无效");
  required(issues, value.contentReleaseId, "$.contentReleaseId");
  const listKeys = ["attempts", "speedSessions", "reviews", "notes", "favorites", "dailyPlans", "mistakeNotes", "questionSnapshots"] as const;
  for (const key of listKeys) if (!array(value[key])) issue(issues, `$.${key}`, "type", "必须是数组");
  const attempts = array(value.attempts) ? value.attempts.filter(object) : [];
  const snapshots = array(value.questionSnapshots) ? value.questionSnapshots.filter(object) : [];
  unique(issues, attempts.flatMap((attempt) => text(attempt.attemptId) ? [attempt.attemptId] : []), "$.attempts");
  const attemptIds = new Set(attempts.flatMap((attempt) => text(attempt.attemptId) ? [attempt.attemptId] : []));
  if (array(value.mistakeNotes)) value.mistakeNotes.forEach((note, index) => { if (object(note) && text(note.attemptId) && !attemptIds.has(note.attemptId)) issue(issues, `$.mistakeNotes[${index}].attemptId`, "reference", "错因引用的作答不存在"); });
  attempts.forEach((attempt, index) => {
    if (attempt.kind !== "choice" && attempt.kind !== "speed") issue(issues, `$.attempts[${index}].kind`, "enum", "未知作答类型");
    if (attempt.kind === "choice" && !object(attempt.snapshot)) issue(issues, `$.attempts[${index}].snapshot`, "required", "普通题作答必须保留题目快照");
  });
  unique(issues, snapshots.flatMap((snapshot) => text(snapshot.questionId) ? [`${snapshot.questionId}@${String(snapshot.questionRevision)}`] : []), "$.questionSnapshots");
  const forbidden = JSON.stringify(value);
  for (const marker of ["apiKey", "authorization", "sessionToken"]) if (forbidden.toLowerCase().includes(marker.toLowerCase())) issue(issues, "$", "secret", "备份不得包含维护端密钥或会话");
  return issues.length ? { ok: false, issues } : { ok: true, value: value as unknown as BackupV1 };
}

export function isPublishedItem(value: ContentItem): boolean { return value.status === "published"; }
export function isValidQuestion(value: Question): boolean { return value.options.some((option) => option.id === value.correctOptionId); }

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

