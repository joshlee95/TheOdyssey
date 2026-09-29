// 판정 규칙 — 발더스 게이트 3(D&D 5e)의 판정 뼈대를 쓰되, 특정 세계관에 묶이지 않게 바꿨다.
// 섬마다 현대·판타지·SF 등 세계가 다르므로, 캐릭터는 세계 중립적인 수치만 갖고
// 그 능력이 어떤 모습으로 드러나는지는 섬의 현실 규칙(island.world.reality)에 따라 GM이 서술한다.
//
// d20 + 능력 수정치 + (숙련이면 숙련 보너스, 전문화면 2배) ≥ DC 이면 성공.
// BG3처럼 기술 판정에서도 자연 20은 무조건 성공, 자연 1은 무조건 실패.

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export const ABILITY_NAMES: Record<Ability, string> = {
  str: "근력",
  dex: "민첩",
  con: "건강",
  int: "지능",
  wis: "지혜",
  cha: "매력",
};

// D&D 5e의 18개 기술에서 판타지 전용(비전·종교·동물 조련)을 세계 중립적으로 바꾸고 '기술 공학'을 넣었다.
export const SKILLS = {
  athletics: { name: "운동", ability: "str", covers: "달리기, 오르기, 수영, 힘겨루기" },
  acrobatics: { name: "곡예", ability: "dex", covers: "균형, 구르기, 파쿠르, 탈출" },
  sleight_of_hand: { name: "손재주", ability: "dex", covers: "소매치기, 바꿔치기, 자물쇠, 섬세한 손기술" },
  stealth: { name: "은신", ability: "dex", covers: "숨기, 미행, 소리 없이 움직이기" },
  occult: { name: "신비학", ability: "int", covers: "마법, 초능력, 괴이, 저주 등 초자연 현상에 대한 지식" },
  lore: { name: "학식", ability: "int", covers: "역사, 문화, 종교, 법, 관습" },
  investigation: { name: "조사", ability: "int", covers: "단서 찾기, 추리, 문서·기록 분석" },
  technology: { name: "기술 공학", ability: "int", covers: "기계, 전자, 해킹, 탈것 조작, 낯선 장치 다루기" },
  nature: { name: "자연", ability: "int", covers: "동식물, 지형, 날씨, 생태" },
  empathy: { name: "교감", ability: "wis", covers: "동물이나 사람이 아닌 존재와 마음 통하기, 길들이기" },
  insight: { name: "통찰", ability: "wis", covers: "거짓말과 속마음 읽기" },
  medicine: { name: "의학", ability: "wis", covers: "응급 처치, 진단, 독과 약" },
  perception: { name: "감지", ability: "wis", covers: "보고 듣고 알아차리기" },
  survival: { name: "생존", ability: "wis", covers: "추적, 길 찾기, 야영, 먹을 것 구하기" },
  deception: { name: "기만", ability: "cha", covers: "거짓말, 변장, 연기로 속이기" },
  intimidation: { name: "위협", ability: "cha", covers: "겁주기, 압박, 기세" },
  performance: { name: "공연", ability: "cha", covers: "노래, 연주, 연설, 사람 모으기" },
  persuasion: { name: "설득", ability: "cha", covers: "협상, 부탁, 호감 사기" },
} as const satisfies Record<string, { name: string; ability: Ability; covers: string }>;
export type Skill = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as Skill[];

/** GM이 난이도를 정할 때 쓰는 표준 DC (BG3와 같은 단계) */
export const DC = {
  very_easy: 5,
  easy: 10,
  medium: 15,
  hard: 20,
  very_hard: 25,
  nearly_impossible: 30,
} as const;

/** NPC의 눈썰미 → 손재주·은신·기만으로 속일 때의 DC (NPC의 수동 감지/통찰) */
export const ALERTNESS_DC = { dull: 10, normal: 13, sharp: 16, uncanny: 19 } as const;
export type Alertness = keyof typeof ALERTNESS_DC;

/** 비밀 행동에 쓰인 기술 → 같은 자리에 있는 선원이 눈치채는지 비교할 수동 기술 */
export const OPPOSED_PASSIVE: Partial<Record<Skill, Skill>> = {
  sleight_of_hand: "perception",
  stealth: "perception",
  deception: "insight",
};

// ── 캐릭터 생성 데이터 ─────────────────────────────────────────────

/** BG3 포인트 바이: 27점, 종족 보너스 전 8~15 */
export const POINT_BUY = {
  budget: 27,
  min: 8,
  max: 15,
  cost: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 } as Record<number, number>,
};
export const MAX_SCORE = 20;
export const MAX_LEVEL = 12;
/** 이 레벨에 도달할 때마다 능력치 +1을 두 번 */
export const ASI_LEVELS = [4, 8, 12];

type ArchetypeDef = {
  name: string;
  /** BG3에서 비슷한 클래스 (참고용) */
  like: string;
  hitDie: 6 | 8 | 10 | 12;
  saves: readonly [Ability, Ability];
  skillChoices: number;
  skillOptions: readonly Skill[] | "any";
  /** [도달 레벨, 전문화 개수] */
  expertiseAt?: readonly (readonly [number, number])[];
  /** 대표 능력. 어떤 모습으로 드러나는지는 섬의 세계에 따라 다르다 */
  signature: string;
};

/** 원형(역할). 세계마다 겉모습은 달라도 하는 일은 같다. 캐릭터 호칭(title)은 자유롭게 붙인다 */
export const ARCHETYPES = {
  vanguard: {
    name: "투사", like: "파이터, 바바리안", hitDie: 10, saves: ["str", "con"], skillChoices: 2,
    skillOptions: ["athletics", "acrobatics", "intimidation", "perception", "survival", "empathy", "insight"],
    signature: "재기: 장면마다 한 번, 쓰러질 뻔한 순간에 다시 일어선다",
  },
  shadow: {
    name: "그림자", like: "로그", hitDie: 8, saves: ["dex", "int"], skillChoices: 4,
    skillOptions: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight_of_hand", "stealth", "technology"],
    expertiseAt: [[1, 2], [6, 2]],
    signature: "교활한 행동: 숨고, 빠지고, 틈을 찌른다",
  },
  envoy: {
    name: "달변가", like: "바드", hitDie: 8, saves: ["dex", "cha"], skillChoices: 3, skillOptions: "any",
    expertiseAt: [[3, 2], [10, 2]],
    signature: "영감: 장면마다 한 번, 동료의 다음 판정에 이점을 준다",
  },
  scholar: {
    name: "학자", like: "위자드", hitDie: 6, saves: ["int", "wis"], skillChoices: 2,
    skillOptions: ["occult", "lore", "insight", "investigation", "medicine", "technology", "nature"],
    signature: "박식: 처음 보는 세계의 현상도 장면마다 한 번은 원리를 짐작한다 (조사·신비학·기술 공학에 이점)",
  },
  adept: {
    name: "이능자", like: "소서러, 워락", hitDie: 6, saves: ["con", "cha"], skillChoices: 2,
    skillOptions: ["occult", "deception", "insight", "intimidation", "persuasion", "nature", "lore"],
    signature: "이능: 세계를 비트는 힘. 판타지 섬에서는 마법, 현대 섬에서는 초능력이나 괴이, SF 섬에서는 이식 장치로 드러난다",
  },
  guardian: {
    name: "수호자", like: "팔라딘", hitDie: 10, saves: ["wis", "cha"], skillChoices: 2,
    skillOptions: ["athletics", "insight", "intimidation", "medicine", "persuasion", "lore"],
    signature: "맹세: 지키기로 한 것을 위해 나설 때 강해진다. 맹세를 어기면 힘을 잃는다",
  },
  healer: {
    name: "치유사", like: "클레릭, 드루이드", hitDie: 8, saves: ["int", "wis"], skillChoices: 2,
    skillOptions: ["medicine", "insight", "nature", "lore", "persuasion", "empathy", "survival"],
    signature: "치유: 장면마다 한 번, 동료의 상처나 상태 이상 하나를 돌본다",
  },
  tracker: {
    name: "추적자", like: "레인저, 몽크", hitDie: 10, saves: ["str", "dex"], skillChoices: 3,
    skillOptions: ["empathy", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
    signature: "숙적과 지형: 한 종류의 적과 한 종류의 지형에 밝다",
  },
  tinker: {
    name: "기술자", like: "(BG3에 없음)", hitDie: 8, saves: ["con", "int"], skillChoices: 2,
    skillOptions: ["investigation", "technology", "sleight_of_hand", "medicine", "occult", "perception"],
    signature: "즉석 장치: 주변 물건으로 쓸 만한 도구를 만든다. 그 세계의 기술 수준에 맞는 모습으로",
  },
} as const satisfies Record<string, ArchetypeDef>;
export type ArchetypeId = keyof typeof ARCHETYPES;

type OriginTraitDef = {
  name: string;
  like: string;
  description: string;
  skills?: readonly Skill[];
  bonusSkillChoices?: number;
  lucky?: boolean; // d20에서 1이 나오면 다시 굴림
  saveAdvantage?: readonly Ability[];
};

/**
 * 출신 특성. 종족 대신 캐릭터가 어디서 왔든 고를 수 있는 특성 하나.
 * 출신 자체(예: "2026년 서울의 회사원", "숲의 엘프 궁수", "폐기된 안드로이드")는 character.origin에 자유롭게 쓴다.
 */
export const ORIGIN_TRAITS = {
  versatile: { name: "다재다능", like: "인간", description: "원하는 기술 하나에 숙련", bonusSkillChoices: 1 },
  keen_senses: { name: "예리한 감각", like: "엘프", description: "감지 숙련", skills: ["perception"] },
  lucky: { name: "행운", like: "하플링", description: "d20에서 1이 나오면 다시 굴린다", lucky: true },
  iron_will: { name: "굳센 정신", like: "노움", description: "지능·지혜·매력 내성 판정에 이점", saveAdvantage: ["int", "wis", "cha"] },
  sturdy: { name: "강인한 몸", like: "드워프", description: "건강 내성 판정에 이점", saveAdvantage: ["con"] },
  menacing: { name: "위압감", like: "하프오크", description: "위협 숙련", skills: ["intimidation"] },
  otherworldly: {
    name: "이질적 존재", like: "티플링, 기스양키",
    description: "신비학 숙련. 사람이 아닌 특징 하나(어둠을 보는 눈, 불에 강한 피부 등)를 정해 GM에게 알린다",
    skills: ["occult"],
  },
} as const satisfies Record<string, OriginTraitDef>;
export type OriginTraitId = keyof typeof ORIGIN_TRAITS;

type BackgroundDef = { name: string; skills: readonly [Skill, Skill]; inspiration: string };

/** 배경. inspiration: 이렇게 행동하면 GM이 영감을 준다 (BG3의 배경 목표). custom은 직접 만든다 */
export const BACKGROUNDS = {
  believer: { name: "신앙인", skills: ["insight", "lore"], inspiration: "믿음을 지키거나 그 뜻을 전할 때" },
  charlatan: { name: "사기꾼", skills: ["deception", "sleight_of_hand"], inspiration: "속임수로 이득을 챙길 때" },
  criminal: { name: "범죄자", skills: ["deception", "stealth"], inspiration: "법 바깥의 방식으로 일을 해결할 때" },
  entertainer: { name: "연예인", skills: ["acrobatics", "performance"], inspiration: "관객을 사로잡을 때" },
  folk_hero: { name: "민중 영웅", skills: ["empathy", "survival"], inspiration: "약자를 위해 나설 때" },
  artisan: { name: "장인", skills: ["insight", "persuasion"], inspiration: "솜씨나 거래로 일을 풀 때" },
  noble: { name: "상류층", skills: ["lore", "persuasion"], inspiration: "신분과 품위를 내세울 때" },
  outlander: { name: "방랑자", skills: ["athletics", "survival"], inspiration: "문명 밖의 지혜를 보여 줄 때" },
  researcher: { name: "연구자", skills: ["occult", "lore"], inspiration: "지식을 얻거나 나눌 때" },
  soldier: { name: "군인", skills: ["athletics", "intimidation"], inspiration: "규율과 용맹을 보여 줄 때" },
  urchin: { name: "부랑아", skills: ["sleight_of_hand", "stealth"], inspiration: "밑바닥 생존 요령으로 위기를 넘길 때" },
  engineer: { name: "엔지니어", skills: ["technology", "investigation"], inspiration: "고장 난 것을 고치거나 새로 만들어 낼 때" },
  medic: { name: "의료인", skills: ["medicine", "insight"], inspiration: "다친 사람을 외면하지 않을 때" },
} as const satisfies Record<string, BackgroundDef>;
export type BackgroundId = keyof typeof BACKGROUNDS | "custom";

/** 파티 공용 영감 최대치. 영감 1을 써서 실패한 판정을 다시 굴린다 */
export const MAX_INSPIRATION = 4;

// ── 계산 ─────────────────────────────────────────────────────────

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const proficiencyBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
export const asiSlots = (level: number) => 2 * ASI_LEVELS.filter((l) => l <= level).length;
export const expertiseSlots = (archetype: ArchetypeId, level: number) =>
  ((ARCHETYPES[archetype] as ArchetypeDef).expertiseAt ?? []).reduce((n, [at, count]) => (at <= level ? n + count : n), 0);

export function pointBuyCost(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((sum, a) => sum + (POINT_BUY.cost[scores[a]] ?? Infinity), 0);
}

/** 판정에 필요한 모든 수치 (character.ts의 deriveSheet가 만든다) */
export type Sheet = {
  name: string;
  level: number;
  scores: Record<Ability, number>;
  proficiency: number;
  proficientSkills: Skill[];
  expertise: Skill[];
  saveProficiencies: Ability[];
  saveAdvantage: Ability[];
  lucky: boolean;
  maxHp: number;
};

export type Check =
  | { type: "skill"; skill: Skill }
  | { type: "ability"; ability: Ability }
  | { type: "save"; ability: Ability };

export function checkBonus(sheet: Sheet, check: Check): number {
  if (check.type === "skill") {
    const base = modifier(sheet.scores[SKILLS[check.skill].ability]);
    if (!sheet.proficientSkills.includes(check.skill)) return base;
    return base + sheet.proficiency * (sheet.expertise.includes(check.skill) ? 2 : 1);
  }
  const base = modifier(sheet.scores[check.ability]);
  if (check.type === "save" && sheet.saveProficiencies.includes(check.ability)) return base + sheet.proficiency;
  return base;
}

/** 수동 점수 (굴리지 않는 감지·통찰 등): 10 + 기술 보너스 */
export const passiveScore = (sheet: Sheet, skill: Skill) => 10 + checkBonus(sheet, { type: "skill", skill });

export type Advantage = "normal" | "advantage" | "disadvantage";

export type CheckResult = {
  check: Check;
  dc: number;
  advantage: Advantage;
  /** 굴린 d20 (행운으로 다시 굴렸다면 다시 굴린 값) */
  dice: number[];
  kept: number;
  bonus: number;
  total: number;
  success: boolean;
  critical: "success" | "fail" | null;
  /** total - dc. 비밀 행동에서 아슬아슬했는지 판단하는 데 쓴다 */
  margin: number;
  luckyReroll: boolean;
};

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function rollCheck(
  sheet: Sheet,
  check: Check,
  dc: number,
  opts: { advantage?: Advantage; rng?: () => number } = {},
): CheckResult {
  const rng = opts.rng ?? secureRandom;
  let advantage = opts.advantage ?? "normal";
  if (check.type === "save" && sheet.saveAdvantage.includes(check.ability))
    advantage = advantage === "disadvantage" ? "normal" : "advantage"; // 이점과 불리는 상쇄

  let luckyReroll = false;
  const d20 = () => {
    let v = Math.floor(rng() * 20) + 1;
    if (v === 1 && sheet.lucky) {
      luckyReroll = true;
      v = Math.floor(rng() * 20) + 1;
    }
    return v;
  };
  const dice = advantage === "normal" ? [d20()] : [d20(), d20()];
  const kept =
    advantage === "advantage" ? Math.max(...dice) : advantage === "disadvantage" ? Math.min(...dice) : dice[0];

  const bonus = checkBonus(sheet, check);
  const total = kept + bonus;
  const critical = kept === 20 ? "success" : kept === 1 ? "fail" : null;
  const success = critical ? critical === "success" : total >= dc;
  return { check, dc, advantage, dice, kept, bonus, total, success, critical, margin: total - dc, luckyReroll };
}

/** 판정 이름 (예: "손재주", "지혜 내성") */
export function checkLabel(check: Check): string {
  if (check.type === "skill") return SKILLS[check.skill].name;
  return check.type === "save" ? `${ABILITY_NAMES[check.ability]} 내성` : ABILITY_NAMES[check.ability];
}
