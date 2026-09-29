// 캐릭터 카드 — BG3식 생성 절차(포인트 바이 · 숙련 · 전문화)를 따르되 세계관에는 묶이지 않는다.
// 출신 세계(origin)와 호칭(title)은 자유롭게 쓰고, 규칙상 선택은 원형 · 출신 특성 · 배경 세 가지다.
import { z } from "zod";
import {
  ABILITIES,
  type Ability,
  ARCHETYPES,
  type ArchetypeId,
  asiSlots,
  BACKGROUNDS,
  expertiseSlots,
  MAX_LEVEL,
  MAX_SCORE,
  modifier,
  ORIGIN_TRAITS,
  type OriginTraitId,
  POINT_BUY,
  pointBuyCost,
  proficiencyBonus,
  type Sheet,
  type Skill,
  SKILL_IDS,
  SKILLS,
} from "./rules";

const keysOf = <T extends string>(obj: Record<T, unknown>) => Object.keys(obj) as [T, ...T[]];
const AbilityEnum = z.enum(ABILITIES);
const SkillEnum = z.enum(SKILL_IDS as [Skill, ...Skill[]]);
const Text = z.string().trim().min(1);
const BaseScore = z.number().int().min(POINT_BUY.min).max(POINT_BUY.max);

export const Item = z.object({
  name: Text,
  kind: z.enum(["mundane", "tech", "magic", "anomaly"]).default("mundane"),
  note: Text.optional(),
});
export type Item = z.infer<typeof Item>;

export const CharacterShape = z.object({
  name: Text,
  title: Text, // 호칭: "해커", "엘프 궁수", "야근 요정" 등 자유
  origin: Text, // 출신 세계와 사연: "2026년 서울의 회사원. 퇴근길에 배에 올랐다"
  concept: Text, // 한 줄 컨셉
  archetype: z.enum(keysOf(ARCHETYPES)),
  origin_trait: z.enum(keysOf(ORIGIN_TRAITS)),
  background: z.enum([...keysOf(BACKGROUNDS), "custom"]),
  /** background가 custom일 때 직접 만든 배경 */
  custom_background: z.object({ name: Text, skills: z.tuple([SkillEnum, SkillEnum]), inspiration: Text }).optional(),
  level: z.number().int().min(1).max(MAX_LEVEL).default(1),
  /** 포인트 바이로 정한 기본 수치 (보너스 전) */
  base_scores: z.object({ str: BaseScore, dex: BaseScore, con: BaseScore, int: BaseScore, wis: BaseScore, cha: BaseScore }),
  /** BG3처럼 출신과 상관없이 +2 하나, +1 하나 */
  bonus: z.object({ plus2: AbilityEnum, plus1: AbilityEnum }),
  /** 레벨 4/8/12의 능력치 향상 (+1씩) */
  asi: z.array(AbilityEnum).default([]),
  archetype_skills: z.array(SkillEnum),
  /** 출신 특성이 주는 자유 기술 (다재다능) */
  bonus_skills: z.array(SkillEnum).default([]),
  expertise: z.array(SkillEnum).default([]),
  hp: z.number().int().optional(), // 없으면 최대 HP
  conditions: z.array(Text).default([]),
  items: z.array(Item).default([]),
});
export type Character = z.infer<typeof CharacterShape>;

export function backgroundOf(c: Pick<Character, "background" | "custom_background">) {
  if (c.background === "custom") return c.custom_background ?? null;
  return BACKGROUNDS[c.background];
}

export function finalScores(c: Pick<Character, "base_scores" | "bonus" | "asi">): Record<Ability, number> {
  const scores = { ...c.base_scores };
  scores[c.bonus.plus2] += 2;
  scores[c.bonus.plus1] += 1;
  for (const a of c.asi) scores[a] += 1;
  return scores;
}

type Trait = { skills?: readonly Skill[]; bonusSkillChoices?: number; lucky?: boolean; saveAdvantage?: readonly Ability[] };
const traitOf = (id: OriginTraitId) => ORIGIN_TRAITS[id] as Trait;
type Arch = { skillChoices: number; skillOptions: readonly Skill[] | "any"; hitDie: number; saves: readonly Ability[] };
const archOf = (id: ArchetypeId) => ARCHETYPES[id] as Arch;

/** 출신 특성과 배경이 자동으로 주는 기술 */
function grantedSkills(c: Pick<Character, "origin_trait" | "background" | "custom_background">): Skill[] {
  return [...(traitOf(c.origin_trait).skills ?? []), ...(backgroundOf(c)?.skills ?? [])];
}

export function proficientSkills(c: Character): Skill[] {
  return [...new Set([...grantedSkills(c), ...c.archetype_skills, ...c.bonus_skills])];
}

export const CharacterSchema = CharacterShape.superRefine((c, ctx) => {
  const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const arch = archOf(c.archetype);
  const trait = traitOf(c.origin_trait);
  const skillName = (s: Skill) => SKILLS[s].name;

  if (c.background === "custom") {
    if (!c.custom_background) fail(["custom_background"], "배경을 직접 만들려면 custom_background를 채워 주세요");
    else if (c.custom_background.skills[0] === c.custom_background.skills[1])
      fail(["custom_background", "skills"], "배경 기술 두 개는 서로 달라야 해요");
  }

  const cost = pointBuyCost(c.base_scores);
  if (cost > POINT_BUY.budget) fail(["base_scores"], `포인트 바이 ${cost}점 — ${POINT_BUY.budget}점을 넘었어요`);
  if (c.bonus.plus2 === c.bonus.plus1) fail(["bonus"], "+2와 +1은 서로 다른 능력치에 줘야 해요");

  if (c.asi.length !== asiSlots(c.level))
    fail(["asi"], `레벨 ${c.level}에서는 능력치 향상을 ${asiSlots(c.level)}번 골라야 해요 (지금 ${c.asi.length}번)`);
  const scores = finalScores(c);
  for (const a of ABILITIES) if (scores[a] > MAX_SCORE) fail(["asi"], `${a}가 ${MAX_SCORE}을 넘어요`);

  const granted = new Set(grantedSkills(c));
  if (c.archetype_skills.length !== arch.skillChoices)
    fail(["archetype_skills"], `이 원형은 기술을 ${arch.skillChoices}개 골라야 해요 (지금 ${c.archetype_skills.length}개)`);
  c.archetype_skills.forEach((s, i) => {
    if (arch.skillOptions !== "any" && !arch.skillOptions.includes(s))
      fail(["archetype_skills", i], `${skillName(s)}은(는) 이 원형이 고를 수 있는 기술이 아니에요`);
    if (granted.has(s)) fail(["archetype_skills", i], `${skillName(s)}은(는) 출신 특성이나 배경에서 이미 숙련했어요`);
  });

  const bonusCount = trait.bonusSkillChoices ?? 0;
  if (c.bonus_skills.length !== bonusCount)
    fail(["bonus_skills"], `이 출신 특성은 자유 기술을 ${bonusCount}개 골라야 해요 (지금 ${c.bonus_skills.length}개)`);

  const picked = [...granted, ...c.archetype_skills, ...c.bonus_skills];
  if (new Set(picked).size !== picked.length) fail(["archetype_skills"], "같은 기술을 두 번 골랐어요");

  const slots = expertiseSlots(c.archetype, c.level);
  if (c.expertise.length !== slots)
    fail(["expertise"], `레벨 ${c.level}에서는 전문화를 ${slots}개 골라야 해요 (지금 ${c.expertise.length}개)`);
  c.expertise.forEach((s, i) => {
    if (!picked.includes(s)) fail(["expertise", i], `${skillName(s)}에 숙련하지 않아서 전문화할 수 없어요`);
  });
  if (new Set(c.expertise).size !== c.expertise.length) fail(["expertise"], "같은 전문화를 두 번 골랐어요");
});

export function maxHp(c: Pick<Character, "archetype" | "level">, conScore: number): number {
  const die = archOf(c.archetype).hitDie;
  const con = modifier(conScore);
  const later = Math.max(1, Math.floor(die / 2) + 1 + con); // 2레벨부터는 평균값
  return Math.max(1, die + con) + later * (c.level - 1);
}

export function deriveSheet(c: Character): Sheet {
  const scores = finalScores(c);
  const trait = traitOf(c.origin_trait);
  return {
    name: c.name,
    level: c.level,
    scores,
    proficiency: proficiencyBonus(c.level),
    proficientSkills: proficientSkills(c),
    expertise: c.expertise,
    saveProficiencies: [...archOf(c.archetype).saves],
    saveAdvantage: [...(trait.saveAdvantage ?? [])],
    lucky: trait.lucky ?? false,
    maxHp: maxHp(c, scores.con),
  };
}

/**
 * 이정표 성장(LGMRD): 섬 하나를 마칠 때마다 1레벨.
 * 능력치 향상과 전문화 자리는 원형의 우선순위대로 자동으로 채운다.
 */
export function levelUp(c: Character): Character {
  if (c.level >= MAX_LEVEL) return c;
  const level = c.level + 1;
  const order = PRIORITY[c.archetype];
  const asi = [...c.asi];
  while (asi.length < asiSlots(level)) {
    const scores = finalScores({ ...c, asi });
    const next = order.find((a) => scores[a] < MAX_SCORE);
    if (!next) break;
    asi.push(next);
  }
  const expertise = [...c.expertise];
  const proficient = proficientSkills(c).sort((a, b) => order.indexOf(SKILLS[a].ability) - order.indexOf(SKILLS[b].ability));
  for (const s of proficient) {
    if (expertise.length >= expertiseSlots(c.archetype, level)) break;
    if (!expertise.includes(s)) expertise.push(s);
  }
  return CharacterSchema.parse({ ...c, level, asi, expertise, hp: undefined });
}

// ── 빠른 생성 ─────────────────────────────────────────────────────

/** 원형별 능력치 우선순위 (포인트 바이 15·14·13·12·10·8 순으로 배정) */
const PRIORITY: Record<ArchetypeId, Ability[]> = {
  vanguard: ["str", "con", "dex", "wis", "cha", "int"],
  shadow: ["dex", "int", "cha", "wis", "con", "str"],
  envoy: ["cha", "dex", "con", "wis", "int", "str"],
  scholar: ["int", "wis", "con", "dex", "cha", "str"],
  adept: ["cha", "con", "dex", "wis", "int", "str"],
  guardian: ["str", "cha", "con", "wis", "dex", "int"],
  healer: ["wis", "con", "int", "dex", "cha", "str"],
  tracker: ["dex", "wis", "con", "str", "int", "cha"],
  tinker: ["int", "con", "dex", "wis", "cha", "str"],
};
const STANDARD = [15, 14, 13, 12, 10, 8]; // 포인트 바이 27점

export type QuickBuildInput = Pick<Character, "name" | "title" | "origin" | "concept" | "archetype" | "origin_trait"> & {
  background: Exclude<Character["background"], "custom">;
  items?: Item[];
};

/** 필수 선택만 받아 규칙에 맞는 캐릭터를 자동으로 완성한다 (레벨 1) */
export function quickBuild(input: QuickBuildInput): Character {
  const order = PRIORITY[input.archetype];
  const base_scores = Object.fromEntries(order.map((a, i) => [a, STANDARD[i]])) as Record<Ability, number>;
  const arch = archOf(input.archetype);
  const draft = { ...input, custom_background: undefined };
  const taken = new Set(grantedSkills(draft));

  // 원형 기술: 선택지 중 주 능력치에 가까운 것부터
  const options = arch.skillOptions === "any" ? SKILL_IDS : [...arch.skillOptions];
  const byPriority = [...options].sort((a, b) => order.indexOf(SKILLS[a].ability) - order.indexOf(SKILLS[b].ability));
  const archetype_skills = byPriority.filter((s) => !taken.has(s)).slice(0, arch.skillChoices);
  archetype_skills.forEach((s) => taken.add(s));

  const bonusCount = traitOf(input.origin_trait).bonusSkillChoices ?? 0;
  const bonus_skills = [...SKILL_IDS]
    .sort((a, b) => order.indexOf(SKILLS[a].ability) - order.indexOf(SKILLS[b].ability))
    .filter((s) => !taken.has(s))
    .slice(0, bonusCount);

  const proficient = [...taken, ...bonus_skills];
  const expertise = proficient
    .sort((a, b) => order.indexOf(SKILLS[a].ability) - order.indexOf(SKILLS[b].ability))
    .slice(0, expertiseSlots(input.archetype, 1));

  return CharacterSchema.parse({
    ...input,
    level: 1,
    base_scores,
    bonus: { plus2: order[0], plus1: order[1] },
    archetype_skills,
    bonus_skills,
    expertise,
    items: input.items ?? [],
  });
}

/** 테스트용 미리 만든 캐릭터 — 서로 다른 세계에서 왔다 */
export const PREGENS: QuickBuildInput[] = [
  {
    name: "건희", title: "사기꾼 마술사", origin: "2020년대 서울. 길거리 마술로 먹고살다 빚쟁이를 피해 배에 탔다",
    concept: "손은 눈보다 빠르고 입은 손보다 빠르다", archetype: "shadow", origin_trait: "lucky", background: "charlatan",
    items: [{ name: "스마트폰", kind: "tech", note: "배터리 34%" }, { name: "트릭 카드 한 벌", kind: "mundane" }],
  },
  {
    name: "세라핀", title: "파문당한 성기사", origin: "용과 신들이 있는 대륙. 맹세를 어긴 대가로 교단에서 쫓겨났다",
    concept: "다시는 약자를 버리지 않겠다", archetype: "guardian", origin_trait: "sturdy", background: "believer",
    items: [{ name: "금 간 성검", kind: "magic" }, { name: "교단 휘장", kind: "mundane" }],
  },
  {
    name: "K-7", title: "폐기된 안드로이드", origin: "궤도 도시의 가사 로봇. 폐기 직전 탈출했다",
    concept: "사람이 되고 싶은지 아직 모르겠다", archetype: "tinker", origin_trait: "otherworldly", background: "engineer",
    items: [{ name: "만능 공구 팔", kind: "tech" }, { name: "주인의 사진", kind: "mundane" }],
  },
  {
    name: "도윤", title: "야근 괴담 연구가", origin: "현대의 대학원생. 괴담을 쫓다 안개 낀 바다에 들어섰다",
    concept: "무서운 건 싫지만 궁금한 건 못 참는다", archetype: "scholar", origin_trait: "versatile", background: "researcher",
    items: [{ name: "녹음기", kind: "tech" }, { name: "부적 몇 장", kind: "magic", note: "진짜인지는 모름" }],
  },
  {
    name: "라온", title: "떠돌이 무희", origin: "사막의 오아시스 왕국. 춤으로 정령을 부르는 부족 출신",
    concept: "무대가 있는 곳이 집이다", archetype: "envoy", origin_trait: "keen_senses", background: "entertainer",
    items: [{ name: "방울 달린 발찌", kind: "magic" }, { name: "비단 베일", kind: "mundane" }],
  },
];
