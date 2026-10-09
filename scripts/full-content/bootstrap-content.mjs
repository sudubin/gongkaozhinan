import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fullSeedEntries } from "../../data/full-seed.mjs";
import { createPackage, mergeEntries, verifiedPackage } from "./content-package.mjs";
import { contentPaths } from "./update-content.mjs";
import { localDay } from "./official-sources.mjs";

export function bootstrapFullContent(legacy, state, today = localDay()) {
  verifiedPackage(legacy);
  const seed = fullSeedEntries();
  const entries = seed.items.filter(item => item.region === "zhejiang").map(item => ({ item, questions: seed.questions.filter(question => question.knowledgeId === item.knowledgeId) }));
  const merged = mergeEntries(legacy, entries);
  if (!state || !/^\d{4}-\d{2}-\d{2}$/.test(state.date)) throw new Error("invalid_legacy_budget");
  for (const value of Object.values(state.attempts ?? {})) if (!Number.isInteger(value) || value < 0 || value > 3) throw new Error("invalid_legacy_budget");
  for (const value of Object.values(state.counts ?? {})) if (!Number.isInteger(value) || value < 0) throw new Error("invalid_legacy_budget");
  return { content: createPackage(merged.items, merged.questions, `full-bootstrap-${today}`, today), state: structuredClone(state) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [feedInput, stateInput, directory] = process.argv.slice(2);
  if (!feedInput || !stateInput || !directory) throw new Error("bootstrap requires explicit input snapshots and new output directory");
  const result = bootstrapFullContent(JSON.parse(await readFile(feedInput, "utf8")), JSON.parse(await readFile(stateInput, "utf8")));
  const paths = contentPaths(directory);
  await mkdir(resolve(directory), { recursive: true });
  // Never overwrite a live feed or erase its daily ledger when re-run.
  await writeFile(paths.feedPath, JSON.stringify(result.content, null, 2) + "\n", { flag: "wx" });
  await writeFile(paths.statePath, JSON.stringify(result.state, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ items: result.content.items.length, questions: result.content.questions.length, inheritedDate: result.state.date, inheritedAttempts: result.state.attempts }));
}
