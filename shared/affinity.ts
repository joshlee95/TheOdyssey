// 호감도 — 모든 NPC는 선원 한 명 한 명, 그리고 다른 NPC에 대해 -100 ~ 100의 호감도를 갖는다.
// 단계가 바뀌면 행동이 바뀌고(island.npcs[].behaviors), 사회 판정에 이점/불리가 붙는다.
// 누군가 보는 앞에서 일어난 일은 그 NPC와 가까운(또는 적대하는) NPC에게 소문으로 번진다.
import type { Advantage, Skill } from "./rules";

export const AFFINITY_MIN = -100;
export const AFFINITY_MAX = 100;

export const TIERS = [
  { id: "hostile", name: "적대", min: -100, default: "방해하고, 속이고, 기회가 오면 해친다" },
  { id: "wary", name: "불신", min: -59, default: "거래를 꺼리거나 값을 올리고, 정보를 숨기고, 지켜본다" },
  { id: "neutral", name: "중립", min: -19, default: "제 할 일을 한다. 대가가 있으면 돕는다" },
  { id: "friendly", name: "호의", min: 20, default: "먼저 말을 걸고, 작은 부탁은 들어주고, 아는 것을 알려 준다" },
  { id: "trusted", name: "신뢰", min: 60, default: "비밀을 털어놓고, 위험을 감수하고 돕고, 동행을 자청한다" },
  { id: "bonded", name: "유대", min: 90, default: "목숨을 걸고 편을 든다. 서로가 원하면 연애 관계로 발전할 수 있다" },
] as const;
export type TierId = (typeof TIERS)[number]["id"];
export const TIER_IDS = TIERS.map((t) => t.id) as [TierId, ...TierId[]];

export function tierOf(value: number): (typeof TIERS)[number] {
  for (let i = TIERS.length - 1; i >= 0; i--) if (value >= TIERS[i].min) return TIERS[i];
  return TIERS[0];
}
export const tierRank = (id: TierId) => TIER_IDS.indexOf(id);
export const atLeast = (value: number, tier: TierId) => tierRank(tierOf(value).id) >= tierRank(tier);

const SOCIAL: Skill[] = ["persuasion", "deception", "performance", "intimidation"];

/** 이 NPC를 상대로 한 사회 판정의 이점/불리. 위협은 호감과 무관하다 */
export function socialAdvantage(value: number, skill: Skill): Advantage {
  if (!SOCIAL.includes(skill) || skill === "intimidation") return "normal";
  const tier = tierOf(value).id;
  if (tier === "hostile") return "disadvantage";
  if (tier === "wary" && skill === "persuasion") return "disadvantage";
  if ((tier === "trusted" || tier === "bonded") && skill !== "deception") return "advantage";
  return "normal";
}

/** from이 to를 어떻게 여기는가. to는 선원 id 또는 NPC id */
export type Bond = { value: number; memories: string[] };
export type AffinityState = Record<string, Record<string, Bond>>;

export const MEMORY_LIMIT = 5;
/** 소문이 번지는 비율 */
export const GOSSIP_RATE = 0.3;
/** 이 이상 가깝거나(+) 이 이하로 적대적인(-) NPC에게만 소문이 번진다 */
export const GOSSIP_THRESHOLD = 20;

export type AffinityChange = {
  from: string; // NPC id
  to: string; // 선원 id 또는 NPC id
  delta: number;
  reason: string;
  /** 다른 사람이 보거나 들을 수 있었던 일인가 → 소문으로 번짐 */
  witnessed: boolean;
};

export type AffinityUpdate = {
  from: string;
  to: string;
  before: number;
  after: number;
  tierChanged: boolean;
  via: "direct" | "gossip";
};

const clamp = (v: number) => Math.max(AFFINITY_MIN, Math.min(AFFINITY_MAX, Math.round(v)));

export function bond(state: AffinityState, from: string, to: string, initial = 0): Bond {
  const row = (state[from] ??= {});
  return (row[to] ??= { value: clamp(initial), memories: [] });
}

function shift(state: AffinityState, from: string, to: string, delta: number, memory: string, via: AffinityUpdate["via"]): AffinityUpdate {
  const b = bond(state, from, to);
  const before = b.value;
  b.value = clamp(before + delta);
  b.memories = [...b.memories, memory].slice(-MEMORY_LIMIT);
  return { from, to, before, after: b.value, tierChanged: tierOf(before).id !== tierOf(b.value).id, via };
}

/**
 * 호감도를 바꾸고, 목격된 일이면 소문을 번지게 한다 (한 단계만, 연쇄 없음).
 * X가 from을 좋아하면 from과 같은 방향으로, 싫어하면 반대 방향으로 X→to가 움직인다.
 */
export function applyAffinityChange(state: AffinityState, change: AffinityChange): AffinityUpdate[] {
  const updates = [shift(state, change.from, change.to, change.delta, change.reason, "direct")];
  if (!change.witnessed) return updates;

  for (const [x, row] of Object.entries(state)) {
    if (x === change.from || x === change.to) continue;
    const toward = row[change.from]?.value;
    if (toward === undefined || Math.abs(toward) < GOSSIP_THRESHOLD) continue;
    const delta = Math.round(change.delta * GOSSIP_RATE * Math.sign(toward));
    if (delta === 0) continue;
    updates.push(shift(state, x, change.to, delta, `(${change.from}에게서 들음) ${change.reason}`, "gossip"));
  }
  return updates;
}
