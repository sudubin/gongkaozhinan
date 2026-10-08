import test from "node:test";
import assert from "node:assert/strict";
import { validateContentPackage, canonicalJson } from "@gongkao/contracts";
import { createHash } from "node:crypto";
import { seedEntries, SEED_DATE } from "../data/seed.mjs";
import { contentKey, createPackage, mergeEntries } from "./content-package.mjs";
import { articleLinks, extractSource, isAllowedSource, localDay, normalizeGenerated, runUpdate } from "./update-content.mjs";

const seed = seedEntries();
const initial = () => createPackage(seed.items, seed.questions, "seed-v1-100", SEED_DATE);
const source = { id: "source-1", title: "示例官方报道", url: "https://www.stats.gov.cn/sj/zxfb/202610/t20261008_1234567.html", publisher: "国家统计局", publishedAt: SEED_DATE, verifiedAt: SEED_DATE, rightsNote: "测试", body: "示例材料显示经济发展持续向好，统计口径需要保持一致。" };
const question = { prompt: "本条材料说明什么？", options: [{ id: "A", text: "统计口径须一致" }, { id: "B", text: "统计口径可任意改" }, { id: "C", text: "没有统计期" }, { id: "D", text: "不要核对数据" }], correctOptionId: "A", explanation: "比较前需核对口径。" };
function generated(module, index = 1) {
  const item = { title: `测试${module}新卡-${index}`, topic: "测试", keywords: ["统计"], sourceIds: [source.id], evidenceExcerpt: "统计口径需要保持一致" };
  Object.assign(item, { affairs: { eventDate: SEED_DATE, summary: "口径需要一致。", examPoints: ["统计口径"] }, general: { concept: "口径", explanation: "口径需要一致。" }, idiom: { pronunciation: "shí shì qiú shì", definition: "从实际出发。", collocations: ["实事求是"], example: "分析需要实事求是。", confusableWith: [{ term: "主观臆断", difference: "不能凭空判断。" }] }, essay: { facts: ["写作逻辑"], expressions: ["判断要建立在事实之上。"], scenarios: ["调查研究"], aiSuggestions: ["结合材料改写。"] } }[module]);
  return { item, questions: module === "essay" ? [] : [structuredClone(question)] };
}
test("100 initial cards, 25 per module, 75 practice questions", () => {
  assert.equal(seed.items.length, 100); assert.equal(seed.questions.length, 75);
  for (const module of ["affairs", "general", "idiom", "essay"]) assert.equal(seed.items.filter(item => item.module === module).length, 25);
  assert.equal(validateContentPackage(initial()).ok, true);
  assert.equal(new Set(seed.items.map(contentKey)).size, 100);
  assert.ok(seed.items.every(item => item.region !== "zhejiang"));
  assert.ok(seed.questions.every(q => q.label === "practice" && q.generatedByAi && q.options.some(o => o.id === q.correctOptionId)));
});
test("hash covers canonical payload", () => {
  const { contentHash, ...payload } = initial();
  assert.equal(contentHash, `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`);
});
test("historical affairs preserve report and publication dates", () => {
  for (const item of seed.items.filter(item => item.module === "affairs")) { assert.equal(item.eventDate, "2026-03-05"); assert.equal(item.sourcePublishedAt, "2026-03-13"); }
});
test("same content from different batches/days is deduplicated", () => {
  const entry = normalizeGenerated({ entries: [generated("general")] }, "general", [source], SEED_DATE, "test-model", 5);
  const next = mergeEntries(initial(), entry); assert.equal(next.added, 1);
  const repeated = normalizeGenerated({ entries: [generated("general")] }, "general", [source], "2026-10-09", "test-model", 5);
  assert.equal(repeated[0].item.stableId, entry[0].item.stableId);
  assert.equal(mergeEntries(next, repeated).added, 0);
});
test("whitelist excludes regional and attacker URLs", () => {
  assert.ok(isAllowedSource(source.url));
  for (const url of ["https://www.gov.cn.evil.example/a", "https://zj.gov.cn/a", "http://www.gov.cn/a", "https://user:pass@www.gov.cn/a"]) assert.equal(isAllowedSource(url), false);
});
test("parse article links, not navigation or external URLs", () => {
  assert.deepEqual(articleLinks('<a href="./202610/t20261008_1234567.html">news</a><a href="/">home</a><a href="https://evil.example/t20261008_1.html">x</a>', "https://www.stats.gov.cn/sj/zxfb/"), [source.url]);
});
test("extract body and reject old/future sources", () => {
  const html = `<title>新闻</title><meta name="PubDate" content="2026-10-08"><!--TRS_Editor--><p>${"可核对的正文。".repeat(30)}</p><!--/TRS_Editor-->`;
  assert.equal(extractSource(html, source.url, SEED_DATE).publishedAt, SEED_DATE);
  assert.throws(() => extractSource(html, source.url, "2026-09-08"), /source_not_recent/);
  assert.throws(() => extractSource(html, source.url, "2026-12-08"), /source_not_recent/);
});
test("local day uses Shanghai, not UTC", () => assert.equal(localDay(new Date("2026-10-07T23:30:00Z")), SEED_DATE));
test("model IDs, metadata and fake source URLs cannot override trusted fields", () => {
  const entry = generated("general"); Object.assign(entry.item, { stableId: "seed-v1-general-001", revision: 99, sourceRefs: [{ url: "https://evil.example" }] });
  const result = normalizeGenerated({ entries: [entry] }, "general", [source], SEED_DATE, "test-model", 5)[0];
  assert.match(result.item.stableId, /^auto-general-/); assert.equal(result.item.revision, 1); assert.equal(result.item.sourceRefs[0].url, source.url);
});
for (const [name, change] of [
  ["unknown source", e => { e.item.sourceIds = ["fabricated"]; }],
  ["missing evidence", e => { e.item.evidenceExcerpt = "原文没有的数字"; }],
  ["regional content", e => { e.item.region = "zhejiang"; }],
  ["empty options", e => { e.questions[0].options[0].text = ""; }],
  ["duplicate options", e => { e.questions[0].options[0].id = "B"; }],
  ["fake exam claim", e => { e.questions[0].label = "verified-exam"; }],
]) test(`reject ${name}`, () => { const entry = generated("general"); change(entry); assert.throws(() => normalizeGenerated({ entries: [entry] }, "general", [source], SEED_DATE, "test-model", 5)); });
test("reject future event dates and excess entries", () => {
  const entry = generated("affairs"); entry.item.eventDate = "2030-01-01";
  assert.throws(() => normalizeGenerated({ entries: [entry] }, "affairs", [source], SEED_DATE, "test-model", 5));
  assert.throws(() => normalizeGenerated({ entries: [generated("general"), generated("general", 2)] }, "general", [source], SEED_DATE, "test-model", 1));
});

function memoryStore() {
  const files = new Map([["latest.json", JSON.stringify(initial())], ["generation-state.json", JSON.stringify({ date: "", counts: {}, attempts: {}, totalAdded: 0 })]]);
  const name = url => new URL(url).pathname.split("/").at(-1);
  return { files, read: async url => { const value = files.get(name(url)); if (!value) throw new Error("missing"); return value; }, write: async (url, content) => { files.set(name(url), content); }, move: async (from, to) => { files.set(name(to), files.get(name(from))); files.delete(name(from)); } };
}
const config = { baseUrl: "https://provider.example/v1", apiKey: "test-key-not-real", model: "test-model", dailyPerModule: 1 };
const fakeProvider = async (url, request) => {
  const text = JSON.parse(request.body).messages[1].content;
  const module = /生成 (\w+) 模块/.exec(text)[1];
  return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ entries: [generated(module)] }) } }] }) };
};
test("update saves batches and a repeat run incurs no API calls", async () => {
  const store = memoryStore(); const result = await runUpdate({ ...store, config, today: SEED_DATE, sources: [source], fetcher: fakeProvider });
  assert.equal(result.added, 4); assert.equal(result.failures.length, 0); assert.equal(JSON.parse(store.files.get("latest.json")).items.length, 104);
  const repeated = await runUpdate({ ...store, config, today: SEED_DATE, fetcher: () => { throw new Error("must not call API"); } });
  assert.equal(repeated.alreadyComplete, true);
});
test("one failed module does not discard other completed batches", async () => {
  const store = memoryStore();
  const result = await runUpdate({ ...store, config, today: SEED_DATE, sources: [source], fetcher: (url, request) => JSON.parse(request.body).messages[1].content.includes("生成 affairs 模块") ? Promise.resolve({ ok: false, status: 503 }) : fakeProvider(url, request) });
  assert.equal(result.added, 3); assert.equal(JSON.parse(store.files.get("latest.json")).items.length, 103);
  assert.equal(JSON.parse(store.files.get("generation-state.json")).attempts.affairs, 3);
});
test("truncated response never replaces valid feed", async () => {
  const store = memoryStore(); const old = store.files.get("latest.json");
  const result = await runUpdate({ ...store, config, today: SEED_DATE, sources: [source], fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }) }) });
  assert.equal(result.added, 0); assert.equal(store.files.get("latest.json"), old);
});
test("invalid config is rejected before paid API or file reads", async () => {
  await assert.rejects(() => runUpdate({ config: { ...config, baseUrl: "http://provider.example" }, read: () => { throw new Error("must not read"); } }), /missing_provider_configuration/);
});
