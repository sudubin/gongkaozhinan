<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ContentItem, DailyPlan, EssayItem, Question, SpeedAttempt, SpeedSession, ZhejiangCategory } from "@gongkao/contracts";
import { LearningDatabase, type MobileCandidate } from "./infrastructure/contentDatabase";
import { clearMobileProvider, readMobileProvider, saveMobileProvider, testMobileProvider, type MobileProviderConfig } from "./infrastructure/mobileMaintenance";
import { approveMobileCandidate, rejectMobileCandidate, runMobileUpdate } from "./infrastructure/mobileUpdates";
import { automaticUpdatesEnabled, ensureInitialContent, setAutomaticUpdates, syncPublishedContent } from "./infrastructure/publishedContent";
import { exportLearningBackup, previewLearningRestore, restoreLearningBackup } from "./infrastructure/learningBackup";
import { addCardToReview, currentLocalDate, dueReviews, evaluateCardReview, getOrCreateDailyPlan, markDailyPlanCompleted, saveChoiceAttemptOnce, saveMistakeReason, savePersonalNote, toggleFavorite } from "./infrastructure/learningRecords";
import { generalTopics, publishedGeneralItems } from "./features/general/generalContent";
import { idiomTopics, publishedIdioms } from "./features/idiom/idiomContent";
import { affairMonths, publishedAffairs } from "./features/affairs/affairsContent";
import { essayPresentation, essayTopics, publishedEssays } from "./features/essay/essayContent";
import { generateSpeedSet, scoreSpeedInput, summarizeSpeed, SPEED_ALGORITHM_VERSION, type SpeedMode, type SpeedProblem, type SpeedTrainingType } from "./features/speed/speedEngine";
import { masteryKey, resolveLinkedContent, type LinkedContentTarget } from "./features/shared/linkedContent";
import {
  PhArrowLeft as ArrowLeft, PhArrowRight as ArrowRight, PhBookBookmark as BookBookmark,
  PhBookmarkSimple as BookmarkSimple, PhCalculator as Calculator, PhCalendarDots as CalendarDots,
  PhCheck as Check, PhCheckCircle as CheckCircle, PhClock as Clock, PhFileText as FileText,
  PhHouse as House, PhInfo as Info, PhMagnifyingGlass as MagnifyingGlass, PhMapTrifold as MapTrifold,
  PhNotePencil as NotePencil, PhSlidersHorizontal as SlidersHorizontal,
  PhUserCircle as UserCircle, PhXCircle as XCircle,
} from "@phosphor-icons/vue";

type Tab = "today" | "learn" | "review" | "profile";
type Page = "root" | "affairs-list" | "affairs-detail" | "knowledge" | "province" | "quiz" | "idiom-list" | "idiom" | "idiom-quiz" | "speed" | "speed-question" | "essay-list" | "essay-detail";

type LearningState = {
  savedProvince: boolean;
  savedMistake: boolean;
  mistakeReason: string;
  mistakeNote: string;
  idiomRevealed: boolean;
  completed: number;
};

const STORAGE_KEY = "gongkao-learning-v1";
const tab = ref<Tab>("learn");
const page = ref<Page>("root");
const history = ref<Page[]>([]);
const query = ref("");
const filterOpen = ref(false);
const selectedFilter = ref("全部主题");
const knowledgeQuery = ref("");
const knowledgeTopic = ref("");
const idiomQuery = ref("");
const idiomTopic = ref("");
const idiomMode = ref<"new" | "review">("new");
const affairsRegion = ref<"national">("national");
const affairsQuery = ref("");
const affairsDay = ref("");
const affairsMonth = ref("");
const essayQuery = ref("");
const essayTopic = ref("");
const answer = ref<string | null>(null);
const submitted = ref(false);
const idiomAnswer = ref<string | null>(null);
const idiomSubmitted = ref(false);
const speedValue = ref("");
const speedSubmitted = ref(false);
const estimateMode = ref(true);
const speedType = ref<SpeedTrainingType>("growth-base");
const speedSession = ref<SpeedSession | null>(null);
const speedProblems = ref<SpeedProblem[]>([]);
const speedAttempts = ref<SpeedAttempt[]>([]);
const speedMessage = ref("");
const speedTick = ref(0);
let speedStartedAt = 0;
let speedTimer: ReturnType<typeof setInterval> | null = null;
const essayNote = ref("");
const noteSaved = ref(false);
const learningDb = new LearningDatabase();
const publishedItem = ref<ContentItem | null>(null);
const contentItems = ref<ContentItem[]>([]);
const publishedQuestion = ref<Question | null>(null);
const contentLoadError = ref("");
const currentAttemptId = ref(crypto.randomUUID());
const dailyPlan = ref<DailyPlan | null>(null);
const isFavorite = ref(false);
const isInReview = ref(false);
const dueReviewCount = ref(0);
const restoreInput = ref<HTMLInputElement | null>(null);
const attemptCount = ref(0);
const correctAttemptCount = ref(0);
const reviewIds = ref(new Set<string>());
const previousMistakeNote = ref("");
const contentUpdatedAt = ref("");
const linkedOrigin = ref<{ item: ContentItem; question: Question | null } | null>(null);
const simulateStorageWriteFailure = ref(false);
const fontScale = ref(Number(localStorage.getItem("gongkao-font-scale") ?? "1"));
const maintenanceOpen = ref(false);
const maintenanceStatus = ref("");
const mobileProvider = ref<MobileProviderConfig>({ baseUrl: "", model: "", apiKey: "", timeoutMs: 30000, dailyHour: 7, enabled: true });
const mobileCandidates = ref<MobileCandidate[]>([]);
const autoContentEnabled = ref(true);
const autoPreferenceBusy = ref(false);
const contentSyncStatus = ref("内置 100 条基础内容，联网后自动检查增量。");
const contentSyncBusy = ref(false);
let contentReady = false;
let contentSyncTimer: ReturnType<typeof setInterval> | null = null;

async function refreshContent() {
  contentItems.value = (await learningDb.contentItems.toArray()).filter(item => item.module !== "zhejiang" && item.region !== "zhejiang");
  const currentReleaseId = (await learningDb.contentMeta.get("currentReleaseId"))?.value;
  contentUpdatedAt.value = currentReleaseId ? (await learningDb.releases.get(currentReleaseId))?.package.createdAt ?? "" : "";
  if (publishedItem.value) publishedItem.value = contentItems.value.find(item => item.stableId === publishedItem.value?.stableId) ?? publishedItem.value;
}
async function syncContentNow(force = false) {
  if (!contentReady || contentSyncBusy.value) return;
  contentSyncBusy.value = true;
  try {
    const result = await syncPublishedContent(learningDb, { force });
    if (result.status === "updated") {
      await refreshContent();
      dailyPlan.value = await getOrCreateDailyPlan(learningDb);
      contentSyncStatus.value = `已自动同步：新增 ${result.added} 条，修订 ${result.updated} 条。`;
    } else if (result.status === "unchanged") contentSyncStatus.value = "已检查，目前没有新的内容；本机内容可离线学习。";
    else if (result.status === "disabled") contentSyncStatus.value = "自动同步已关闭，已有内容仍可离线学习。";
  } catch {
    contentSyncStatus.value = "暂未取得新内容，已保留本机内容；联网后会自动重试。";
  } finally { contentSyncBusy.value = false; }
}
async function changeAutomaticUpdates() {
  autoPreferenceBusy.value = true;
  try {
    await setAutomaticUpdates(learningDb, autoContentEnabled.value);
    if (autoContentEnabled.value) { contentSyncStatus.value = "自动同步已开启。"; void syncContentNow(true); }
    else contentSyncStatus.value = "自动同步已关闭，已有内容仍可离线学习。";
  } catch { contentSyncStatus.value = "自动同步设置未保存，请稍后重试。"; }
  finally { autoPreferenceBusy.value = false; }
}
function resumeContentSync() { if (document.visibilityState === "visible") void syncContentNow(); }
const state = ref<LearningState>({
  savedProvince: false,
  savedMistake: false,
  mistakeReason: "易混项混淆",
  mistakeNote: "",
  idiomRevealed: false,
  completed: 3,
});

onMounted(async () => {
  if (import.meta.env.DEV) {
    (window as typeof window & { __gongkaoTest?: { closeStorage(): void; failWrites(): void } }).__gongkaoTest = {
      closeStorage: () => learningDb.close({ disableAutoOpen: true }),
      failWrites: () => { simulateStorageWriteFailure.value = true; },
    };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) state.value = { ...state.value, ...JSON.parse(stored) };
  } catch { /* corrupted local state falls back safely */ }
  try {
    await ensureInitialContent(learningDb);
    await refreshContent();
    autoContentEnabled.value = await automaticUpdatesEnabled(learningDb);
    publishedItem.value = publishedGeneralItems(contentItems.value)[0] ?? contentItems.value.find((item) => item.status === "published") ?? null;
    publishedQuestion.value = publishedItem.value ? await learningDb.questions.where("knowledgeId").equals(publishedItem.value.knowledgeId).first() ?? null : null;
    dailyPlan.value = await getOrCreateDailyPlan(learningDb);
    if (publishedItem.value) {
      isFavorite.value = Boolean(await learningDb.favorites.get(publishedItem.value.stableId));
      isInReview.value = Boolean(await learningDb.reviewStates.get(publishedItem.value.stableId));
      essayNote.value = (await learningDb.notes.get(`content:${publishedItem.value.stableId}`))?.text ?? "";
    }
    dueReviewCount.value = (await dueReviews(learningDb)).length;
    reviewIds.value = new Set((await learningDb.reviewStates.toArray()).map((item) => item.stableId));
    const attempts = await learningDb.attempts.toArray();
    attemptCount.value = attempts.filter((item) => item.kind === "choice").length;
    correctAttemptCount.value = attempts.filter((item) => item.kind === "choice" && item.correct).length;
    mobileCandidates.value = await learningDb.mobileCandidates.where("status").equals("pending").reverse().sortBy("createdAt");
    const config = await readMobileProvider().catch(() => null);
    if (config) mobileProvider.value = { ...config, apiKey: "" };
    const unfinished = (await learningDb.speedSessions.where("status").anyOf("active", "paused").last()) ?? null;
    if (unfinished) {
      speedSession.value = { ...unfinished, status: "paused" };
      await learningDb.speedSessions.put({ ...speedSession.value });
      speedType.value = unfinished.trainingType;
      estimateMode.value = unfinished.mode === "estimate";
      speedProblems.value = generateSpeedSet(unfinished.trainingType, unfinished.seed, unfinished.mode);
      speedAttempts.value = (await learningDb.attempts.toArray()).filter((entry): entry is SpeedAttempt => entry.kind === "speed" && entry.sessionId === unfinished.sessionId);
    }
    contentReady = true;
    document.addEventListener("visibilitychange", resumeContentSync);
    window.addEventListener("online", resumeContentSync);
    contentSyncTimer = setInterval(resumeContentSync, 30 * 60 * 1000);
    void syncContentNow();
  } catch {
    contentLoadError.value = "本机内容读取失败，请稍后重试。";
  }
});
onBeforeUnmount(() => {
  if (speedTimer) clearInterval(speedTimer);
  if (contentSyncTimer) clearInterval(contentSyncTimer);
  document.removeEventListener("visibilitychange", resumeContentSync);
  window.removeEventListener("online", resumeContentSync);
});
watch(state, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value)), { deep: true });
watch(fontScale, (value) => localStorage.setItem("gongkao-font-scale", String(value)));

const pageTitle = computed(() => {
  if (page.value === "province" && publishedItem.value?.module === "general") return "常识详情";
  return ({
    root: "", "affairs-list": "时政", "affairs-detail": "时政详情", knowledge: "常识", "idiom-list": "成语",
    province: "常识", quiz: "随堂小测", idiom: "成语卡",
    "idiom-quiz": "成语辨析", speed: "基期量", "speed-question": "估算训练", "essay-list": "申论积累", "essay-detail": "申论素材",
  }[page.value] ?? "");
});

const moduleCount = (module: string) => contentItems.value.filter(item => item.module === module && item.status === "published").length;
const modules = computed(() => [
  { id: "knowledge", name: "常识", desc: "广泛涉猎，夯实综合素养", count: `${moduleCount("general")} 条`, icon: BookBookmark, tone: "amber" },
  { id: "speed", name: "速算", desc: "方法技巧，提升解题速度", count: "3 类训练", icon: Calculator, tone: "blue" },
  { id: "idiom", name: "成语", desc: "辨析易混，积累准确用法", count: `${moduleCount("idiom")} 条`, icon: FileText, tone: "violet" },
  { id: "essay", name: "申论", desc: "素材转化，建立表达积累", count: `${moduleCount("essay")} 篇`, icon: NotePencil, tone: "rose" },
]);
const visibleModules = computed(() => {
  const keyword = query.value.trim();
  return keyword ? modules.value.filter((item) => `${item.name}${item.desc}`.includes(keyword)) : modules.value;
});
const knowledgeItems = computed(() => publishedGeneralItems(contentItems.value, { query: knowledgeQuery.value, topic: knowledgeTopic.value }));
const knowledgeTopics = computed(() => generalTopics(contentItems.value));
const allIdiomItems = computed(() => publishedIdioms(contentItems.value, idiomQuery.value, idiomTopic.value));
const visibleIdiomItems = computed(() => allIdiomItems.value.filter((item) => idiomMode.value === "review" ? reviewIds.value.has(item.stableId) : !reviewIds.value.has(item.stableId)));
const availableIdiomTopics = computed(() => idiomTopics(contentItems.value));
const visibleAffairs = computed(() => publishedAffairs(contentItems.value, { region: affairsRegion.value, query: affairsQuery.value, day: affairsDay.value, month: affairsDay.value ? "" : affairsMonth.value }));
const visibleAffairMonths = computed(() => affairMonths(contentItems.value, affairsRegion.value));
const visibleEssays = computed(() => publishedEssays(contentItems.value, essayQuery.value, essayTopic.value));
const availableEssayTopics = computed(() => essayTopics(contentItems.value));
const selectedEssay = computed(() => publishedItem.value?.module === "essay" ? publishedItem.value : null);
const selectedEssayPresentation = computed(() => selectedEssay.value ? essayPresentation(selectedEssay.value) : null);
const linkedTargets = computed(() => publishedItem.value && publishedItem.value.module === "essay" ? resolveLinkedContent(contentItems.value, publishedItem.value, new Set(["affairs", "general", "idiom", "essay"])) : []);
const currentSpeedProblem = computed(() => speedProblems.value[Math.max(0, speedAttempts.value.length - (speedSubmitted.value ? 1 : 0))] ?? null);
const speedSummary = computed(() => summarizeSpeed(speedAttempts.value.filter((item) => item.input && item.correct).length, speedAttempts.value.filter((item) => item.input && !item.correct).length, speedAttempts.value.filter((item) => !item.input).length, speedSession.value?.effectiveMilliseconds ?? 0));
const speedElapsed = computed(() => Math.round(((speedSession.value?.effectiveMilliseconds ?? 0) + speedTick.value) / 1000));
const speedTypeLabel = computed(() => ({ "two-digit-times-one": "两位数乘一位数", "fraction-percent": "分数百分数互换", "growth-base": "增长率与基期量" })[speedType.value]);
const speedFormula = computed(() => ({
  "two-digit-times-one": { formula: "ab × c = (a × c) + (b × c)", example: "24 × 3 = 20 × 3 + 4 × 3 = 72" },
  "fraction-percent": { formula: "百分数 = 分子 ÷ 分母 × 100%", example: "1/8 × 100% = 12.5%" },
  "growth-base": { formula: "基期量 = 现期量 ÷（1 + 增长率）", example: "1,200 ÷（1 + 20%）= 1,000" },
})[speedType.value]);
const displayedQuestion = computed(() => publishedQuestion.value ?? {
  stableId: "prototype-question", revision: 1, knowledgeId: "prototype", module: "general" as const,
  prompt: "下列哪项属于常识学习的基本方法？",
  options: [{ id: "A", text: "只记结论，不看解释" }, { id: "B", text: "结合概念、例证与错因进行复习" }, { id: "C", text: "只做熟悉题目" }, { id: "D", text: "完全忽略来源" }],
  correctOptionId: "B", explanation: "结合概念、例证与错因进行复习，有助于建立稳定理解并减少重复错误。",
  sourceRefs: [], reviewedAt: "2026-09-20", generatedByAi: false, label: "practice" as const,
});
const displayedTitle = computed(() => publishedItem.value?.title ?? "基础学习卡");
const displayedSummary = computed(() => {
  const item = publishedItem.value;
  if (!item) return "请在学习模块中选择一条内容。";
  if (item.module === "general") return item.explanation;
  if (item.module === "affairs") return item.summary;
  if (item.module === "idiom") return item.definition;
  if (item.module === "essay") return item.facts.join("；");
  if (item.module === "speed") return item.concept;
  return "该内容不在开源版提供范围内。";
});
const dailyPlanTotal = computed(() => (dailyPlan.value?.contentIds.length ?? 0) + (dailyPlan.value?.questionIds.length ?? 0));
const dailyPlanCompleted = computed(() => dailyPlan.value?.completedIds.length ?? 0);
const dailyPlanRemaining = computed(() => Math.max(0, dailyPlanTotal.value - dailyPlanCompleted.value));
const dailyProgress = computed(() => dailyPlanTotal.value ? `${Math.round(dailyPlanCompleted.value / dailyPlanTotal.value * 100)}%` : "0%");
const objectiveAccuracy = computed(() => attemptCount.value ? `${Math.round(correctAttemptCount.value / attemptCount.value * 100)}%` : "尚无记录");
const hasUnfinishedPlan = computed(() => dailyPlanCompleted.value > 0 && dailyPlanRemaining.value > 0);
const unstartedContentCount = computed(() => dailyPlan.value?.contentIds.filter((id) => !dailyPlan.value?.completedIds.includes(id)).length ?? 0);

async function startPublishedQuiz() {
  if (publishedItem.value && dailyPlan.value) {
    await markDailyPlanCompleted(learningDb, dailyPlan.value.localDate, publishedItem.value.stableId);
    dailyPlan.value = await learningDb.dailyPlans.get(dailyPlan.value.localDate) ?? dailyPlan.value;
  }
  push("quiz");
}
async function selectKnowledge(item: ContentItem) {
  publishedItem.value = item;
  publishedQuestion.value = await learningDb.questions.where("knowledgeId").equals(item.knowledgeId).first() ?? null;
  isFavorite.value = Boolean(await learningDb.favorites.get(item.stableId));
  isInReview.value = Boolean(await learningDb.reviewStates.get(item.stableId));
  push("province");
}
async function selectIdiom(item: ContentItem) {
  publishedItem.value = item;
  publishedQuestion.value = await learningDb.questions.where("knowledgeId").equals(item.knowledgeId).first() ?? null;
  isFavorite.value = Boolean(await learningDb.favorites.get(item.stableId));
  isInReview.value = Boolean(await learningDb.reviewStates.get(item.stableId));
  state.value.idiomRevealed = false;
  previousMistakeNote.value = "";
  answer.value = null;
  submitted.value = false;
  currentAttemptId.value = crypto.randomUUID();
  if (publishedQuestion.value) {
    const attempts = (await learningDb.attempts.where("questionId").equals(publishedQuestion.value.stableId).toArray()).filter((entry) => entry.kind === "choice");
    for (const attempt of attempts.reverse()) {
      const note = await learningDb.mistakeNotes.get(attempt.attemptId);
      if (note) { previousMistakeNote.value = note.distinction; break; }
    }
  }
  push("idiom");
}
function openAffairs(region: "national") {
  affairsRegion.value = region;
  push("affairs-list");
}
async function selectAffair(item: ContentItem) {
  publishedItem.value = item;
  publishedQuestion.value = await learningDb.questions.where("knowledgeId").equals(item.knowledgeId).first() ?? null;
  isFavorite.value = Boolean(await learningDb.favorites.get(item.stableId));
  isInReview.value = Boolean(await learningDb.reviewStates.get(item.stableId));
  push("affairs-detail");
}
async function selectEssay(item: EssayItem) {
  publishedItem.value = item;
  publishedQuestion.value = null;
  isFavorite.value = Boolean(await learningDb.favorites.get(item.stableId));
  isInReview.value = Boolean(await learningDb.reviewStates.get(item.stableId));
  essayNote.value = (await learningDb.notes.get(`content:${item.stableId}`))?.text ?? "";
  noteSaved.value = false;
  push("essay-detail");
}
async function openEssayFromCurrent() {
  const linked = publishedItem.value
    ? publishedEssays(contentItems.value).find((item) => item.knowledgeId === publishedItem.value?.knowledgeId)
    : undefined;
  if (linked) {
    if (publishedItem.value) linkedOrigin.value = { item: publishedItem.value, question: publishedQuestion.value };
    await selectEssay(linked);
  }
  else push("essay-list");
}
async function openLinkedTarget(target: LinkedContentTarget) {
  if (target.status !== "available") return;
  const item = contentItems.value.find((entry) => entry.stableId === target.stableId);
  if (!item) return;
  if (item.module === "affairs") await selectAffair(item);
  else if (item.module === "general") await selectKnowledge(item);
  else if (item.module === "idiom") await selectIdiom(item);
  else if (item.module === "essay") await selectEssay(item);
}

async function submitAnswer() {
  if (!answer.value || submitted.value) return;
  submitted.value = true;
  if (publishedQuestion.value) {
    try { await saveChoiceAttemptOnce(learningDb, { attemptId: currentAttemptId.value, question: publishedQuestion.value, selectedOptionId: answer.value }); }
    catch { contentLoadError.value = "本次作答未保存，请检查浏览器存储权限。"; }
    if (dailyPlan.value) {
      await markDailyPlanCompleted(learningDb, dailyPlan.value.localDate, publishedQuestion.value.stableId);
      dailyPlan.value = await learningDb.dailyPlans.get(dailyPlan.value.localDate) ?? dailyPlan.value;
    }
    attemptCount.value = await learningDb.attempts.where("kind").equals("choice").count();
    correctAttemptCount.value = (await learningDb.attempts.where("kind").equals("choice").toArray()).filter((item) => item.kind === "choice" && item.correct).length;
  }
}
async function togglePublishedFavorite() {
  if (!publishedItem.value) return;
  try {
    if (simulateStorageWriteFailure.value || !learningDb.isOpen()) throw new Error("storage unavailable");
    isFavorite.value = await toggleFavorite(learningDb, publishedItem.value.stableId);
  }
  catch { contentLoadError.value = "收藏未保存，请检查浏览器存储权限。"; }
}
async function addPublishedReview() {
  if (!publishedItem.value) return;
  try {
    await addCardToReview(learningDb, publishedItem.value.stableId);
    isInReview.value = true;
    reviewIds.value = new Set([...reviewIds.value, publishedItem.value.stableId]);
    dueReviewCount.value = (await dueReviews(learningDb)).length;
  } catch { contentLoadError.value = "复习计划未保存，请检查浏览器存储权限。"; }
}
async function ratePublishedReview(rating: "remembered" | "forgot") {
  if (!publishedItem.value) return;
  try {
    await evaluateCardReview(learningDb, publishedItem.value.stableId, rating);
    dueReviewCount.value = (await dueReviews(learningDb)).length;
  } catch { contentLoadError.value = "复习评价未保存，请稍后重试。"; }
}
async function saveEssayNote() {
  const stableId = publishedItem.value?.stableId ?? "prototype-essay";
  try { await savePersonalNote(learningDb, stableId, essayNote.value); noteSaved.value = true; }
  catch { contentLoadError.value = "摘记未保存，请检查浏览器存储权限。"; }
}
async function downloadBackup() {
  try {
    const backup = await exportLearningBackup(learningDb);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `gongkao-backup-${currentLocalDate()}.json`; link.click();
    URL.revokeObjectURL(url);
  } catch { contentLoadError.value = "备份导出失败，请检查浏览器存储权限。"; }
}
async function restoreBackupFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const { backup, preview } = previewLearningRestore(JSON.parse(await file.text()));
    const confirmed = window.confirm(`将整体替换本机学习记录：${preview.attempts} 次作答、${preview.reviews} 张复习卡、${preview.notes} 条笔记。是否继续？`);
    if (!confirmed) return;
    await restoreLearningBackup(learningDb, backup);
    window.location.reload();
  } catch (error) {
    contentLoadError.value = error instanceof Error ? `备份恢复失败：${error.message}` : "备份恢复失败。";
  } finally { input.value = ""; }
}
async function saveMobileMaintenance() {
  try { await saveMobileProvider(mobileProvider.value); mobileProvider.value.apiKey = ""; maintenanceStatus.value = "已安全保存到 Android 加密存储，仅用于手动生成。日常自动更新使用上方的内容同步。"; }
  catch (error) { maintenanceStatus.value = error instanceof Error ? error.message : "保存失败"; }
}
async function testMobileMaintenance() {
  try { maintenanceStatus.value = `连接成功，模型：${(await testMobileProvider(mobileProvider.value)).model}`; }
  catch (error) { maintenanceStatus.value = error instanceof Error ? error.message : "连接失败"; }
}
async function clearMobileMaintenance() {
  try { await clearMobileProvider(); mobileProvider.value.apiKey = ""; maintenanceStatus.value = "已清除手机端 API 配置。"; }
  catch (error) { maintenanceStatus.value = error instanceof Error ? error.message : "清除失败"; }
}
async function runMobileUpdateNow() {
  try { maintenanceStatus.value = `正在读取官方材料，并按时政、常识、成语、申论各生成 3 条；可能需要数分钟，请保持 App 在前台…`; const count = await runMobileUpdate(learningDb); mobileCandidates.value = await learningDb.mobileCandidates.where("status").equals("pending").reverse().sortBy("createdAt"); maintenanceStatus.value = `已生成 ${count} 条待审核候选内容。`; }
  catch (error) { maintenanceStatus.value = error instanceof Error ? error.message : "更新失败"; }
}
async function approveCandidate(id: string) {
  try { await approveMobileCandidate(learningDb, id); mobileCandidates.value = mobileCandidates.value.filter((candidate) => candidate.id !== id); contentItems.value = await learningDb.contentItems.toArray(); maintenanceStatus.value = "已批准并更新学习内容。"; }
  catch (error) { maintenanceStatus.value = error instanceof Error ? error.message : "批准失败"; }
}
async function rejectCandidate(id: string) { await rejectMobileCandidate(learningDb, id); mobileCandidates.value = mobileCandidates.value.filter((candidate) => candidate.id !== id); }

function push(next: Page) {
  history.value.push(page.value);
  page.value = next;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function back() {
  const destination = history.value.pop() ?? "root";
  page.value = destination;
  if ((destination === "province" || destination === "essay-detail") && linkedOrigin.value) {
    publishedItem.value = linkedOrigin.value.item;
    publishedQuestion.value = linkedOrigin.value.question;
    linkedOrigin.value = null;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function openModule(id: string) {
  if (id === "speed") push("speed");
  else if (id === "idiom") push("idiom-list");
  else if (id === "essay") push("essay-list");
  else push("knowledge");
}
function pressKey(key: string) {
  if (key === "删除") speedValue.value = speedValue.value.slice(0, -1);
  else if (key === "清空") speedValue.value = "";
  else if (speedValue.value.length < 8) speedValue.value += key;
}
function beginSpeedTimer() {
  if (speedTimer) clearInterval(speedTimer);
  speedStartedAt = Date.now(); speedTick.value = 0;
  speedTimer = setInterval(() => {
    speedTick.value = Date.now() - speedStartedAt;
    if (speedSession.value?.status === "active" && speedTick.value % 1000 < 300) void learningDb.speedSessions.put({ ...speedSession.value, effectiveMilliseconds: speedSession.value.effectiveMilliseconds + speedTick.value });
  }, 250);
}
async function pauseSpeed() {
  if (!speedSession.value || speedSession.value.status !== "active") return;
  speedSession.value = { ...speedSession.value, effectiveMilliseconds: speedSession.value.effectiveMilliseconds + Math.max(0, Date.now() - speedStartedAt), status: "paused" };
  speedTick.value = 0; if (speedTimer) clearInterval(speedTimer); speedTimer = null;
  await learningDb.speedSessions.put({ ...speedSession.value });
}
async function resumeSpeed() {
  if (!speedSession.value || speedSession.value.status === "completed") return;
  speedSession.value = { ...speedSession.value, status: "active" }; await learningDb.speedSessions.put({ ...speedSession.value }); beginSpeedTimer();
}
async function startSpeedTraining() {
  const mode: SpeedMode = speedType.value === "growth-base" && estimateMode.value ? "estimate" : "exact";
  const seed = crypto.randomUUID();
  speedSession.value = { sessionId: crypto.randomUUID(), trainingType: speedType.value, mode, seed, algorithmVersion: SPEED_ALGORITHM_VERSION, effectiveMilliseconds: 0, status: "active" };
  speedProblems.value = generateSpeedSet(speedType.value, seed, mode); speedAttempts.value = []; speedValue.value = ""; speedMessage.value = "";
  speedSubmitted.value = false;
  beginSpeedTimer(); push("speed-question"); await learningDb.speedSessions.put({ ...speedSession.value });
}
async function recordSpeedAttempt(skipped = false) {
  const problem = currentSpeedProblem.value; const session = speedSession.value;
  if (!problem || !session || session.status !== "active") return;
  const scored = skipped ? { valid: true, correct: false, message: "本题已跳过" } : scoreSpeedInput(problem, speedValue.value);
  if (!scored.valid) { speedMessage.value = scored.message; return; }
  const attempt: SpeedAttempt = { kind: "speed", attemptId: `${session.sessionId}:${problem.id}`, sessionId: session.sessionId, mode: session.mode, prompt: problem.prompt, input: skipped ? "" : speedValue.value, expected: problem.expected, correct: scored.correct, parameters: { ...problem.parameters, explanation: problem.explanation }, algorithmVersion: problem.algorithmVersion, answeredAt: new Date().toISOString() };
  try { await learningDb.attempts.add(attempt); } catch (error) { if (!(error instanceof Error && error.name === "ConstraintError")) throw error; return; }
  speedAttempts.value = [...speedAttempts.value, attempt]; speedMessage.value = scored.message; speedSubmitted.value = true;
  if (speedAttempts.value.length === 10) { await pauseSpeed(); speedSession.value = { ...speedSession.value!, status: "completed" }; await learningDb.speedSessions.put({ ...speedSession.value }); }
}
function nextSpeedProblem() { speedValue.value = ""; speedMessage.value = ""; speedSubmitted.value = false; }
async function restartSpeed() { await startSpeedTraining(); }
async function handleSpeedVisibility() { if (document.hidden) await pauseSpeed(); }
onMounted(() => { document.addEventListener("visibilitychange", handleSpeedVisibility); window.addEventListener("pagehide", pauseSpeed); });
onBeforeUnmount(() => { document.removeEventListener("visibilitychange", handleSpeedVisibility); window.removeEventListener("pagehide", pauseSpeed); });
async function saveMistake() {
  if (!answer.value || !publishedQuestion.value) return;
  try {
    await saveChoiceAttemptOnce(learningDb, { attemptId: currentAttemptId.value, question: publishedQuestion.value, selectedOptionId: answer.value });
    const reason = ({ "知识不熟": "unfamiliar", "易混项混淆": "confused", "审题遗漏": "oversight" } as const)[state.value.mistakeReason as "知识不熟" | "易混项混淆" | "审题遗漏"] ?? "custom";
    await saveMistakeReason(learningDb, { attemptId: currentAttemptId.value, reason, confusedOptionId: answer.value, distinction: state.value.mistakeNote });
    state.value.savedMistake = true;
    state.value.mistakeNote = state.value.mistakeNote.trim();
  } catch { contentLoadError.value = "错因未保存，请检查浏览器存储权限。"; }
}
function goRoot(nextTab: Tab) {
  tab.value = nextTab;
  page.value = "root";
  history.value = [];
}
function adjustFont(next: number) {
  fontScale.value = Math.min(1.15, Math.max(0.9, next));
}
</script>

<template>
  <div class="app-shell" :style="{ fontSize: `${fontScale}rem` }">
    <header v-if="page !== 'root'" class="detail-header">
      <button aria-label="返回" @click="back"><ArrowLeft :size="22" /></button>
      <strong>{{ pageTitle }}</strong><span />
    </header>

    <main v-if="page === 'root'" class="root-content">
      <template v-if="tab === 'learn'">
        <header class="page-heading">
          <div><h1>学习</h1><p>每天做件实在的事，离上岸更近一步</p></div>
          <span>更新于<br />{{ contentUpdatedAt ? contentUpdatedAt.slice(0,10) : '正在读取' }}</span>
        </header>

        <section class="daily-strip" aria-label="今日计划进度">
          <div class="daily-copy"><div><strong>今日计划</strong><span>{{ dailyPlanCompleted }} / {{ dailyPlanTotal }}</span></div><i><b :style="{ width: dailyProgress }" /></i></div>
          <button @click="tab = 'today'">继续今日任务 <ArrowRight /></button>
        </section>

        <div class="search-row">
          <label class="search-box"><MagnifyingGlass /><input v-model="query" aria-label="搜索知识点、题目或关键词" placeholder="搜索知识点、题目、关键词" /></label>
          <button class="filter-button" @click="filterOpen = true"><SlidersHorizontal />筛选</button>
        </div>

        <section class="featured-module">
          <button class="module-heading" @click="openAffairs('national')">
            <span class="module-icon green"><FileText /></span><span class="module-copy"><strong>时政</strong><small>把握时代脉搏，积累重要考点</small></span><em>{{ moduleCount("affairs") }} 条</em><ArrowRight />
          </button>
          <button class="news-row" @click="openAffairs('national')"><MapTrifold /><span><strong>全国时政</strong><small>国家政策与重要会议</small></span><em>{{ moduleCount("affairs") }} 条</em><ArrowRight /></button>
          <div class="archive-row"><span><CalendarDots />按月份浏览</span><button v-for="month in visibleAffairMonths.slice(0,2)" :key="month" @click="openAffairs('national'); affairsMonth=month">{{ month }}</button><button @click="query = '时政'"><MagnifyingGlass />时政搜索</button></div>
        </section>

        <section class="module-list" aria-label="其他学习模块">
          <button v-for="item in visibleModules" :key="item.id" class="module-row" @click="openModule(item.id)">
            <span class="module-icon" :class="item.tone"><component :is="item.icon" /></span><span class="module-copy"><strong>{{ item.name }}</strong><small>{{ item.desc }}</small></span><em>{{ item.count }}</em><ArrowRight />
          </button>
          <div v-if="!visibleModules.length" class="empty-state"><MagnifyingGlass :size="30" /><strong>没有找到相关内容</strong><p>换一个关键词，或重置筛选后再试。</p><button @click="query = ''">重置筛选</button></div>
        </section>
        <footer class="content-status"><Info />{{ contentItems.length }} 条离线内容已就绪<span v-if="contentUpdatedAt"> · 内容更新于 {{ contentUpdatedAt.slice(0, 10) }}</span></footer>
      </template>

      <section v-else-if="tab === 'today'" class="simple-view">
        <span class="simple-icon"><House /></span><p class="eyebrow">今日 · {{ currentLocalDate() }}</p><h1>还差 {{ dailyPlanRemaining }} 项，完成今日计划</h1><p>今日按真实库存安排 {{ dailyPlan?.contentIds.length ?? 0 }} 张卡和 {{ dailyPlan?.questionIds.length ?? 0 }} 道关联题，不重复补齐。</p>
        <button v-if="dueReviewCount" class="task" @click="tab = 'review'"><Clock /><span><strong>先复习到期内容</strong><small>{{ dueReviewCount }} 张今日或逾期</small></span><ArrowRight /></button>
        <button v-if="hasUnfinishedPlan" class="task" @click="tab = 'learn'"><Clock /><span><strong>继续未完任务</strong><small>待完成 {{ dailyPlanRemaining }} 项</small></span><ArrowRight /></button>
        <button v-if="unstartedContentCount" class="task" @click="tab = 'learn'"><BookBookmark /><span><strong>开始新学</strong><small>{{ unstartedContentCount }} 张真实库存卡片</small></span><ArrowRight /></button>
        <div :class="['task',{done:dailyPlanCompleted>0}]"><CheckCircle /><span><strong>今日已完成</strong><small>{{ dailyPlanCompleted }} / {{ dailyPlanTotal }}</small></span></div>
        <section class="stats" aria-label="客观题统计"><div><strong>{{ objectiveAccuracy }}</strong><span>客观题正确率</span></div><div><strong>{{ attemptCount }}</strong><span>作答样本</span></div></section>
        <p v-if="attemptCount === 0" class="hint">尚无客观题作答记录，完成练习后再展示统计；当前不会判断能力强弱。</p>
        <div class="mode-switch" aria-label="字号调整"><button aria-label="缩小字号" @click="adjustFont(fontScale - 0.1)">A−</button><button aria-label="标准字号" @click="fontScale=1">A</button><button aria-label="放大字号" @click="adjustFont(fontScale + 0.1)">A＋</button></div>
      </section>

      <section v-else-if="tab === 'review'" class="simple-view">
        <span class="simple-icon"><Clock /></span><p class="eyebrow">复习</p><h1>今天有 {{ dueReviewCount }} 张卡到期</h1><p>先回忆，再揭示答案。评价“忘了”会安排明日重练。</p>
        <div class="stats"><div><strong>{{ dueReviewCount }}</strong><span>今日及逾期</span></div><div><strong>{{ isInReview ? 1 : 0 }}</strong><span>已加入计划</span></div></div>
        <div v-if="isInReview" class="detail-actions"><button class="secondary" @click="ratePublishedReview('forgot')">忘了</button><button class="primary" @click="ratePublishedReview('remembered')">记得</button></div>
        <button class="primary wide" @click="push('idiom')">开始复习 <ArrowRight /></button>
      </section>

      <section v-else class="simple-view">
        <p v-if="contentLoadError" role="alert" class="hint">{{ contentLoadError }}</p>
        <span class="simple-icon"><UserCircle /></span><p class="eyebrow">我的</p><h1>你的学习记录保存在本机</h1><p>无需账号。建议定期导出备份，避免清理浏览器后丢失记录。</p>
        <section class="card source" aria-label="自动内容更新">
          <h2>自动内容更新</h2><p>内置 100 条基础学习卡。云端每日生成新内容，App 联网打开或恢复前台时自动同步，不需要每天手动生成或批准。</p>
          <label class="automatic-toggle"><input v-model="autoContentEnabled" type="checkbox" :disabled="autoPreferenceBusy" @change="changeAutomaticUpdates" /> 自动同步新内容</label>
          <p class="hint" role="status">{{ contentSyncStatus }}</p>
          <button class="secondary" :disabled="contentSyncBusy" @click="syncContentNow(true)">{{ contentSyncBusy ? '正在检查…' : '检查新内容' }}</button>
          <p class="hint">云端生成需要仓库管理员一次性配置加密 API 密钥并启用。AI 内容经过自动检查，不等于人工审校；练习不是真题，请核对来源。</p>
        </section>
        <button class="setting"><BookmarkSimple />我的收藏 <ArrowRight /></button><button class="setting"><FileText />错题与摘记 <ArrowRight /></button><button class="setting" @click="downloadBackup"><BookBookmark />导出学习备份 <ArrowRight /></button><button class="setting" @click="restoreInput?.click()"><FileText />恢复学习备份 <ArrowRight /></button><button class="setting" @click="maintenanceOpen=!maintenanceOpen"><SlidersHorizontal />高级：手机手动生成 <ArrowRight /></button><input ref="restoreInput" class="visually-hidden" type="file" accept="application/json,.json" @change="restoreBackupFile" />
        <section v-if="maintenanceOpen" class="card source"><h2>高级：手机手动生成</h2><p class="hint">仅限已安装的 Android App。密钥使用系统加密存储，不会进入学习备份或内容包；生成内容必须人工审核后才可学习。</p><label class="note-field">Base URL<input v-model="mobileProvider.baseUrl" inputmode="url" placeholder="https://…/v1" /></label><label class="note-field">模型 ID<input v-model="mobileProvider.model" placeholder="模型名称" /></label><label class="note-field">API 密钥<input v-model="mobileProvider.apiKey" type="password" autocomplete="new-password" placeholder="每次保存需填写" /></label><label class="note-field">超时（毫秒）<input v-model.number="mobileProvider.timeoutMs" type="number" min="1000" max="120000" /></label><label class="note-field"><input v-model="mobileProvider.enabled" type="checkbox" /> 启用手机手动生成</label><div class="detail-actions"><button class="secondary" @click="testMobileMaintenance">连接测试</button><button class="primary" @click="saveMobileMaintenance">安全保存</button><button class="secondary" @click="clearMobileMaintenance">清除配置</button></div><button class="primary wide" @click="runMobileUpdateNow">立即检查并生成候选</button><p v-if="maintenanceStatus" class="hint">{{ maintenanceStatus }}</p><section v-if="mobileCandidates.length" class="card"><h2>待审核内容（{{ mobileCandidates.length }}）</h2><div v-for="candidate in mobileCandidates" :key="candidate.id" class="linked"><span><strong>{{ candidate.payload.item.title }}</strong><small>{{ candidate.payload.item.module }} · {{ candidate.model }} · {{ candidate.createdAt.slice(0,16) }}</small></span><button class="secondary" @click="rejectCandidate(candidate.id)">拒绝</button><button class="primary" @click="approveCandidate(candidate.id)">批准</button></div></section></section>
      </section>
    </main>

    <main v-else-if="page === 'affairs-list'" class="detail-content">
      <div class="kicker"><span>时政</span><span>{{ visibleAffairs.length }} 条可学习内容</span></div><h1>全国时政</h1><p class="lead">按事件发生日归档；来源发布日期和统计期在详情中分别展示。</p>
      <label class="search-box"><MagnifyingGlass /><input v-model="affairsQuery" aria-label="搜索时政标题或关键词" placeholder="搜索标题、关键词、主题" /></label>
      <label class="note-field">按事件日筛选<input v-model="affairsDay" aria-label="时政事件日期" type="date" @input="affairsMonth=''" /></label>
      <div class="mode-switch" aria-label="时政月份归档"><button :class="{active:!affairsMonth&&!affairsDay}" @click="affairsMonth=''; affairsDay=''">全部月份</button><button v-for="month in visibleAffairMonths" :key="month" :class="{active:affairsMonth===month&&!affairsDay}" @click="affairsMonth=month; affairsDay=''">{{ month }}</button></div>
      <section v-if="visibleAffairs.length" class="module-list" aria-label="时政内容列表"><button v-for="item in visibleAffairs" :key="item.stableId" class="module-row" @click="selectAffair(item)"><span class="module-icon green"><CalendarDots /></span><span class="module-copy"><strong>{{ item.title }}</strong><small>{{ item.eventDate === currentLocalDate() ? '今日' : item.eventDate }} · {{ item.topic }}</small></span><ArrowRight /></button></section>
      <div v-else class="empty-state"><MagnifyingGlass :size="30" /><strong>没有匹配的时政内容</strong><p>调整地区、日期或关键词后再试。</p><button @click="affairsQuery=''; affairsDay=''; affairsMonth=''">重置筛选</button></div>
      <footer class="content-status"><Info />内容包最后更新：{{ contentUpdatedAt ? contentUpdatedAt.slice(0, 10) : '尚无发行记录' }}</footer>
    </main>

    <main v-else-if="page === 'affairs-detail'" class="detail-content">
      <template v-if="publishedItem?.module === 'affairs'"><div class="kicker"><span>全国时政</span><span>{{ publishedItem.eventDate === currentLocalDate() ? '今日事件' : `事件日 ${publishedItem.eventDate}` }}</span></div><h1>{{ publishedItem.title }}</h1>
      <section class="card fact-card"><h2>原创摘要</h2><p>{{ publishedItem.summary }}</p><h2>考点</h2><p>{{ publishedItem.examPoints.join('；') }}</p></section>
      <section class="card source"><h2><Info />日期口径与来源</h2><dl><div><dt>事件发生日</dt><dd>{{ publishedItem.eventDate }}</dd></div><div><dt>来源发布日期</dt><dd>{{ publishedItem.sourcePublishedAt }}</dd></div><div><dt>数据统计期</dt><dd>{{ publishedItem.dataPeriod ?? '本条不涉及统计期' }}</dd></div><div><dt>适用起始日</dt><dd>{{ publishedItem.validFrom }}</dd></div><div><dt>适用截止日</dt><dd>{{ publishedItem.validTo ?? '未设截止日' }}</dd></div><div><dt>内容包更新</dt><dd>{{ contentUpdatedAt ? contentUpdatedAt.slice(0, 10) : '尚无发行记录' }}</dd></div></dl><p v-for="source in publishedItem.sourceRefs" :key="source.id"><a :href="source.url" target="_blank" rel="noreferrer">来源原文：{{ source.title }}</a><br />{{ source.publisher }} · 核验于 {{ source.verifiedAt }}</p><p class="hint">原创摘要用于学习，来源原文由外部网站提供；若链接无法打开，请稍后联网重试或按标题访问发布单位官网。</p></section>
      <div class="detail-actions"><button class="secondary" :disabled="isInReview" @click="addPublishedReview">{{ isInReview ? '已加入复习' : '加入复习' }}</button><button class="primary" :disabled="!publishedQuestion" @click="startPublishedQuiz">做关联练习 <ArrowRight /></button></div></template>
    </main>

    <main v-else-if="page === 'knowledge'" class="detail-content">
      <div class="kicker"><span>常识</span><span>{{ knowledgeItems.length }} 条可学习内容</span></div>
      <h1>常识知识库</h1>
      <p class="lead">按标题、关键词或主题查找，草稿和撤回内容不会出现在学习端。</p>
      <label class="search-box"><MagnifyingGlass /><input v-model="knowledgeQuery" aria-label="搜索常识标题或关键词" placeholder="搜索标题、关键词、概念" /></label>
      <div class="mode-switch" aria-label="常识主题筛选">
        <button :class="{active:knowledgeTopic===''}" @click="knowledgeTopic=''">全部</button>
        <button v-for="topic in knowledgeTopics" :key="topic" :class="{active:knowledgeTopic===topic}" @click="knowledgeTopic=topic">{{ topic }}</button>
      </div>
      <section v-if="knowledgeItems.length" class="module-list" aria-label="常识内容列表">
        <button v-for="item in knowledgeItems" :key="item.stableId" class="module-row" @click="selectKnowledge(item)">
          <span class="module-icon amber"><BookBookmark /></span><span class="module-copy"><strong>{{ item.title }}</strong><small>{{ item.topic }} · {{ item.keywords.join('、') }}</small></span><ArrowRight />
        </button>
      </section>
      <div v-else class="empty-state"><MagnifyingGlass :size="30" /><strong>没有匹配的常识内容</strong><p>换一个关键词或清除主题筛选后再试。</p><button @click="knowledgeQuery=''; knowledgeTopic=''">重置筛选</button></div>
    </main>

    <main v-else-if="page === 'province'" class="detail-content">
      <p v-if="contentLoadError" class="hint" role="alert">{{ contentLoadError }}</p>
      <div class="kicker"><span>{{ publishedItem ? '已审核内容' : '重点知识' }}</span><span>{{ publishedItem?.topic ?? '综合知识' }}</span></div><h1>{{ displayedTitle }}</h1><p class="lead">{{ displayedSummary }}</p>
      <section v-if="publishedItem?.module === 'general'" class="card fact-card"><h2>知识点</h2><p><strong>{{ publishedItem.concept }}</strong></p><p>{{ publishedItem.explanation }}</p><p>关键词：{{ publishedItem.keywords.join('、') }}</p></section>
      <section v-else class="card fact-card"><h2>先记住这 3 点</h2><ol><li><b>1</b><div><strong>概念</strong><p>先理解知识点的核心定义与适用范围。</p></div></li><li><b>2</b><div><strong>方法</strong><p>结合例证、关键词和易错点进行记忆。</p></div></li><li><b>3</b><div><strong>转化</strong><p>通过练习把知识转化为稳定的答题能力。</p></div></li></ol></section>
      <section v-if="publishedItem?.module !== 'general'" class="card warning"><h2>易混提醒</h2><strong>不是一次性建设项目</strong><p>它强调长期迭代和系统治理，不能只理解为“美化村庄”。</p></section>
      <section class="card source"><h2><Info />来源与适用期</h2><template v-if="publishedItem"><p v-for="source in publishedItem.sourceRefs" :key="source.id"><a :href="source.url" target="_blank" rel="noreferrer">{{ source.title }}</a> · {{ source.publisher }} · 核验于 {{ source.verifiedAt }}</p><dl><div><dt>来源发布日期</dt><dd>{{ publishedItem.sourcePublishedAt }}</dd></div><div><dt>适用起始日</dt><dd>{{ publishedItem.validFrom }}</dd></div><div><dt>内容修订</dt><dd>r{{ publishedItem.revision }}</dd></div></dl></template><p v-else>新华社专题资料 · 核验于 2026-09-18</p></section>
      <button class="linked" @click="openEssayFromCurrent"><NotePencil /><span><strong>关联申论素材</strong><small>按主题查看观点、案例与规范表达</small></span><ArrowRight /></button>
      <button class="linked" @click="togglePublishedFavorite"><BookmarkSimple /><span><strong>{{ isFavorite ? '已收藏' : '收藏本卡' }}</strong><small>收藏保存在本机</small></span><Check v-if="isFavorite" /></button>
      <div class="detail-actions"><button class="secondary" :disabled="isInReview" @click="addPublishedReview"><Check v-if="isInReview" /><BookmarkSimple v-else />{{ isInReview ? '已加入复习' : '加入复习' }}</button><button class="primary" @click="startPublishedQuiz">去做 {{ publishedQuestion ? 1 : 0 }} 题小测 <ArrowRight /></button></div>
    </main>

    <main v-else-if="page === 'quiz'" class="detail-content quiz-content">
      <div class="progress-label"><span>练习题 · 1 / {{ Math.max(1, dailyPlan?.questionIds.length ?? 0) }}</span><span>{{ publishedQuestion?.module ?? '常识' }}</span></div><div class="progress"><i :style="{width:`${100 / Math.max(1, dailyPlan?.questionIds.length ?? 0)}%`}" /></div><h1>{{ displayedQuestion.prompt }}</h1>
      <div class="answers" role="radiogroup"><button v-for="item in displayedQuestion.options" :key="item.id" :class="['answer',{ selected:answer===item.id, correct:submitted&&item.id===displayedQuestion.correctOptionId, wrong:submitted&&answer===item.id&&item.id!==displayedQuestion.correctOptionId }]" :disabled="submitted" @click="answer=item.id"><b>{{ item.id }}</b><span>{{ item.text }}</span><CheckCircle v-if="submitted&&item.id===displayedQuestion.correctOptionId" /><XCircle v-if="submitted&&answer===item.id&&item.id!==displayedQuestion.correctOptionId" /></button></div>
      <p v-if="!answer && !submitted" class="hint">请选择一个答案后提交。</p><button v-if="!submitted" class="primary wide" :disabled="!answer" @click="submitAnswer">提交答案</button>
      <section v-else :class="['feedback',answer===displayedQuestion.correctOptionId?'success':'error']"><h2>{{ answer===displayedQuestion.correctOptionId ? '回答正确' : `回答错误，正确答案是 ${displayedQuestion.correctOptionId}` }}</h2><p>{{ displayedQuestion.explanation }}</p></section>
      <section v-if="submitted&&answer!==displayedQuestion.correctOptionId" class="card mistake"><h2>这次错在哪里？</h2><div><button v-for="reason in ['知识不熟','易混项混淆','审题遗漏']" :key="reason" :class="{ active:state.mistakeReason===reason }" @click="state.mistakeReason=reason">{{ reason }}</button></div><label>记下一句区别<input v-model="state.mistakeNote" placeholder="例：长期治理，不是一次建设" /></label><button class="secondary wide" @click="saveMistake"><Check v-if="state.savedMistake" /><BookmarkSimple v-else />{{ state.savedMistake ? '错因已保存' : '保存错因' }}</button></section>
      <section v-if="submitted && previousMistakeNote" class="card warning"><h2>上次错因</h2><p>{{ previousMistakeNote }}</p></section>
      <button v-if="submitted" class="primary wide" @click="publishedQuestion?.module === 'idiom' ? back() : push('idiom-list')">{{ publishedQuestion?.module === 'idiom' ? '完成本题并返回' : '下一题：成语辨析' }} <ArrowRight /></button>
    </main>

    <main v-else-if="page === 'idiom-list'" class="detail-content">
      <div class="kicker"><span>成语</span><span>{{ visibleIdiomItems.length }} 条</span></div><h1>成语新学与复习</h1><p class="lead">先回忆，再揭示释义、搭配、原创例句和易混差异。</p>
      <label class="search-box"><MagnifyingGlass /><input v-model="idiomQuery" aria-label="搜索成语或易混词" placeholder="搜索成语、释义或易混词" /></label>
      <div class="mode-switch" aria-label="成语学习模式"><button :class="{active:idiomMode==='new'}" @click="idiomMode='new'">新学</button><button :class="{active:idiomMode==='review'}" @click="idiomMode='review'">复习</button></div>
      <div class="mode-switch" aria-label="成语主题筛选"><button :class="{active:idiomTopic===''}" @click="idiomTopic=''">全部</button><button v-for="topic in availableIdiomTopics" :key="topic" :class="{active:idiomTopic===topic}" @click="idiomTopic=topic">{{ topic }}</button></div>
      <section v-if="visibleIdiomItems.length" class="module-list" aria-label="成语内容列表"><button v-for="item in visibleIdiomItems" :key="item.stableId" class="module-row" @click="selectIdiom(item)"><span class="module-icon violet"><FileText /></span><span class="module-copy"><strong>{{ item.title }}</strong><small>{{ item.topic }} · {{ item.pronunciation }}</small></span><ArrowRight /></button></section>
      <div v-else class="empty-state"><MagnifyingGlass :size="30" /><strong>{{ idiomMode === 'review' ? '暂无复习成语' : '没有匹配的成语' }}</strong><p>调整关键词、主题或学习模式后再试。</p><button @click="idiomQuery=''; idiomTopic=''">重置筛选</button></div>
    </main>

    <main v-else-if="page === 'idiom'" class="detail-content">
      <div class="progress-label"><span>{{ idiomMode === 'review' ? '成语复习' : '成语新学' }}</span><span>{{ publishedItem?.topic ?? '近义辨析' }}</span></div><section class="recall-card"><span>{{ publishedItem?.module === 'idiom' ? publishedItem.pronunciation : 'yú mù hùn zhū' }}</span><h1>{{ publishedItem?.module === 'idiom' ? publishedItem.title : '鱼目混珠' }}</h1><template v-if="!state.idiomRevealed"><p>先在心里说出它的含义和使用对象。</p><button class="primary wide" @click="state.idiomRevealed=true">揭示释义</button></template><div v-else class="revealed"><h2>释义</h2><p>{{ publishedItem?.module === 'idiom' ? publishedItem.definition : '拿鱼眼睛冒充珍珠，比喻以假乱真、以次充好。' }}</p><h2>常见搭配</h2><p>{{ publishedItem?.module === 'idiom' ? publishedItem.collocations.join('、') : '商品、材料、作品等可以被伪劣事物冒充的对象。' }}</p><h2>原创例句</h2><p>{{ publishedItem?.module === 'idiom' ? publishedItem.example : '审核资料时应逐项核验来源，避免未经证实的数据鱼目混珠。' }}</p></div></section>
      <template v-if="state.idiomRevealed"><section v-for="entry in publishedItem?.module === 'idiom' ? publishedItem.confusableWith : [{term:'滥竽充数',difference:'鱼目混珠强调以假充真；滥竽充数强调没有真才实学却混在行家里面。'}]" :key="entry.term" class="card warning"><h2>易混：{{ entry.term }}</h2><p>{{ entry.difference }}</p></section><div class="detail-actions"><button class="secondary" @click="state.idiomRevealed=false">再想一次</button><button class="primary" :disabled="!publishedQuestion" @click="push('quiz')">做一道辨析题 <ArrowRight /></button></div><button class="linked" :disabled="isInReview" @click="addPublishedReview"><BookmarkSimple /><span><strong>{{ isInReview ? '已加入复习' : '加入复习' }}</strong><small>首次安排在次日</small></span><Check v-if="isInReview" /></button></template>
    </main>

    <main v-else-if="page === 'idiom-quiz'" class="detail-content quiz-content"><div class="progress-label"><span>练习题 · 2 / 3</span><span>成语</span></div><h1>商家把普通玻璃说成天然水晶，这种做法更适合用：</h1><div class="answers"><button v-for="item in [['A','鱼目混珠'],['B','滥竽充数'],['C','良莠不齐']]" :key="item[0]" :class="['answer',{selected:idiomAnswer===item[0],correct:idiomSubmitted&&item[0]==='A'}]" :disabled="idiomSubmitted" @click="idiomAnswer=item[0]"><b>{{ item[0] }}</b><span>{{ item[1] }}</span></button></div><button v-if="!idiomSubmitted" class="primary wide" :disabled="!idiomAnswer" @click="idiomSubmitted=true">提交答案</button><template v-else><section :class="['feedback',idiomAnswer==='A'?'success':'error']"><h2>{{ idiomAnswer==='A'?'回答正确':'正确答案是 A' }}</h2><p>题干强调“普通玻璃冒充天然水晶”，核心是以假乱真。</p></section><button class="primary wide" @click="back">完成并返回 <Check /></button></template></main>

    <main v-else-if="page === 'speed'" class="detail-content"><div class="kicker"><span>速算</span><span>确定性规则 · {{ SPEED_ALGORITHM_VERSION }}</span></div><h1>三类基础速算训练</h1><p class="lead">每组 10 题，标准答案由本机规则计算，不调用 AI。</p><div class="mode-switch speed-types" aria-label="速算类型"><button :class="{active:speedType==='two-digit-times-one'}" @click="speedType='two-digit-times-one'">两位数乘一位数</button><button :class="{active:speedType==='fraction-percent'}" @click="speedType='fraction-percent'">分数百分数</button><button :class="{active:speedType==='growth-base'}" @click="speedType='growth-base'">增长与基期</button></div><div v-if="speedType==='growth-base'" class="mode-switch" aria-label="判分模式"><button :class="{active:!estimateMode}" @click="estimateMode=false">精算</button><button :class="{active:estimateMode}" @click="estimateMode=true">估算 ±2%</button></div><section class="card formula"><span>公式卡</span><strong>{{ speedFormula.formula }}</strong><p>{{ speedType === 'growth-base' ? '仅用于正增长场景；精算按 1 位小数，估算边界值计正确。' : speedType === 'fraction-percent' ? '百分数答案输入百分数数值，保留 1 位小数。' : '拆分十位和个位，可以减少心算负担。' }}</p></section><section class="card example"><h2>典型例题</h2><div><span>{{ speedFormula.example }}</span></div></section><section class="rule"><Info /><p><strong>输入与判分</strong><span>键盘支持小数点、分数分隔符、删除和清空；非法输入不会提交，也不会丢失进度。</span></p></section><button v-if="speedSession && speedSession.status==='paused'" class="secondary wide" @click="push('speed-question')">恢复上次训练 <ArrowRight /></button><button class="primary wide" @click="startSpeedTraining">开始新的 10 题训练 <ArrowRight /></button></main>

    <main v-else-if="page === 'speed-question'" class="detail-content speed-question"><template v-if="speedSession && speedSession.status==='paused'"><div class="empty-state"><Clock :size="32" /><strong>训练已暂停</strong><p>后台与关闭期间不计时，点击后继续。</p><button @click="resumeSpeed">继续训练</button></div></template><template v-else-if="speedSession && speedSession.status==='completed'"><div class="kicker"><span>训练完成</span><span>{{ speedTypeLabel }} · {{ speedSession.mode==='estimate'?'估算':'精算' }}</span></div><h1>{{ speedSummary.correct }}/{{ speedSummary.total }} · {{ speedSummary.accuracy }}%</h1><section class="stats"><div><strong>{{ speedSummary.wrong }}</strong><span>答错</span></div><div><strong>{{ speedSummary.skipped }}</strong><span>跳过</span></div></section><p class="hint">平均有效答题时间 {{ (speedSummary.averageMilliseconds/1000).toFixed(1) }} 秒；后台时间未计入。</p><section class="card"><h2>逐题结果</h2><p v-for="(attempt,index) in speedAttempts" :key="attempt.attemptId">{{ index+1 }}. {{ attempt.prompt }} — {{ !attempt.input?'未答':attempt.correct?'正确':'错误' }}（答案 {{ attempt.expected }}）</p></section><button class="primary wide" @click="restartSpeed">再练一组</button></template><template v-else-if="currentSpeedProblem"><div class="progress-label"><span>{{ speedTypeLabel }} · {{ speedAttempts.length+1 }} / 10</span><span>有效用时 {{ speedElapsed }} 秒</span></div><div class="progress"><i :style="{width:`${(speedAttempts.length+1)*10}%`}" /></div><h1>{{ currentSpeedProblem.prompt }}</h1><p class="hint">{{ currentSpeedProblem.inputHint }} <span v-if="currentSpeedProblem.unit">· 单位 {{ currentSpeedProblem.unit }}</span></p><div :class="['number-display',{correct:speedSubmitted&&speedAttempts.at(-1)?.correct,wrong:speedSubmitted&&!speedAttempts.at(-1)?.correct}]"><strong>{{ speedValue||'—' }}</strong><span>{{ currentSpeedProblem.unit }}</span></div><p v-if="speedMessage&&!speedSubmitted" role="alert" class="hint">{{ speedMessage }}</p><section v-if="speedSubmitted" :class="['feedback',speedAttempts.at(-1)?.correct?'success':'error']"><h2>{{ speedMessage }}</h2><p>{{ currentSpeedProblem.explanation }}</p></section><button v-if="speedSubmitted" class="primary wide" @click="nextSpeedProblem">{{ speedAttempts.length===10?'查看结果':'下一题' }} <ArrowRight /></button><div v-else class="keypad"><button v-for="key in ['1','2','3','4','5','6','7','8','9','.','0','/','清空','删除']" :key="key" @click="pressKey(key)">{{ key }}</button><button class="skip" @click="recordSpeedAttempt(true)">跳过</button><button class="submit" :disabled="!speedValue" @click="recordSpeedAttempt(false)">确认答案</button></div></template><div v-else class="empty-state"><strong>没有进行中的训练</strong><button @click="back">返回公式页</button></div></main>

    <main v-else-if="page === 'essay-list'" class="detail-content">
      <div class="kicker"><span>申论积累</span><span>{{ visibleEssays.length }} 篇表达素材</span></div><h1>按主题积累表达素材</h1><p class="lead">来源事实、编辑整理和 AI 表达建议分开呈现；本模块不提供自动评分。</p>
      <label class="search-box"><MagnifyingGlass /><input v-model="essayQuery" aria-label="搜索申论素材" placeholder="搜索主题、观点、案例或场景" /></label>
      <div class="mode-switch" aria-label="申论主题筛选"><button :class="{active:essayTopic===''}" @click="essayTopic=''">全部</button><button v-for="topic in availableEssayTopics" :key="topic" :class="{active:essayTopic===topic}" @click="essayTopic=topic">{{ topic }}</button></div>
      <section v-if="visibleEssays.length" class="module-list" aria-label="申论素材列表"><button v-for="item in visibleEssays" :key="item.stableId" class="module-row" @click="selectEssay(item)"><span class="module-icon rose"><NotePencil /></span><span class="module-copy"><strong>{{ item.title }}</strong><small>{{ item.topic }} · {{ item.scenarios.join('、') }}</small></span><ArrowRight /></button></section>
      <div v-else class="empty-state"><MagnifyingGlass :size="30" /><strong>没有匹配的申论素材</strong><p>调整主题或关键词后再试。</p><button @click="essayQuery=''; essayTopic=''">重置筛选</button></div>
    </main>

    <main v-else-if="page === 'essay-detail'" class="detail-content">
      <template v-if="selectedEssay"><p v-if="contentLoadError" role="alert" class="hint">{{ contentLoadError }}</p><div class="kicker"><span>申论积累</span><span>{{ selectedEssay.topic }}</span><span>共享知识 {{ masteryKey(selectedEssay) }}</span></div><h1>{{ selectedEssay.title }}</h1>
      <section class="card essay-card"><h2>可用观点 · 编辑提炼</h2><p v-for="entry in selectedEssayPresentation?.viewpoints" :key="entry">{{ entry }}</p><p v-if="!selectedEssayPresentation?.viewpoints.length" class="hint">暂未整理观点。</p><h2>来源事实 / 案例</h2><p v-for="entry in selectedEssayPresentation?.facts" :key="entry">{{ entry }}</p><h2>规范表达 · 编辑整理</h2><p v-for="entry in selectedEssayPresentation?.normalizedExpressions" :key="entry">{{ entry }}</p><p v-if="!selectedEssayPresentation?.normalizedExpressions.length" class="hint">暂未补充规范表达。</p><h2>适用场景</h2><p>{{ selectedEssay.scenarios.join('、') || '暂未标注使用场景' }}</p></section>
      <section class="card ai-advice"><h2>AI 表达建议</h2><p class="hint">以下内容是表达建议，不是来源单位署名原话，也不是评分结果。</p><p v-for="entry in selectedEssay.aiSuggestions" :key="entry">{{ entry }}</p><p v-if="!selectedEssay.aiSuggestions.length" class="hint">本条暂无 AI 表达建议。</p></section>
      <section class="card source"><h2><Info />材料来源</h2><p><strong>{{ selectedEssayPresentation?.source.message }}</strong></p><template v-if="selectedEssay.sourceRefs.length"><p v-for="source in selectedEssay.sourceRefs" :key="source.id"><a :href="source.url" target="_blank" rel="noreferrer">来源原文：{{ source.title }}</a><br />{{ source.publisher }} · 发布于 {{ source.publishedAt }} · 核验于 {{ source.verifiedAt }}</p></template><p v-else class="hint">本条内容不能当作官方事实引用，补充来源并审核后方可使用。</p></section>
      <section v-if="linkedTargets.length" class="card"><h2>关联知识</h2><p>以下内容共用知识标识 {{ selectedEssay.knowledgeId }}，只作为一个知识点理解。</p><button v-for="target in linkedTargets" :key="target.stableId" class="linked" :disabled="target.status !== 'available'" @click="openLinkedTarget(target)"><FileText /><span><strong>{{ target.title }}</strong><small>{{ target.status === 'available' ? '可打开' : target.status === 'withdrawn' ? '已撤回，暂不可用' : '对应模块尚未启用' }}</small></span><ArrowRight v-if="target.status === 'available'" /></button></section>
      <label class="note-field">个人摘记 <span>仅保存在本机，不属于官方材料或评分结果</span><textarea v-model="essayNote" aria-label="个人摘记" placeholder="写下你的理解或可复用表达" @input="noteSaved=false" /></label><button class="primary wide" @click="saveEssayNote">{{ noteSaved?'摘记已保存':'保存摘记' }} <Check v-if="noteSaved" /></button>
      <button class="linked" @click="togglePublishedFavorite"><BookmarkSimple /><span><strong>{{ isFavorite ? '已收藏' : '收藏本素材' }}</strong><small>收藏保存在本机</small></span><Check v-if="isFavorite" /></button><button class="linked" :disabled="isInReview" @click="addPublishedReview"><Clock /><span><strong>{{ isInReview ? '已加入复习' : '加入复习' }}</strong><small>首次安排在次日</small></span><Check v-if="isInReview" /></button></template>
    </main>

    <main v-else class="detail-content"><div class="empty-state"><strong>页面暂不可用</strong><button @click="goRoot('learn')">返回学习页</button></div></main>

    <nav v-if="page === 'root'" class="bottom-nav" aria-label="主导航"><button :class="{active:tab==='today'}" @click="goRoot('today')"><House />今日</button><button :class="{active:tab==='learn'}" @click="goRoot('learn')"><BookBookmark />学习</button><button :class="{active:tab==='review'}" @click="goRoot('review')"><Clock />复习</button><button :class="{active:tab==='profile'}" @click="goRoot('profile')"><UserCircle />我的</button></nav>

    <div v-if="filterOpen" class="sheet-backdrop" @click.self="filterOpen=false"><section class="filter-sheet"><i /><h2>筛选学习内容</h2><p>按主题快速收窄当前学习列表</p><div><button v-for="item in ['全部主题','本月更新','已收藏']" :key="item" :class="{active:selectedFilter===item}" @click="selectedFilter=item">{{ item }}<CheckCircle v-if="selectedFilter===item" /></button></div><button class="primary wide" @click="filterOpen=false">查看筛选结果</button></section></div>
  </div>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.ai-advice {
  border-color: #ded9ec;
  background: #fcfaff;
}
.ai-advice h2 { color: #655084; }
.ai-advice p { font-size: 12px; line-height: 1.65; }
.speed-types { grid-template-columns: repeat(3, 1fr); }
.speed-types button { padding: 4px; font-size: 11px; }
.keypad .skip { grid-column: span 1; color: #6b756f; }
</style>
