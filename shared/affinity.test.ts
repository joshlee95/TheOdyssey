import assert from "node:assert/strict";
import { test } from "node:test";
import { type AffinityState, applyAffinityChange, bond, socialAdvantage, tierOf } from "./affinity";

test("단계 경계", () => {
  assert.deepEqual([-100, -60, -59, -20, -19, 19, 20, 59, 60, 89, 90, 100].map((v) => tierOf(v).id), [
    "hostile", "hostile", "wary", "wary", "neutral", "neutral", "friendly", "friendly", "trusted", "trusted", "bonded", "bonded",
  ]);
});

test("사회 판정 이점/불리", () => {
  assert.equal(socialAdvantage(-70, "persuasion"), "disadvantage");
  assert.equal(socialAdvantage(-30, "persuasion"), "disadvantage");
  assert.equal(socialAdvantage(-30, "deception"), "normal");
  assert.equal(socialAdvantage(70, "persuasion"), "advantage");
  assert.equal(socialAdvantage(70, "deception"), "normal");
  assert.equal(socialAdvantage(-90, "intimidation"), "normal");
});

function world(): AffinityState {
  const s: AffinityState = {};
  bond(s, "orna", "p1", 25);
  bond(s, "pim", "orna", 90); // 핌은 오르나를 좋아한다
  bond(s, "captain", "orna", -85); // 선장은 오르나를 싫어한다
  bond(s, "stranger", "orna", 5); // 무관심
  return s;
}

test("목격된 일은 가까운 NPC에게 같은 방향, 적대하는 NPC에게 반대 방향으로 번진다", () => {
  const s = world();
  const updates = applyAffinityChange(s, { from: "orna", to: "p1", delta: -20, reason: "등대를 뒤졌다", witnessed: true });
  assert.equal(s.orna.p1.value, 5);
  assert.equal(s.pim.p1.value, -6);
  assert.equal(s.captain.p1.value, 6);
  assert.equal(s.stranger?.p1, undefined);
  assert.equal(updates.filter((u) => u.via === "gossip").length, 2);
  assert.match(s.pim.p1.memories[0], /orna에게서 들음/);
});

test("목격되지 않은 일은 번지지 않고, 값은 -100~100으로 제한된다", () => {
  const s = world();
  applyAffinityChange(s, { from: "orna", to: "p1", delta: 200, reason: "목숨을 구했다", witnessed: false });
  assert.equal(s.orna.p1.value, 100);
  assert.equal(s.pim.p1, undefined);
});

test("단계가 바뀌면 tierChanged", () => {
  const s = world();
  const [u] = applyAffinityChange(s, { from: "orna", to: "p1", delta: 40, reason: "핌을 구했다", witnessed: false });
  assert.equal(u.tierChanged, true);
  assert.equal(tierOf(u.after).id, "trusted");
});
