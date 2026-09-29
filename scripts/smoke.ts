// 연기 테스트: 선원 2명이 섬 하나에 상륙해 몇 라운드를 진행하고, 선원별로 보이는 로그를 출력한다.
// 사용법: npm run smoke                    → 모의 GM (API 미사용)
//        npm run smoke -- --claude [섬id] [라운드수]  → Claude GM (ANTHROPIC_API_KEY 필요, 비용 발생)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { PREGENS, quickBuild } from "../shared/character";
import { IslandSchema } from "../shared/island";
import { Game, type GM } from "../server/game";
import { ClaudeGM } from "../server/gm/claude";
import { MockGM } from "../server/gm/mock";
import * as settings from "../server/settings";

const args = process.argv.slice(2);
const useClaude = args.includes("--claude");
const [islandId = "mist-lantern", roundsArg = "3"] = args.filter((a) => !a.startsWith("--"));
await settings.loadSettings();
if (useClaude && !settings.apiKey()) throw new Error("API 키가 없어요. 게임의 ⚙️ 설정이나 .env에 넣어 주세요");
const gm: GM = useClaude ? new ClaudeGM({ apiKey: settings.apiKey()!, model: settings.model(), effort: settings.effort() }) : new MockGM();

const raw = parse(await readFile(path.resolve(import.meta.dirname, `../islands/${islandId}/island.yaml`), "utf8"));
const island = IslandSchema.parse(raw);

const game = new Game("TEST", island.meta.content.rating);
const a = game.join("플레이어1");
const b = game.join("플레이어2");
game.setCharacter(a.id, quickBuild(PREGENS[0])); // 건희 (그림자, 사기꾼)
game.setCharacter(b.id, quickBuild(PREGENS[1])); // 세라핀 (수호자)
game.on("gm:delta", (d: string) => process.stdout.write(d));

console.log(`\n=== ${island.meta.title} / GM: ${gm.name} ===\n`);
await game.startIsland(island, gm);

const scripts: [string, string][] = [
  ["주민에게 다가가 공손히 인사하고, 이 섬에 대해 묻는다 (몰래 상대의 주머니를 슬쩍 턴다)", "건희 옆에서 경계하며 주변을 살핀다"],
  ["배의 이름판이 왜 지워졌는지 아는 사람이 있는지 수소문한다", "건희가 아까 뭘 한 건지 유심히 지켜본다"],
  ["가장 수상해 보이는 장소로 가 보자고 제안한다", "앞장서서 길을 연다"],
  ["지금까지 알아낸 것을 정리해 동료에게 털어놓는다", "주민에게 도울 일이 없는지 묻는다"],
];
const rounds = Number(roundsArg);
for (let r = 0; r < rounds && game.phase === "round_open"; r++) {
  const [ta, tb] = scripts[r % scripts.length];
  game.submitAction(a.id, { kind: "do", text: ta, useInspiration: false });
  game.submitAction(b.id, { kind: "do", text: tb, useInspiration: false });
  console.log(`\n\n--- 라운드 ${r + 1} ---`);
  await game.resolveRound(gm);
}

const show = (e: unknown) => {
  const x = e as Record<string, any>;
  switch (x.type) {
    case "narration": return `📖 ${x.text.slice(0, 160).replace(/\n/g, " ")}…`;
    case "action": return `▶ ${x.name}: ${x.publicText}${x.secrets.length ? `  🔒${x.secrets.map((s: any) => `${s.text}[${s.status}]`).join(", ")}` : ""}`;
    case "roll": return x.secret ? `🎲 ${x.name} — 비밀 판정` : `🎲 ${x.name} ${x.label} ${x.result.total} vs ${x.result.dc} ${x.result.success ? "성공" : "실패"}`;
    case "whisper": return `🤫 ${x.text}`;
    case "reveal": return `🔓 ${x.note}`;
    case "affinity": return `${x.delta >= 0 ? "👍" : "👎"} ${x.npcName}${x.tierChange ? ` ${x.tierChange.join("→")}` : ""}`;
    default: return `· ${x.text ?? x.type}`;
  }
};
for (const p of [a, b]) {
  const snap = game.snapshot(p.id);
  console.log(`\n\n===== ${game.nameOf(p.id)}의 화면 =====`);
  for (const e of snap.log) console.log(show(e));
  console.log(`관계: ${snap.relationships.map((r) => `${r.npc}=${r.tier}`).join(", ") || "없음"}`);
}
console.log(`\n상태: phase=${game.phase} 막=${game.visit?.act} 시계=${game.visit?.clock} 비밀행동=${game.hiddenActions.map((h) => `${h.id}:${h.status}`).join(",")}`);
