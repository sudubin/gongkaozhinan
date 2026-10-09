import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Only these public data files may be published by a generation job.
const ALLOWED = ["public/content/full/latest.json", "public/content/full/generation-state.json"];
export function gitCheckpoint(paths, { cwd = process.cwd(), run = (args) => spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) } = {}) {
  const files = [paths.feedPath, paths.statePath].map(url => relative(resolve(cwd), fileURLToPath(url)).replaceAll("\\", "/"));
  if (files.some(file => !ALLOWED.includes(file)) || new Set(files).size !== 2) throw new Error("invalid_checkpoint_paths");
  const execute = (args, permitted = [0]) => {
    const result = run(args);
    if (result.error || !permitted.includes(result.status)) throw new Error("cloud_checkpoint_failed");
    return result.status;
  };
  return async () => {
    execute(["add", "--", ...files]);
    if (execute(["diff", "--cached", "--quiet", "--", ...files], [0, 1]) === 1) {
      execute(["-c", "user.name=gongkao-full-content-bot", "-c", "user.email=gongkao-full-content-bot@users.noreply.github.com", "commit", "--only", "-m", "Checkpoint full-version content and daily API budget", "--", ...files]);
    }
    // A failed push stops generation before another paid call; never force-push.
    execute(["push", "origin", "HEAD:main"]);
  };
}
