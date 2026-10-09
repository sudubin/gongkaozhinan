import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createPackage } from "./content-package.mjs";

export function publicationConfig(env = process.env) {
  let url;
  try { url = new URL(env.CONTENT_UPLOAD_URL ?? ""); } catch { throw new Error("missing_content_delivery"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || !env.CONTENT_UPLOAD_TOKEN || env.CONTENT_UPLOAD_TOKEN === env.CONTENT_API_KEY) throw new Error("invalid_content_delivery");
  return { url: url.href, token: env.CONTENT_UPLOAD_TOKEN };
}
export async function publishContent({ env = process.env, fetcher = fetch, read = readFile } = {}) {
  const config = publicationConfig(env);
  const text = await read(new URL("../../gongkao-frontend/public/content/latest.json", import.meta.url), "utf8");
  const content = JSON.parse(text);
  if (createPackage(content.items, content.questions, content.releaseId, content.createdAt).contentHash !== content.contentHash) throw new Error("content_integrity_failed");
  const response = await fetcher(config.url, { method: "PUT", redirect: "error", signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" }, body: text });
  if (!response.ok) throw new Error(`content_delivery_http_${response.status}`);
  return { releaseId: content.releaseId, items: content.items.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes("--check")) { publicationConfig(); console.log("内容发布配置检查通过；尚未发送内容。"); }
    else console.log(JSON.stringify(await publishContent()));
  } catch { console.error("完整版内容发布未完成：请检查内容服务的上传地址、独立上传凭据和连通性。旧内容保留；不输出地址、凭据或服务响应。"); process.exitCode = 1; }
}
