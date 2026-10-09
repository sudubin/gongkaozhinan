import test from "node:test";
import assert from "node:assert/strict";
import { fullSeedEntries, FULL_SEED_DATE as today } from "../../data/full-seed.mjs";
import { createPackage, mergeEntries, verifiedPackage } from "./content-package.mjs";
import { bootstrapFullContent } from "./bootstrap-content.mjs";
import { gitCheckpoint } from "./git-checkpoint.mjs";
import { articleLinks, collectSources, extractSource, isAllowedSource, localDay, zhejiangListRequest } from "./official-sources.mjs";
import { contentPaths, evidenceChoices, JOBS, normalizeGenerated, providerRequestOptions, runUpdate, safeFailureCode } from "./update-content.mjs";
import { publicationConfig, publishContent } from "./publish-content.mjs";

const seed = fullSeedEntries();
const initial = () => createPackage(seed.items, seed.questions, "full-seed-v1", today);
const national = { id: "national", title: "官方报道", url: "https://www.gov.cn/zhengce/202610/content_1234567.htm", publisher: "中国政府网", publishedAt: today, verifiedAt: today, rightsNote: "测试", body: "示例材料显示治理需要坚持责任明确、及时反馈和闭环解决。" };
const regional = { ...national, id: "regional", url: "https://www.zj.gov.cn/col/col1554467/art/2026/art_0123456789abcdef0123456789abcdef.html", publisher: "浙江省人民政府" };
const question = { prompt: "依据材料，哪项理解正确？", options: [{ id: "A", text: "明确责任" }, { id: "B", text: "不落实" }, { id: "C", text: "不反馈" }, { id: "D", text: "不协同" }], correctOptionId: "A", explanation: "应明确责任并形成闭环。" };
function generated(module, source, index = 1) {
  return { item: { title: `测试${module}-${source.id}-${index}`, topic: "治理", keywords: ["责任"], sourceIds: [source.id], evidenceId: "E1", ...{
    affairs: { eventDate: today, summary: "责任明确。", examPoints: ["治理"] },
    general: { concept: "责任", explanation: "责任明确。" },
    idiom: { pronunciation: "shí shì qiú shì", definition: "依据事实。", collocations: ["实事求是"], example: "分析要实事求是。", confusableWith: [{ term: "主观臆断", difference: "是否依据事实。" }] },
    essay: { facts: ["论证逻辑"], expressions: ["落实责任，形成闭环。"], scenarios: ["治理"], aiSuggestions: ["结合材料改写。"] },
    zhejiang: { category: "governance-livelihood", keyPoint: "浙江治理责任明确。", confusions: ["发现不等于解决。"] },
  }[module] }, questions: module === "essay" ? [] : [structuredClone(question)] };
}
const config = { baseUrl: "https://provider.example/v1", apiKey: "test-key-not-real", model: "test-model", dailyPerModule: 1 };
function memoryStore() {
  const files = new Map([["latest.json", JSON.stringify(initial())], ["generation-state.json", JSON.stringify({ date: "", counts: {}, attempts: {}, totalAdded: 0 })]]);
  const name = url => new URL(url).pathname.split("/").at(-1);
  return { files, read: async url => { const value = files.get(name(url)); if (!value) throw new Error("missing"); return value; }, write: async (url, content) => { files.set(name(url), content); }, move: async (from, to) => { files.set(name(to), files.get(name(from))); files.delete(name(from)); } };
}
const fakeProvider = async (url, request) => {
  const text = JSON.parse(request.body).messages[1].content;
  const module = /生成 (\w+) 模块/.exec(text)[1];
  const materials = JSON.parse(text.match(/SOURCE_BEGIN[^\n]*\n([\s\S]*?)\nSOURCE_END/)[1]);
  return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ entries: [generated(module, materials.sources[0])] }) } }] }) };
};
const run = (store, extra = {}) => runUpdate({ ...store, config, today, sources: [national, regional], fetcher: fakeProvider, ...extra });

test("full seed includes 106 cards, 81 questions and both Zhejiang sections", () => {
  assert.equal(seed.items.length, 106); assert.equal(seed.questions.length, 81);
  assert.equal(seed.items.filter(x => x.module === "zhejiang").length, 3);
  assert.equal(seed.items.filter(x => x.module === "affairs" && x.region === "zhejiang").length, 3);
  assert.equal(new Set(seed.items.map(x => x.stableId)).size, 106);
  assert.ok(initial().contentHash.startsWith("sha256:"));
  for (const item of seed.items.filter(x => x.region === "zhejiang")) assert.equal(item.sourceRefs[0].publisher, "浙江省人民政府");
});
test("full generator has six independently budgeted targets and Shanghai date", () => {
  assert.equal(JOBS.length, 6); assert.equal(new Set(JOBS.map(x => x.key)).size, 6);
  assert.equal(localDay(new Date("2026-10-08T23:30:00Z")), today);
});
test("official host whitelist rejects attackers, credentials and HTTP", () => {
  for (const url of [national.url, regional.url]) assert.ok(isAllowedSource(url));
  for (const url of ["bad", "http://www.zj.gov.cn/", "https://www.zj.gov.cn.evil.example/", "https://user:pass@www.zj.gov.cn/", "https://evil.example/"]) assert.equal(isAllowedSource(url), false);
});
const loader = `<script url="/api-gateway/jpaas-publish-server/front/page/build/unit" queryData="{'parseType':'bulidstatic','webId':'3096','tplSetId':'public-template','pageType':'column','tagId':'当前栏目list','editType':'null','pageId':'1554467'}"></script>`;
test("Zhejiang public loader is read as data without executing JavaScript", () => {
  const url = new URL(zhejiangListRequest(loader, "https://www.zj.gov.cn/col/col1554467/index.html"));
  assert.equal(url.hostname, "www.zj.gov.cn"); assert.equal(url.searchParams.get("pageId"), "1554467");
  assert.throws(() => zhejiangListRequest(loader.replace('url="/', 'url="https://evil.example/'), regional.url), /source_not_allowed/);
  assert.deepEqual(articleLinks(`<a href="${regional.url}">新闻</a><a href="https://evil.example/col/col1554467/art/2026/art_0123456789abcdef0123456789abcdef.html">假新闻</a>`, regional.url), [regional.url]);
});
const body = "可核对的治理事实，需要落实责任。".repeat(20);
const sourceHtml = `<meta content="${today}" name="PubDate"><meta name="ArticleTitle" content="正式标题"><div id="zoom"><p>${body}</p><div><p>嵌套内容</p></div><script>必须忽略</script></div><footer>页脚不能作为正文</footer>`;
test("Zhejiang body preserves nested paragraphs and excludes footer/scripts", () => {
  const parsed = extractSource(sourceHtml, regional.url, today);
  assert.equal(parsed.scope, "zhejiang"); assert.equal(parsed.title, "正式标题");
  assert.ok(parsed.body.includes("嵌套内容")); assert.ok(!parsed.body.includes("页脚")); assert.ok(!parsed.body.includes("必须忽略"));
  assert.throws(() => extractSource(sourceHtml, regional.url, "2026-12-01"), /source_not_recent/);
  assert.throws(() => extractSource(sourceHtml, regional.url, "2026-10-01"), /source_not_recent/);
});
test("dynamic Zhejiang list and article fetches never receive provider credentials", async () => {
  const sources = await collectSources(today, async (url, request) => {
    assert.equal(request.headers.authorization, undefined);
    if (url === "https://www.zj.gov.cn/col/col1554467/index.html") return { ok: true, url, text: async () => loader };
    if (url.includes("/api-gateway/")) return { ok: true, url, text: async () => JSON.stringify({ success: true, data: { html: `<a href="${regional.url}">新闻</a>` } }) };
    if (url === regional.url) return { ok: true, url, text: async () => sourceHtml };
    return { ok: false, status: 503 };
  });
  assert.equal(sources.length, 1); assert.equal(sources[0].scope, "zhejiang");
});
test("static Zhejiang index needs no dynamic loader and safe failures disclose no payload", async () => {
  const checks = [];
  const sources = await collectSources(today, async (url) => {
    if (url === "https://www.zj.gov.cn/col/col1554467/index.html") return { ok: true, url, text: async () => `<a href="${regional.url}">新闻</a>` };
    if (url === regional.url) return { ok: true, url, text: async () => sourceHtml };
    throw Error("private-response-do-not-log");
  }, value => checks.push(value));
  assert.equal(sources[0].scope, "zhejiang");
  assert.ok(checks.some(value => value.code === "source_fetch_failed"));
  assert.ok(!JSON.stringify(checks).includes("private-response"));
});
test("regional normalization trusts evidence and strips fake exam metadata", () => {
  for (const module of ["affairs", "zhejiang"]) {
    const entry = generated(module, regional); entry.item.examEvidence = [{ eventKey: "fake" }]; entry.item.editorRecommended = true;
    const normalized = normalizeGenerated({ entries: [entry] }, module, [regional], today, "test", 1, "zhejiang")[0];
    assert.equal(normalized.item.region, "zhejiang"); assert.deepEqual(normalized.item.examEvidence, []); assert.equal(normalized.item.editorRecommended, false);
    assert.equal(normalized.item.sourceRefs[0].evidenceExcerpt, evidenceChoices([regional])[0].text);
    if (module === "zhejiang") assert.deepEqual(normalized.item.applicableYears, [2026]);
    assert.throws(() => normalizeGenerated({ entries: [generated(module, national)] }, module, [national], today, "test", 1, "zhejiang"), /source_region_mismatch/);
  }
});
test("same-title national and Zhejiang affairs get different stable IDs", () => {
  const a = generated("affairs", national), b = generated("affairs", regional); b.item.title = a.item.title;
  const one = normalizeGenerated({ entries: [a] }, "affairs", [national], today, "test", 1, "national");
  const two = normalizeGenerated({ entries: [b] }, "affairs", [regional], today, "test", 1, "zhejiang");
  assert.notEqual(one[0].item.stableId, two[0].item.stableId); assert.equal(mergeEntries({ items: [], questions: [] }, [...one, ...two]).added, 2);
});
test("Bailian Qwen3.7 Flash keeps non-thinking JSON options provider-specific", () => {
  assert.deepEqual(providerRequestOptions({ baseUrl: "https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", model: "qwen3.7-flash" }), { enable_thinking: false, response_format: { type: "json_object" } });
  assert.deepEqual(providerRequestOptions({ baseUrl: config.baseUrl, model: "qwen3.7-flash" }), {});
});
test("six jobs save incrementally and a repeat costs no additional API calls", async () => {
  const store = memoryStore(); let calls = 0;
  const result = await run(store, { fetcher: (url, request) => { calls++; return fakeProvider(url, request); } });
  assert.equal(calls, 6); assert.equal(result.added, 6); assert.deepEqual(result.failures, []);
  assert.equal(JSON.parse(store.files.get("latest.json")).items.length, 112);
  const state = JSON.parse(store.files.get("generation-state.json"));
  for (const job of JOBS) { assert.equal(state.counts[job.key], 1); assert.equal(state.attempts[job.key], 1); }
  const repeated = await run(store, { fetcher: () => { throw new Error("must not spend"); } });
  assert.equal(repeated.alreadyComplete, true);
});
test("unavailable Zhejiang material does not fabricate regional content or spend regional quota", async () => {
  const store = memoryStore(); let calls = 0;
  const result = await run(store, { sources: [national], fetcher: (url, request) => { calls++; return fakeProvider(url, request); } });
  assert.equal(calls, 4); assert.equal(result.added, 4);
  assert.deepEqual(result.failures.map(x => x.module), ["zhejiang-affairs", "zhejiang"]);
  assert.equal(JSON.parse(store.files.get("generation-state.json")).attempts.zhejiang, undefined);
});
test("failed national job does not discard successful Zhejiang batches", async () => {
  const store = memoryStore();
  const result = await run(store, { fetcher: (url, request) => /region 必须是 national/.test(JSON.parse(request.body).messages[1].content) ? Promise.resolve({ ok: false, status: 503 }) : fakeProvider(url, request) });
  assert.equal(result.added, 5); assert.equal(JSON.parse(store.files.get("latest.json")).items.length, 111);
  assert.equal(JSON.parse(store.files.get("generation-state.json")).attempts.affairs, 3);
});
test("bad credentials stop all remaining paid attempts", async () => {
  const store = memoryStore(); let calls = 0;
  const result = await run(store, { fetcher: async () => { calls++; return { ok: false, status: 401 }; } });
  assert.equal(calls, 1); assert.equal(result.added, 0); assert.equal(result.failures[0].code, "provider_http_401");
});
test("truncated or malformed output leaves the old full feed intact", async () => {
  const store = memoryStore(); const old = store.files.get("latest.json");
  const result = await run(store, { fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }) }) });
  assert.equal(result.added, 0); assert.equal(store.files.get("latest.json"), old);
  assert.equal(Object.values(JSON.parse(store.files.get("generation-state.json")).attempts).reduce((a, b) => a + b, 0), 18);
});
test("invalid configuration and tampered feed fail before paid requests", async () => {
  await assert.rejects(() => runUpdate({ config: { ...config, baseUrl: "http://provider.example" }, read: () => { throw Error("must not read"); } }), /missing_provider_configuration/);
  const store = memoryStore(); store.files.set("latest.json", JSON.stringify({ ...initial(), contentHash: "bad" }));
  await assert.rejects(() => run(store, { fetcher: () => { throw Error("must not spend"); } }), /existing_feed_integrity_failed/);
  assert.equal(safeFailureCode(new Error("test_secret_do_not_log")), "update_failed");
});
test("content delivery requires separate HTTPS credentials and never allows key-in-URL", () => {
  for (const env of [{}, { CONTENT_UPLOAD_URL: "http://content.example/full", CONTENT_UPLOAD_TOKEN: "test" }, { CONTENT_UPLOAD_URL: "https://content.example/full?token=test", CONTENT_UPLOAD_TOKEN: "test" }, { CONTENT_UPLOAD_URL: "https://content.example/full", CONTENT_UPLOAD_TOKEN: "same", CONTENT_API_KEY: "same" }]) assert.throws(() => publicationConfig(env));
});
test("content publication sends the checked package only to the chosen service", async () => {
  const result = await publishContent({ env: { CONTENT_UPLOAD_URL: "https://content.example/full", CONTENT_UPLOAD_TOKEN: "separate-test-token", CONTENT_API_KEY: "model-test-key" }, read: async () => JSON.stringify(initial()), fetcher: async (url, request) => {
    assert.equal(url, "https://content.example/full"); assert.equal(request.method, "PUT"); assert.equal(request.redirect, "error");
    assert.equal(request.headers.authorization, "Bearer separate-test-token"); assert.ok(!request.body.includes("model-test-key"));
    assert.equal(JSON.parse(request.body).items.length, 106); return { ok: true };
  } });
  assert.equal(result.items, 106);
});

test("bootstrap retains all 104 legacy cards and the consumed daily budget", () => {
  const base = seed.items.filter(item => item.region !== "zhejiang");
  const questions = seed.questions.filter(q => base.some(item => item.knowledgeId === q.knowledgeId));
  const entries = normalizeGenerated({ entries: [1, 2, 3, 4].map(i => generated("idiom", national, i)) }, "idiom", [national], today, "test", 4);
  const merged = mergeEntries({ items: base, questions }, entries);
  const legacy = createPackage(merged.items, merged.questions, "legacy-104", today);
  const budget = { date: today, counts: { idiom: 4 }, attempts: { affairs: 3, general: 3, idiom: 2, essay: 3 }, totalAdded: 4 };
  const next = bootstrapFullContent(legacy, budget, today);
  assert.equal(next.content.items.length, 110); assert.equal(next.content.questions.length, 85);
  assert.deepEqual(next.content.items.slice(0, 104), legacy.items);
  assert.deepEqual(next.state, budget); assert.notEqual(next.state, budget);
  assert.equal(verifiedPackage(next.content), next.content);
  assert.throws(() => bootstrapFullContent({ ...legacy, contentHash: "bad" }, budget), /existing_feed_integrity_failed/);
  assert.throws(() => bootstrapFullContent(legacy, { ...budget, attempts: { idiom: -1 } }), /invalid_legacy_budget/);
});
test("each paid request follows a durable budget checkpoint and each batch is saved", async () => {
  const store = memoryStore(); let checkpoints = 0, calls = 0;
  const result = await run(store, {
    onPersist: async () => { checkpoints++; },
    fetcher: async (url, request) => {
      assert.equal(checkpoints, calls * 2 + 1);
      const state = JSON.parse(store.files.get("generation-state.json"));
      assert.equal(Object.values(state.attempts).reduce((a, b) => a + b, 0), calls + 1);
      calls++; return fakeProvider(url, request);
    },
  });
  assert.equal(result.added, 6); assert.equal(checkpoints, 12);
});
test("a failed cloud reservation stops before spending or subsequent requests", async () => {
  const store = memoryStore(); let calls = 0;
  await assert.rejects(() => run(store, { onPersist: async () => { throw Error("cloud_checkpoint_failed"); }, fetcher: async () => { calls++; } }), /cloud_checkpoint_failed/);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(store.files.get("generation-state.json")).attempts.affairs, 1);
});
test("inherited exhausted jobs are skipped without resetting their attempts", async () => {
  const store = memoryStore();
  const budget = { date: today, counts: {}, attempts: Object.fromEntries(JOBS.map(job => [job.key, 3])), totalAdded: 0 };
  store.files.set("generation-state.json", JSON.stringify(budget));
  const result = await run(store, { fetcher: () => { throw Error("must not spend"); } });
  assert.equal(result.budgetExhausted, true); assert.equal(result.alreadyComplete, false);
  assert.deepEqual(JSON.parse(store.files.get("generation-state.json")), budget);
});
test("git checkpoints publish only the separate full feed and never force-push", async () => {
  const cwd = "/tmp/gongkao-cloud-test";
  const paths = contentPaths(`${cwd}/public/content/full`);
  const commands = [];
  await gitCheckpoint(paths, { cwd, run: args => { commands.push(args); return { status: args[0] === "diff" ? 1 : 0 }; } })();
  assert.equal(commands.length, 4);
  assert.ok(commands[2].includes("--only")); assert.ok(!commands.flat().includes("--force"));
  assert.deepEqual(commands.at(-1), ["push", "origin", "HEAD:main"]);
  assert.throws(() => gitCheckpoint(contentPaths(`${cwd}/public/content`), { cwd }), /invalid_checkpoint_paths/);
  await assert.rejects(gitCheckpoint(paths, { cwd, run: () => ({ status: 1, stderr: "secret-do-not-log" }) }), /^Error: cloud_checkpoint_failed$/);
});
