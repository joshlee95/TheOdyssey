// 섬 팩 한국어 문장의 AI 티 검사. 사용법: npm run lint:prose [-- 섬id]
// 필드마다 따로 세고(짧은 필드끼리 합쳐 과대 집계하지 않도록), 섬 전체 합계를 낸다.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { lintProse } from "../shared/prose-lint";

const ROOT = path.resolve(import.meta.dirname, "../islands");
const only = process.argv.slice(2);

function* strings(node: unknown, at: string): Generator<[string, string]> {
  if (typeof node === "string") yield [at, node];
  else if (Array.isArray(node)) for (const [i, v] of node.entries()) yield* strings(v, `${at}[${i}]`);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) yield* strings(v, at ? `${at}.${k}` : k);
}

let total = 0;
for (const d of (await readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(path.join(ROOT, d.name, "island.yaml")))) {
  if (only.length && !only.includes(d.name)) continue;
  const island = parse(await readFile(path.join(ROOT, d.name, "island.yaml"), "utf8"));
  let score = 0;
  const lines: string[] = [];
  for (const [at, text] of strings(island, "")) {
    const r = lintProse(text);
    if (!r.score) continue;
    score += r.score;
    for (const h of r.hits) lines.push(`  ${at}: ${h.category}(${h.id}) ${h.count}회 — ${h.samples[0]}`);
  }
  // 괄호 한자 병기와 줄표 부제는 필드 단위 검사로는 약하게 잡혀서 따로 본다
  const title = String(island.meta?.title ?? "");
  if (/[一-龥]/.test(title) || /[—–-]\s/.test(title)) {
    score += 3;
    lines.push(`  meta.title: 한자 병기나 줄표 부제 — ${title}`);
  }
  total += score;
  console.log(`${score ? "!" : "✓"} ${d.name} — 점수 ${score}`);
  for (const l of lines) console.log(l);
}
console.log(`\n합계 ${total}`);
