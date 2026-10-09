import { createHash } from "node:crypto";

const INDEXES = [
  { url: "https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json", format: "json" },
  { url: "https://www.stats.gov.cn/sj/zxfb/", format: "html" },
  { url: "https://www.zj.gov.cn/col/col1554467/index.html", format: "zhejiang" },
];
export const hashId = text => createHash("sha256").update(text).digest("hex").slice(0, 24);
export const localDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const decode = text => text.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
export const plainText = html => decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export function isAllowedSource(value) {
  try { const url = new URL(value); return url.protocol === "https:" && ["www.gov.cn", "www.stats.gov.cn", "www.zj.gov.cn"].includes(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}
function articleUrl(value, base) {
  try {
    if (typeof value !== "string") return null;
    const url = new URL(decode(value), base);
    if (!isAllowedSource(url.href)) return null;
    const patterns = {
      "www.gov.cn": /^\/zhengce\/(?:[^/]+\/)*content_\d+\.html?$/,
      "www.stats.gov.cn": /^\/sj\/zxfb\/(?:[^/]+\/)*t\d{8}_\d+\.html?$/,
      "www.zj.gov.cn": /^\/col\/col1554467\/art\/20\d{2}\/art_[a-f\d]{32}\.html$/,
    };
    return patterns[url.hostname].test(url.pathname) ? url.href : null;
  } catch { return null; }
}
export function articleLinks(html, base) {
  return [...new Set([...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(([, href]) => articleUrl(href, base)).filter(Boolean))].slice(0, 8);
}
export function governmentArticleLinks(text, base) {
  let entries; try { entries = JSON.parse(text); } catch { throw new Error("source_index_invalid_json"); }
  if (!Array.isArray(entries)) throw new Error("source_index_invalid_json");
  return [...new Set(entries.map(entry => articleUrl(entry?.URL, base)).filter(url => url && new URL(url).hostname === "www.gov.cn"))].slice(0, 8);
}
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(([, key, a, b]) => [key.toLowerCase(), decode(a ?? b)]));
export function zhejiangListRequest(html, base) {
  const tag = [...html.matchAll(/<script\b[^>]*>/gi)].map(match => attributes(match[0])).find(attrs => attrs.querydata);
  if (!tag) throw new Error("source_index_missing_loader");
  const url = new URL(tag.url, base);
  if (url.origin !== "https://www.zj.gov.cn" || url.pathname !== "/api-gateway/jpaas-publish-server/front/page/build/unit") throw new Error("source_not_allowed");
  let query; try { query = JSON.parse(tag.querydata.replaceAll("'", '"')); } catch { throw new Error("source_index_invalid_json"); }
  if (query.webId !== "3096" || query.pageId !== "1554467" || query.pageType !== "column" || query.parseType !== "bulidstatic") throw new Error("source_not_allowed");
  for (const key of ["parseType", "webId", "tplSetId", "pageType", "tagId", "editType", "pageId"]) {
    if (typeof query[key] !== "string") throw new Error("source_index_invalid_json");
    url.searchParams.set(key, query[key]);
  }
  return url.href;
}
function elementBody(html, startPattern) {
  const match = startPattern.exec(html); if (!match) return null;
  const start = match.index + match[0].length;
  const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = start;
  let depth = 1, tag;
  while ((tag = tags.exec(html))) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (!depth) return html.slice(start, tag.index);
  }
  return null;
}
export function extractSource(html, url, today) {
  if (!isAllowedSource(url)) throw new Error("source_not_allowed");
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const meta = name => metas.find(attrs => attrs.name?.toLowerCase() === name.toLowerCase())?.content;
  const title = meta("ArticleTitle") || plainText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const bodyHtml = html.match(/<!--\s*TRS_Editor\s*-->([\s\S]*?)<!--\s*\/TRS_Editor\s*-->/i)?.[1]
    ?? elementBody(html, /<div\b[^>]*id=["']zoom["'][^>]*>/i)
    ?? elementBody(html, /<div\b[^>]*class=["'][^"']*TRS_Editor[^"']*["'][^>]*>/i);
  if (!bodyHtml) throw new Error("source_body_missing");
  const body = plainText(bodyHtml);
  const date = (meta("PubDate") ?? meta("publishdate") ?? meta("Date") ?? plainText(html.slice(0, html.indexOf(bodyHtml)))).match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!date) throw new Error("source_date_missing");
  const publishedAt = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
  const age = (Date.parse(today) - Date.parse(publishedAt)) / 86400000;
  if (!title || body.length < 150 || !Number.isFinite(age) || age < 0 || age > 31) throw new Error("source_not_recent");
  const host = new URL(url).hostname;
  return { id: `source-${hashId(url)}`, title, url, publisher: { "www.gov.cn": "中国政府网", "www.stats.gov.cn": "国家统计局", "www.zj.gov.cn": "浙江省人民政府" }[host], scope: host === "www.zj.gov.cn" ? "zhejiang" : "national", publishedAt, verifiedAt: today,
    rightsNote: "来源原文仅用于核对，发布原创学习摘要。", body: body.slice(0, 12000) };
}
export async function fetchText(url, fetcher = fetch) {
  if (!isAllowedSource(url)) throw new Error("source_not_allowed");
  let response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "GongkaoGuide/1.1 (study summary)", accept: "application/json,text/html;q=0.9" } }); }
  catch (error) { throw new Error(["TimeoutError", "AbortError"].includes(error?.name) ? "source_timeout" : "source_fetch_failed"); }
  if (!response.ok) throw new Error(`source_http_${response.status}`);
  if (!isAllowedSource(response.url || url)) throw new Error("source_not_allowed");
  return response.text();
}
export async function collectSources(today, fetcher = fetch, report = () => {}) {
  const indexes = await Promise.allSettled(INDEXES.map(async ({ url, format }) => {
    let text = await fetchText(url, fetcher);
    if (format === "zhejiang") {
      const value = JSON.parse(await fetchText(zhejiangListRequest(text, url), fetcher));
      if (value.success !== true || typeof value.data?.html !== "string") throw new Error("source_index_invalid_json");
      text = value.data.html;
    }
    return format === "json" ? governmentArticleLinks(text, url) : articleLinks(text, url);
  }));
  indexes.forEach((result, index) => report({ stage: "index", host: new URL(INDEXES[index].url).hostname, ...(result.status === "fulfilled" ? { links: result.value.length } : { code: "source_index_unavailable" }) }));
  const groups = indexes.map(result => result.status === "fulfilled" ? result.value : []);
  const urls = [...new Set(Array.from({ length: 8 }, (_, index) => groups.flatMap(group => group[index] ? [group[index]] : [])).flat())];
  const results = [];
  for (let offset = 0; offset < urls.length; offset += 2) results.push(...await Promise.allSettled(urls.slice(offset, offset + 2).map(async url => extractSource(await fetchText(url, fetcher), url, today))));
  const sources = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (!sources.length) throw new Error("no_recent_official_sources");
  // Separate quotas prevent one publisher from displacing Zhejiang material.
  return ["national", "zhejiang"].flatMap(scope => sources.filter(source => source.scope === scope).slice(0, 8));
}
