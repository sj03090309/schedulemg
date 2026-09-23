import { createReadStream, promises as fs, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

/** root 아래에서 조건에 맞고 minMtimeMs 이후에 바뀐 파일 목록 */
export async function listFiles(root, predicate, { maxDepth = 6, minMtimeMs = 0 } = {}) {
  const out = [];
  async function walk(dir, depth) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth) await walk(full, depth + 1);
      } else if (entry.isFile() && predicate(entry.name)) {
        try {
          const st = await fs.stat(full);
          if (st.mtimeMs >= minMtimeMs) out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          // 읽는 사이 지워진 파일
        }
      }
    }
  }
  await walk(root, 0);
  return out;
}

export async function forEachLine(file, fn) {
  const rl = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) fn(line);
}

export function readJSON(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
  renameSync(tmp, file);
}
