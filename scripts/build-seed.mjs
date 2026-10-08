import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { SEED_DATE, seedEntries } from "../data/seed.mjs";
import { createPackage } from "./content-package.mjs";
const { items, questions } = seedEntries();
if (items.length !== 100) throw new Error(`初始条目必须为 100，实际为 ${items.length}`);
const content = createPackage(items, questions, "seed-v1-100", SEED_DATE);
await mkdir(new URL("../public/content/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/content/seed.json", import.meta.url), JSON.stringify(content, null, 2) + "\n");
const latest = new URL("../public/content/latest.json", import.meta.url);
try { await access(latest); } catch { await writeFile(latest, JSON.stringify(content, null, 2) + "\n"); }
if (process.argv.includes("--refresh-initial-feed")) {
  const existing = JSON.parse(await readFile(latest, "utf8"));
  if (existing.releaseId !== "seed-v1-100" || existing.items.length !== 100 || existing.questions.length !== 75) {
    throw new Error("只允许刷新未追加内容的初始订阅包，不能覆盖累计更新。");
  }
  await writeFile(latest, JSON.stringify(content, null, 2) + "\n");
}
console.log(`初始内容：${items.length} 条学习卡、${questions.length} 道原创练习。`);
