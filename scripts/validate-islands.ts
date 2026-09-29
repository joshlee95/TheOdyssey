// 사용법: npm run validate            → islands/*/island.yaml 전부 검사
//        npm run validate -- my-island → 특정 섬만 검사
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { IslandSchema, lintIsland } from "../shared/island";

const ISLANDS_DIR = path.resolve(import.meta.dirname, "../islands");

async function main() {
  const only = process.argv.slice(2);
  const dirs = (await readdir(ISLANDS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && (only.length === 0 || only.includes(d.name)))
    .map((d) => d.name)
    .sort();

  let failed = 0;
  for (const dir of dirs) {
    const file = path.join(ISLANDS_DIR, dir, "island.yaml");
    let raw: unknown;
    try {
      raw = parse(await readFile(file, "utf8"));
    } catch (err) {
      failed++;
      console.log(`✗ ${dir}: YAML을 읽을 수 없어요\n  ${(err as Error).message}`);
      continue;
    }

    const result = IslandSchema.safeParse(raw);
    if (!result.success) {
      failed++;
      console.log(`✗ ${dir}\n${z.prettifyError(result.error).replace(/^/gm, "  ")}`);
      continue;
    }

    const island = result.data;
    if (island.id !== dir && !dir.startsWith("_"))
      console.log(`  ! ${dir}: 폴더 이름과 id("${island.id}")가 달라요`);

    const warnings = lintIsland(island);
    console.log(`✓ ${dir} — ${island.meta.title} (by ${island.meta.author})`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (dirs.length === 0) console.log("검사할 섬이 없어요");
  process.exitCode = failed ? 1 : 0;
}

await main();
