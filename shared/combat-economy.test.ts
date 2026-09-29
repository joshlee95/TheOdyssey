import assert from "node:assert/strict";
import { test } from "node:test";
import { enemyFromStatBlock, improvisedEnemy, parseDice, resolveAttack, rollDeathSave, rollDice } from "./combat";
import { buyPrice, crossTechMultiplier, haggleTier, sellPrice, toBits } from "./economy";
import { levelUp, PREGENS, quickBuild } from "./character";

const seq = (...d20s: number[]) => {
  let i = 0;
  return () => (d20s[i++] - 0.5) / 20;
};

test("주사위 식", () => {
  assert.deepEqual(parseDice("2d6+3"), { count: 2, sides: 6, bonus: 3 });
  assert.deepEqual(parseDice("d8"), { count: 1, sides: 8, bonus: 0 });
  assert.deepEqual(parseDice("7"), { count: 0, sides: 0, bonus: 7 });
  assert.equal(rollDice("5").total, 5);
});

test("치명타는 피해 주사위만 두 번", () => {
  // d20=20, 그다음 피해 주사위 d20 스케일 rng를 d6로 쓰므로 값만 확인
  const r = resolveAttack(3, 30, "1d6", { rng: seq(20, 1, 1), damageBonus: 2 });
  assert.equal(r.critical, true);
  assert.equal(r.hit, true);
  assert.equal(r.damageRolls.length, 2);
});

test("자연 1은 빗나감, AC 이상이면 명중", () => {
  assert.equal(resolveAttack(20, 5, "1d6", { rng: seq(1) }).hit, false);
  assert.equal(resolveAttack(3, 15, "1d6", { rng: seq(12, 10) }).hit, true);
  assert.equal(resolveAttack(3, 16, "1d6", { rng: seq(12) }).hit, false);
});

test("SRD 블록과 LGMRD 즉석 적", () => {
  const guard = enemyFromStatBlock("포졸", "guard");
  assert.equal(guard.ac, 16);
  assert.equal(guard.hp, 11);
  const boss = improvisedEnemy("두목", 4);
  assert.equal(boss.ac, 14);
  assert.equal(boss.hp, 80);
  assert.equal(boss.attackBonus, 5);
  assert.equal(boss.damage, "8d6");
});

test("사망 내성: 1은 실패 2회, 3번 성공하면 안정", () => {
  let st = { successes: 0, failures: 0, stable: false };
  st = rollDeathSave(st, seq(1)).state;
  assert.equal(st.failures, 2);
  st = { successes: 2, failures: 0, stable: false };
  st = rollDeathSave(st, seq(15)).state;
  assert.equal(st.stable, true);
  assert.equal(rollDeathSave(st, seq(20)).revived, true);
});

test("기술 수준 간 가격", () => {
  assert.equal(crossTechMultiplier("medieval", "modern"), 0.25);
  assert.equal(crossTechMultiplier("futuristic", "modern"), 5);
  assert.equal(crossTechMultiplier("futuristic", "medieval"), null);
});

test("구매가: 호감도·흥정 반영, 적대 상인은 거부", () => {
  assert.equal(buyPrice(toBits(10), { itemTech: "modern", islandTech: "modern", merchantAffinity: 70, haggleBuyMult: 0.9 }).bits, toBits(10 * 0.8 * 0.9));
  assert.equal(buyPrice(toBits(10), { itemTech: "modern", islandTech: "modern", merchantAffinity: -80 }).bits, null);
});

test("판매가는 장비 50%, 흥정해도 65% 상한, 보석은 100%", () => {
  assert.equal(sellPrice(1000, "equipment"), 500);
  assert.equal(sellPrice(1000, "equipment", 0.9), 650);
  assert.equal(sellPrice(1000, "valuable"), 1000);
});

test("흥정 결과 단계", () => {
  assert.equal(haggleTier(20, 5, 15).id, "crit_success");
  assert.equal(haggleTier(12, 21, 15).id, "great_success");
  assert.equal(haggleTier(12, 15, 15).id, "success");
  assert.equal(haggleTier(5, 9, 15).id, "bad_fail");
  assert.equal(haggleTier(1, 30, 15).id, "crit_fail");
});

test("레벨업: 4레벨 능력치 향상, 그림자 6레벨 전문화 추가", () => {
  let c = quickBuild(PREGENS[0]);
  for (let i = 0; i < 5; i++) c = levelUp(c);
  assert.equal(c.level, 6);
  assert.equal(c.asi.length, 2);
  assert.equal(c.expertise.length, 4);
});
