import test from "node:test";
import assert from "node:assert/strict";
import { validateContentPackage, canonicalJson } from "@gongkao/contracts";
import { createHash } from "node:crypto";
import { seedEntries, SEED_DATE } from "../data/seed.mjs";
import { contentKey, createPackage, mergeEntries } from "./content-package.mjs";
import { articleLinks, collectSources, evidenceChoices, extractSource, governmentArticleLinks, isAllowedSource, localDay, normalizeGenerated, providerRequestOptions, runUpdate, safeFailureCode } from "./update-content.mjs";

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
const policyUrl = "https://www.gov.cn/zhengce/content/202610/content_7082737.htm";
const sourceHtml = (heading = "<h1>官方报道标题</h1>", date = SEED_DATE) => `<title>静态新闻标题</title>${heading}<meta name="PubDate" content="${date}"><!--TRS_Editor--><p>${"可核对的正文。".repeat(30)}</p><!--/TRS_Editor-->`;
const textResponse = (url, text) => ({ ok: true, status: 200, url, text: async () => text });
test("script-only and whitespace headings fall back to static title without executing scripts", () => {
  for (const heading of ["<h1><script>throw new Error('must not execute');</script></h1>", "<h1> \n </h1>"]) {
    const parsed = extractSource(sourceHtml(heading), source.url, SEED_DATE);
    assert.equal(parsed.title, "静态新闻标题"); assert.equal(parsed.publishedAt, SEED_DATE);
  }
  assert.equal(extractSource(sourceHtml(), source.url, SEED_DATE).title, "官方报道标题");
});
test("government dynamic JSON list accepts policy articles, not footer or attacker links", () => {
  const urls = [policyUrl, policyUrl, "https://www.gov.cn/home/2023-03/29/content_5748953.htm", "https://www.gov.cn.evil.example/zhengce/content/202610/content_1.htm", "https://zj.gov.cn/zhengce/content_1.htm", "http://www.gov.cn/zhengce/content_1.htm", source.url, null];
  assert.deepEqual(governmentArticleLinks(JSON.stringify(urls.map(URL => ({ URL }))), "https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json"), [policyUrl]);
  assert.deepEqual(articleLinks(`<a href="/home/2023-03/29/content_5748953.htm">footer</a><a href="${policyUrl}">policy</a>`, "https://www.gov.cn/zhengce/zuixin/"), [policyUrl]);
  for (const text of ["bad json", "{}", "null"]) assert.throws(() => governmentArticleLinks(text, "https://www.gov.cn/"), /source_index_invalid_json/);
});
test("source collection reads both publishers and fetches article bodies without API credentials", async () => {
  const checks = []; const requested = [];
  const sources = await collectSources(SEED_DATE, async (url, request) => {
    requested.push(url); assert.equal(request.headers.authorization, undefined);
    if (url === "https://www.stats.gov.cn/sj/zxfb/") return textResponse(url, `<a href="${source.url}">article</a>`);
    if (url.endsWith("ZUIXINZHENGCE.json")) return textResponse(url, JSON.stringify([{ URL: policyUrl }]));
    if (url === source.url) return textResponse(url, sourceHtml("<h1><script>document.write('动态标题');</script></h1>"));
    if (url === policyUrl) return textResponse(url, sourceHtml());
    throw new Error("unexpected_request");
  }, check => checks.push(check));
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map(x => x.publisher), ["国家统计局", "中国政府网"]);
  assert.ok(sources.every(x => x.body.length >= 150 && x.publishedAt === SEED_DATE));
  assert.ok(requested.includes("https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json"));
  assert.equal(checks.filter(x => x.stage === "index" && x.links === 1).length, 2);
});
test("one unavailable source index does not discard another publisher", async () => {
  const checks = [];
  const sources = await collectSources(SEED_DATE, async url => {
    if (url === "https://www.stats.gov.cn/sj/zxfb/") return { ok: false, status: 403 };
    if (url.endsWith("ZUIXINZHENGCE.json")) return textResponse(url, JSON.stringify([{ URL: policyUrl }]));
    return textResponse(url, sourceHtml());
  }, check => checks.push(check));
  assert.equal(sources.length, 1); assert.equal(sources[0].url, policyUrl);
  assert.ok(checks.some(x => x.code === "source_http_403"));
});
test("source failure diagnostics never echo arbitrary errors or credentials", async () => {
  const checks = []; const secret = "test_secret_do_not_log";
  await assert.rejects(() => collectSources(SEED_DATE, async () => { throw new Error(secret); }, check => checks.push(check)), /no_recent_official_sources/);
  assert.ok(checks.every(x => x.code === "source_fetch_failed"));
  assert.ok(!JSON.stringify(checks).includes(secret));
  assert.equal(safeFailureCode(new Error(secret)), "update_failed");
  assert.equal(safeFailureCode(new Error("provider_http_401")), "provider_http_401");
  assert.equal(safeFailureCode(new Error("no_recent_official_sources")), "no_recent_official_sources");
});
test("old and future articles are still rejected after dynamic-index parsing", async () => {
  const checks = [];
  await assert.rejects(() => collectSources(SEED_DATE, async url => {
    if (url === "https://www.stats.gov.cn/sj/zxfb/") return textResponse(url, `<a href="${source.url}">article</a>`);
    if (url.endsWith("ZUIXINZHENGCE.json")) return textResponse(url, JSON.stringify([{ URL: policyUrl }]));
    return textResponse(url, sourceHtml(undefined, url === source.url ? "2026-07-01" : "2030-01-01"));
  }, check => checks.push(check)), /no_recent_official_sources/);
  assert.equal(checks.filter(x => x.code === "source_not_recent").length, 2);
});
test("local day uses Shanghai, not UTC", () => assert.equal(localDay(new Date("2026-10-07T23:30:00Z")), SEED_DATE));
test("model IDs, metadata and fake source URLs cannot override trusted fields", () => {
  const entry = generated("general"); Object.assign(entry.item, { stableId: "seed-v1-general-001", revision: 99, sourceRefs: [{ url: "https://evil.example" }] });
  const result = normalizeGenerated({ entries: [entry] }, "general", [source], SEED_DATE, "test-model", 5)[0];
  assert.match(result.item.stableId, /^auto-general-/); assert.equal(result.item.revision, 1); assert.equal(result.item.sourceRefs[0].url, source.url);
});
test("evidence choices are short exact source substrings with unique IDs", () => {
  const longSource = { ...source, id: "long-source", body: `${"事实材料".repeat(50)}。下一句材料。` };
  const choices = evidenceChoices([longSource, source]);
  assert.equal(new Set(choices.map(x => x.id)).size, choices.length);
  for (const choice of choices) {
    assert.ok(choice.text.length > 0 && choice.text.length <= 64);
    assert.ok([longSource, source].find(s => s.id === choice.sourceId).body.includes(choice.text));
  }
});
test("valid evidence ID stores the original quote, never model-written evidence", () => {
  const entry = generated("general"); const choice = evidenceChoices([source])[0];
  entry.item.evidenceId = choice.id; entry.item.evidenceExcerpt = "模型改写的内容不得保存";
  const normalized = normalizeGenerated({ entries: [entry] }, "general", [source], SEED_DATE, "test-model", 5)[0].item;
  assert.equal(normalized.sourceRefs[0].evidenceExcerpt, choice.text);
  assert.ok(source.body.includes(normalized.sourceRefs[0].evidenceExcerpt));
  assert.equal(Object.hasOwn(normalized, "evidenceId"), false);
});
test("invented evidence IDs and evidence from an unreferenced source are rejected", () => {
  const entry = generated("general"); entry.item.evidenceId = "invented";
  assert.throws(() => normalizeGenerated({ entries: [entry] }, "general", [source], SEED_DATE, "test-model", 5), /invalid_evidence_id/);
  const otherSource = { ...source, id: "source-2", url: policyUrl, body: "第二份独立材料的事实。" };
  entry.item.evidenceId = evidenceChoices([source, otherSource]).find(x => x.sourceId === otherSource.id).id;
  assert.throws(() => normalizeGenerated({ entries: [entry] }, "general", [source, otherSource], SEED_DATE, "test-model", 5), /evidence_source_mismatch/);
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
test("Bailian Qwen3.7 Flash uses non-thinking JSON output", () => {
  for (const model of ["qwen3.7-flash", "qwen3.7-flash-2026-07-15"]) {
    for (const baseUrl of ["https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1"]) {
      assert.deepEqual(providerRequestOptions({ baseUrl, model }), { enable_thinking: false, response_format: { type: "json_object" } });
    }
  }
});
test("Bailian extensions are not sent to other hosts or models", () => {
  for (const baseUrl of ["https://provider.example/v1", "https://dashscope.aliyuncs.com.evil.example/v1", "https://ws-example.cn-beijing.maas.aliyuncs.com.evil.example/v1"]) {
    assert.deepEqual(providerRequestOptions({ baseUrl, model: "qwen3.7-flash" }), {});
  }
  assert.deepEqual(providerRequestOptions({ baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "other-model" }), {});
});
const fakeProvider = async (url, request) => {
  const text = JSON.parse(request.body).messages[1].content;
  const module = /生成 (\w+) 模块/.exec(text)[1];
  return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ entries: [generated(module)] }) } }] }) };
};
test("Bailian update actually sends JSON options and preserves validation", async () => {
  const store = memoryStore(); let calls = 0;
  const baseUrl = "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
  const result = await runUpdate({ ...store, config: { ...config, baseUrl, model: "qwen3.7-flash" }, today: SEED_DATE, sources: [source], fetcher: async (url, request) => {
    calls++;
    assert.equal(url, `${baseUrl}/chat/completions`);
    const body = JSON.parse(request.body);
    assert.equal(body.model, "qwen3.7-flash"); assert.equal(body.enable_thinking, false);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.ok(body.messages.some(message => /JSON/i.test(message.content)));
    assert.equal(body.max_tokens, 8000);
    return fakeProvider(url, request);
  } });
  assert.equal(calls, 4); assert.equal(result.added, 4); assert.equal(result.failures.length, 0);
  assert.equal(validateContentPackage(JSON.parse(store.files.get("latest.json"))).ok, true);
});
test("actual requests use module-specific typed templates, essay has no questions, factual cards select trusted evidence IDs", async () => {
  const store = memoryStore(); let calls = 0;
  const result = await runUpdate({ ...store, config, today: SEED_DATE, sources: [source], fetcher: async (url, request) => {
    calls++;
    const text = JSON.parse(request.body).messages[1].content;
    const module = /生成 (\w+) 模块/.exec(text)[1];
    const template = JSON.parse(text.match(/OUTPUT_SCHEMA_BEGIN\n([\s\S]*?)\nOUTPUT_SCHEMA_END/)[1]).entries[0];
    const data = JSON.parse(text.match(/SOURCE_BEGIN[^\n]*\n([\s\S]*?)\nSOURCE_END/)[1]);
    assert.equal(template.questions.length, module === "essay" ? 0 : 1);
    if (module === "essay") for (const field of ["facts", "expressions", "scenarios", "aiSuggestions"]) assert.ok(Array.isArray(template.item[field]) && template.item[field].every(x => typeof x === "string"));
    const entry = generated(module);
    if (["affairs", "general"].includes(module)) {
      assert.equal(template.item.evidenceId, "E1"); assert.equal(data.evidenceChoices[0].sourceId, source.id);
      entry.item.evidenceId = data.evidenceChoices[0].id; delete entry.item.evidenceExcerpt;
    } else assert.equal(data.evidenceChoices.length, 0);
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ entries: [entry] }) } }] }) };
  } });
  assert.equal(calls, 4); assert.equal(result.added, 4); assert.equal(result.failures.length, 0);
  assert.equal(validateContentPackage(JSON.parse(store.files.get("latest.json"))).ok, true);
});
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
  await assert.rejects(() => runUpdate({ config: { ...config, baseUrl: "" }, read: () => { throw new Error("must not read"); } }), /missing_provider_configuration/);
});
test("no usable official sources leaves existing content and attempt counts untouched, with no paid call", async () => {
  const store = memoryStore(); const oldContent = store.files.get("latest.json"); const oldState = store.files.get("generation-state.json"); let paidCalls = 0;
  await assert.rejects(() => runUpdate({ ...store, config, today: SEED_DATE, fetcher: async url => {
    if (url.endsWith("/chat/completions")) { paidCalls++; throw new Error("must not call paid API"); }
    return { ok: false, status: 503 };
  } }), /no_recent_official_sources/);
  assert.equal(paidCalls, 0); assert.equal(store.files.get("latest.json"), oldContent); assert.equal(store.files.get("generation-state.json"), oldState);
});
