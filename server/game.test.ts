import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";
import { PREGENS, quickBuild } from "../shared/character";
import { IslandSchema } from "../shared/island";
import { Game, type GM } from "./game";

const island = IslandSchema.parse(parse(readFileSync(new URL("../islands/mist-lantern/island.yaml", import.meta.url), "utf8")));

/** 스크립트대로 도구를 부르는 GM */
const scripted = (steps: (game: Game) => void): GM => ({
  name: "test",
  async runRound(game, input) {
    if (!input.opening) steps(game);
    return "서술";
  },
  async summarize() {
    return "요약";
  },
});

async function setup(steps: (game: Game, ids: { a: string; b: string; hidden: () => string }) => void) {
  const game = new Game("T", "teen");
  const a = game.join("A").id;
  const b = game.join("B").id;
  game.setCharacter(a, quickBuild(PREGENS[0]));
  game.setCharacter(b, quickBuild(PREGENS[3])); // 도윤 — 감지 숙련 없음
  const hidden = () => game.hiddenActions[0].id;
  const gm = scripted((g) => steps(g, { a, b, hidden }));
  await game.startIsland(island, gm);
  game.submitAction(a, { kind: "do", text: "인사한다 (주머니를 턴다)", useInspiration: false });
  game.submitAction(b, { kind: "pass", text: "", useInspiration: false });
  await game.resolveRound(gm);
  return { game, a, b };
}

const texts = (game: Game, viewer: string) => JSON.stringify(game.snapshot(viewer).log);

test("비밀 행동 원문은 행동자에게만 보이고, 비밀 판정 결과도 숨겨진다", async () => {
  const { game, a, b } = await setup((g, { a, hidden }) => {
    g.runTool("roll", { player_id: a, check_type: "skill", check: "sleight_of_hand", dc: 1, hidden_action_id: hidden(), reason: "t" });
  });
  assert.match(texts(game, a), /주머니를 턴다/);
  const other = texts(game, b);
  assert.doesNotMatch(other, /주머니를 턴다/);
  assert.match(other, /미심쩍은 행동을 했다/);
  assert.match(other, /"secret":true/);
  assert.doesNotMatch(other, /손재주/);
});

test("탄로가 나면 원문·판정·설명이 모두에게 보이고, 설명은 서술 뒤에 온다", async () => {
  const { game, b } = await setup((g, { a, hidden }) => {
    g.runTool("roll", { player_id: a, check_type: "skill", check: "sleight_of_hand", dc: 40, hidden_action_id: hidden(), reason: "t" });
    g.runTool("expose_hidden_action", { hidden_action_id: hidden(), note: "건희가 오르나에게 들켰습니다" });
  });
  const log = game.snapshot(b).log as { type: string }[];
  assert.match(JSON.stringify(log), /주머니를 턴다/);
  const narration = log.findLastIndex((e) => e.type === "narration");
  const reveal = log.findIndex((e) => e.type === "reveal");
  assert.ok(reveal > narration, "탄로 설명은 서술 뒤에");
});

test("share_hidden_action은 조사한 선원 한 명에게만 알려 준다", async () => {
  const { game, b } = await setup((g, { b, hidden }) => {
    g.runTool("share_hidden_action", { hidden_action_id: hidden(), player_id: b, how: "소매를 스치는 손을 봤다" });
  });
  assert.match(texts(game, b), /주머니를 턴다/);
});

test("호감도 변화는 대상 선원에게만, 소문은 관계를 따라 번진다", async () => {
  const { game, a, b } = await setup((g, { a }) => {
    g.runTool("change_affinity", { npc_id: "orna", target: a, delta: -20, reason: "등대를 뒤졌다", witnessed: true });
  });
  assert.equal(game.affinityValue("orna", a), 5);
  assert.ok(game.affinityValue("pim", a) < 40, "핌은 오르나 편이라 같이 싫어한다");
  assert.ok(game.affinityValue("nameless-captain", a) > -30, "선장은 오르나의 적이라 오히려 좋아한다");
  assert.match(texts(game, a), /"type":"affinity"/);
  assert.doesNotMatch(texts(game, b), /"type":"affinity"/);
});

test("잘못된 도구 입력은 오류로 돌려준다", async () => {
  const { game, a } = await setup(() => {});
  assert.equal(game.runTool("roll", { player_id: a, check_type: "skill", check: "arcana", dc: 10, reason: "t" }).ok, false);
  assert.equal(game.runTool("move_party", { location_id: "name-archive" }).ok, false, "숨겨진 장소는 발견 전 이동 불가");
  assert.equal(game.runTool("advance_act", { act: 9, reason: "t" }).ok, false);
});

test("전투: 적 생성, 공격, 쓰러짐, 사기 판정, 종료", async () => {
  const { game, a } = await setup(() => {});
  const start = game.runTool("start_combat", { enemies: [{ name: "산적", statblock: "bandit", count: 2 }], surprised: "none" });
  assert.equal(start.ok, true);
  const enemies = Object.keys(game.visit!.combat!.enemies);
  assert.equal(enemies.length, 2);
  // 확실히 쓰러뜨리기 위해 큰 피해
  const hit = game.runTool("apply_damage", { target: enemies[0], dice: "50", reason: "폭발" });
  assert.equal(hit.ok && (hit.result as { target_down: boolean }).target_down, true);
  assert.ok(hit.ok && (hit.result as { morale?: string }).morale, "첫 사상자에서 사기 판정");
  const onPlayer = game.runTool("attack", { attacker: enemies[1], target: a, reason: "반격" });
  assert.equal(onPlayer.ok, true);
  assert.equal(game.runTool("end_combat", { outcome: "victory", reason: "끝" }).ok, true);
  assert.equal(game.visit!.combat, null);
});

test("거래: 사고 팔고 치르면 잔액이 맞는다", async () => {
  const { game, a, b } = await setup(() => {});
  const before = game.players.get(a)!.coins;
  assert.equal(game.runTool("buy", { player_id: a, item: "밧줄", base_price: 1, qty: 2 }).ok, true);
  assert.equal(game.players.get(a)!.coins, before - 200);
  assert.equal(game.runTool("sell", { player_id: a, item: "밧줄", base_price: 1, sale_kind: "equipment" }).ok, true);
  assert.equal(game.players.get(a)!.coins, before - 150);
  assert.equal(game.runTool("pay", { player_id: a, amount: 5, to: b, reason: "빚" }).ok, true);
  assert.equal(game.players.get(b)!.coins, 10000 + 500);
  assert.equal(game.runTool("pay", { player_id: a, amount: 99999, reason: "사치" }).ok, false);
});

test("시계와 오라클", async () => {
  const { game } = await setup(() => {});
  assert.equal(game.runTool("create_clock", { id: "chase", name: "추격대", segments: 4, type: "danger" }).ok, true);
  const t = game.runTool("tick_clock", { clock_id: "chase", ticks: 5, reason: "t" });
  assert.equal(t.ok && (t.result as { full: boolean }).full, true);
  const o = game.runTool("ask_oracle", { question: "문이 잠겼나?", odds: "likely" });
  assert.ok(o.ok && ["예", "아니오"].includes((o.result as { answer: string }).answer));
});
