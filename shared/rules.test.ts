import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterSchema, deriveSheet, PREGENS, quickBuild } from "./character";
import { checkBonus, passiveScore, pointBuyCost, proficiencyBonus, rollCheck } from "./rules";

/** d20에서 이 값들이 순서대로 나오게 하는 rng */
const dice = (...values: number[]) => {
  let i = 0;
  return () => (values[i++] - 0.5) / 20;
};

const rogue = quickBuild({
  name: "건희", title: "사기꾼", origin: "서울", concept: "빠른 손", archetype: "shadow", origin_trait: "lucky", background: "charlatan",
});
const rogueSheet = deriveSheet(rogue);

test("포인트 바이 표준 배열은 27점", () => {
  assert.equal(pointBuyCost(rogue.base_scores), 27);
});

test("숙련 보너스는 레벨 1·5·9에서 +2·+3·+4", () => {
  assert.deepEqual([1, 4, 5, 9, 12].map(proficiencyBonus), [2, 2, 3, 4, 4]);
});

test("그림자(로그) 사기꾼: 손재주 전문화, 민첩 17", () => {
  assert.equal(rogueSheet.scores.dex, 17);
  assert.ok(rogueSheet.proficientSkills.includes("sleight_of_hand"));
  assert.equal(rogueSheet.expertise.length, 2);
  // 민첩 +3, 전문화 +4
  assert.equal(checkBonus(rogueSheet, { type: "skill", skill: "sleight_of_hand" }), 7);
  assert.equal(rogueSheet.maxHp, 8); // d8 + 건강 10(+0)
});

test("판정: d20 12 + 7 vs 16 → 성공, margin 3", () => {
  const r = rollCheck(rogueSheet, { type: "skill", skill: "sleight_of_hand" }, 16, { rng: dice(12) });
  assert.equal(r.total, 19);
  assert.equal(r.success, true);
  assert.equal(r.margin, 3);
});

test("행운: 1이 나오면 다시 굴린다", () => {
  const r = rollCheck(rogueSheet, { type: "skill", skill: "stealth" }, 15, { rng: dice(1, 15) });
  assert.equal(r.luckyReroll, true);
  assert.equal(r.kept, 15);
});

const scholar = deriveSheet(quickBuild({
  name: "도윤", title: "연구가", origin: "현대", concept: "궁금함", archetype: "scholar", origin_trait: "iron_will", background: "researcher",
}));

test("자연 1은 보너스와 상관없이 실패", () => {
  const r = rollCheck(scholar, { type: "skill", skill: "occult" }, 5, { rng: dice(1) });
  assert.equal(r.success, false);
  assert.equal(r.critical, "fail");
});

test("자연 20은 DC 30도 성공", () => {
  const r = rollCheck(scholar, { type: "ability", ability: "str" }, 30, { rng: dice(20) });
  assert.equal(r.success, true);
});

test("굳센 정신: 지혜 내성에 자동 이점, 불리와 상쇄", () => {
  assert.equal(rollCheck(scholar, { type: "save", ability: "wis" }, 10, { rng: dice(3, 18) }).kept, 18);
  assert.equal(rollCheck(scholar, { type: "save", ability: "wis" }, 10, { rng: dice(3), advantage: "disadvantage" }).advantage, "normal");
});

test("수동 감지 = 10 + 감지 보너스", () => {
  assert.equal(passiveScore(scholar, "perception"), 10 + checkBonus(scholar, { type: "skill", skill: "perception" }));
});

test("미리 만든 캐릭터는 모두 규칙에 맞다", () => {
  for (const p of PREGENS) assert.doesNotThrow(() => quickBuild(p), p.name);
});

test("검증: 포인트 초과, 배경과 겹친 기술, 숙련 없는 전문화", () => {
  const bad = CharacterSchema.safeParse({
    ...rogue,
    base_scores: { ...rogue.base_scores, str: 15 },
    archetype_skills: ["deception", ...rogue.archetype_skills.slice(1)],
    expertise: ["medicine", rogue.expertise[1]],
  });
  assert.equal(bad.success, false);
  const messages = bad.error!.issues.map((i) => i.message).join("\n");
  assert.match(messages, /27점을 넘었어요/);
  assert.match(messages, /이미 숙련/);
  assert.match(messages, /숙련하지 않아서 전문화할 수 없어요/);
});
