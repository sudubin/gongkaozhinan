export const CONTENT_SCHEMA_VERSION = "content-package-v1" as const;
export const BACKUP_SCHEMA_VERSION = "learning-backup-v1" as const;

export type Module = "affairs" | "general" | "idiom" | "essay" | "speed" | "zhejiang";
export type Region = "national" | "zhejiang" | "not-applicable";
export type IsoDate = string;

export interface SourceRef {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: IsoDate;
  verifiedAt: IsoDate;
  rightsNote: string;
  evidenceExcerpt?: string;
}

export interface ExamEvidence {
  examName: string;
  year: number;
  paper: string;
  questionNumber: string;
  sourceUrl: string;
  eventKey: string;
}

interface ContentBase {
  stableId: string;
  revision: number;
  knowledgeId: string;
  module: Module;
  region: Region;
  title: string;
  topic: string;
  keywords: string[];
  sourceRefs: SourceRef[];
  sourcePublishedAt: IsoDate;
  dataPeriod?: string;
  validFrom: IsoDate;
  validTo?: IsoDate;
  generatedAt?: IsoDate;
  reviewedAt: IsoDate;
  rightsNote: string;
  status: "published" | "withdrawn";
  withdrawnReason?: string;
  examEvidence: ExamEvidence[];
  editorRecommended: boolean;
}

export interface AffairsItem extends ContentBase {
  module: "affairs";
  eventDate: IsoDate;
  summary: string;
  examPoints: string[];
}

export interface GeneralItem extends ContentBase {
  module: "general";
  concept: string;
  explanation: string;
}

export interface IdiomItem extends ContentBase {
  module: "idiom";
  pronunciation: string;
  definition: string;
  collocations: string[];
  example: string;
  confusableWith: Array<{ term: string; difference: string }>;
}

export interface EssayItem extends ContentBase {
  module: "essay";
  facts: string[];
  expressions: string[];
  scenarios: string[];
  aiSuggestions: string[];
}

export type ZhejiangCategory =
  | "geography-resources"
  | "history-culture"
  | "ideas-practice"
  | "economy-coordination"
  | "governance-livelihood"
  | "annual-essay-cases";

export interface ZhejiangItem extends ContentBase {
  module: "zhejiang";
  region: "zhejiang";
  category: ZhejiangCategory;
  keyPoint: string;
  confusions: string[];
  applicableYears: number[];
}

export interface SpeedReferenceItem extends ContentBase {
  module: "speed";
  algorithmVersion: string;
  trainingType: "two-digit-times-one" | "fraction-percent" | "growth-base";
  concept: string;
  formula: string;
  workedExample: string;
}

export type ContentItem = AffairsItem | GeneralItem | IdiomItem | EssayItem | ZhejiangItem | SpeedReferenceItem;

export interface Question {
  stableId: string;
  revision: number;
  knowledgeId: string;
  module: Exclude<Module, "essay" | "speed">;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
  sourceRefs: string[];
  reviewedAt: IsoDate;
  generatedByAi: boolean;
  label: "practice" | "verified-exam";
}

export interface ContentPackageV1 {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  releaseId: string;
  createdAt: IsoDate;
  reviewedAt: IsoDate;
  rightsNote: string;
  contentHash: string;
  items: ContentItem[];
  questions: Question[];
}

export interface AttemptSnapshot {
  questionId: string;
  questionRevision: number;
  prompt: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  explanation: string;
}

export interface ChoiceAttempt {
  kind: "choice";
  attemptId: string;
  questionId: string;
  selectedOptionId: string;
  correct: boolean;
  answeredAt: IsoDate;
  snapshot: AttemptSnapshot;
}

export interface SpeedAttempt {
  kind: "speed";
  attemptId: string;
  sessionId: string;
  mode: "exact" | "estimate";
  prompt: string;
  input: string;
  expected: string;
  correct: boolean;
  parameters: Record<string, number | string>;
  algorithmVersion: string;
  answeredAt: IsoDate;
}

export type Attempt = ChoiceAttempt | SpeedAttempt;

export interface SpeedSession {
  sessionId: string;
  trainingType: "two-digit-times-one" | "fraction-percent" | "growth-base";
  mode: "exact" | "estimate";
  seed: string;
  algorithmVersion: string;
  effectiveMilliseconds: number;
  status: "active" | "paused" | "completed";
}

export interface ReviewState {
  stableId: string;
  stage: number;
  dueLocalDate: string;
  lastReviewedLocalDate?: string;
}

export interface Note { noteId: string; stableId: string; text: string; updatedAt: IsoDate }
export interface Favorite { stableId: string; createdAt: IsoDate }
export interface DailyPlan { localDate: string; contentIds: string[]; questionIds: string[]; completedIds: string[] }
export interface MistakeNote { attemptId: string; reason: "unfamiliar" | "confused" | "oversight" | "custom"; confusedOptionId?: string; distinction: string }

export interface BackupV1 {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: IsoDate;
  contentReleaseId: string;
  attempts: Attempt[];
  speedSessions: SpeedSession[];
  reviews: ReviewState[];
  notes: Note[];
  favorites: Favorite[];
  dailyPlans: DailyPlan[];
  mistakeNotes: MistakeNote[];
  questionSnapshots: AttemptSnapshot[];
}

export type DraftStatus = "imported" | "drafted" | "needs-review" | "approved" | "published" | "rejected" | "blocked" | "withdrawn";
export interface SourceDocument { id: string; title: string; url: string; publisher: string; publishedAt: IsoDate; importedAt: IsoDate; contentHash: string; body: string }
export interface DraftRevision { draftId: string; stableId: string; revision: number; status: DraftStatus; sourceIds: string[]; payload: unknown; generatedAt?: IsoDate; model?: string; templateVersion?: string }
export interface ReviewRecord { id: string; draftId: string; revision: number; decision: "approved" | "rejected"; reviewedAt: IsoDate; reviewer: string; notes: string }
export interface Release { releaseId: string; createdAt: IsoDate; draftRevisions: Array<{ draftId: string; revision: number }>; contentHash: string; remoteStatus: "not-uploaded" | "uploaded" }
export interface GenerationJob { id: string; sourceHash: string; status: "queued" | "running" | "cancelled" | "failed" | "completed"; attempts: number; errorCode?: string }
export interface ProviderConfigPublic { protocol: "chat-completions"; baseUrl: string; model: string; timeoutMs: number; batchLimit: number; apiKeyMasked: string | null }

export interface ContractIssue { path: string; code: string; message: string }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ContractIssue[] };


