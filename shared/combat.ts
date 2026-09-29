// 전투 규칙 — SRD 5.2(CC BY 4.0)의 공격·피해·치명타·사망 내성 + Lazy GM's Resource Document(CC BY 4.0)의 즉석 적 수치.
// 수치 출처: shared/data/combat.json. 격자 없이 구역(zone)으로만 거리를 말한다.
import combat from "./data/combat.json" with { type: "json" };

export type Rng = () => number;
export const secureRandom: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const die = (sides: number, rng: Rng) => Math.floor(rng() * sides) + 1;

/** "2d6+3", "1d8", "7", "3d6-1" */
export function parseDice(expr: string): { count: number; sides: number; bonus: number } {
  const m = expr.replace(/\s+/g, "").match(/^(?:(\d*)d(\d+))?([+-]\d+)?$|^(\d+)$/i);
  if (!m) throw new Error(`주사위 식을 읽을 수 없어요: ${expr}`);
  if (m[4]) return { count: 0, sides: 0, bonus: Number(m[4]) };
  return { count: m[2] ? Number(m[1] || 1) : 0, sides: Number(m[2] ?? 0), bonus: Number(m[3] ?? 0) };
}

export function rollDice(expr: string, opts: { rng?: Rng; critical?: boolean } = {}): { rolls: number[]; total: number } {
  const rng = opts.rng ?? secureRandom;
  const { count, sides, bonus } = parseDice(expr);
  const n = opts.critical ? count * 2 : count; // 치명타: 주사위만 두 번
  const rolls = Array.from({ length: n }, () => die(sides, rng));
  return { rolls, total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + bonus) };
}

export const CONDITIONS = combat.conditions as { id: string; ko: string; effect: string; stacks?: number }[];
export const conditionName = (id: string) => CONDITIONS.find((c) => c.id === id)?.ko ?? id;

export type StatBlock = { id: string; ac: number; hp: number; cr: string; reskin: string };
export const STATBLOCKS = combat.npc_statblocks_reskin.list as StatBlock[];

export const crValue = (cr: string | number) => {
  if (typeof cr === "number") return cr;
  const [a, b] = cr.split("/").map(Number);
  return b ? a / b : a;
};

export type Combatant = {
  id: string;
  name: string;
  side: "crew" | "enemy";
  ac: number;
  hp: number;
  maxHp: number;
  attackBonus: number;
  damage: string;
  saveBonus: number;
  saveDc: number;
  conditions: string[];
  defeated: boolean;
  initiative: number;
};

/** LGMRD 즉석 적: AC·DC 12+CR/2, 명중·내성 3+CR/2, HP 20×CR, 단일 피해 CR당 2d6 (CR 1 미만은 SRD 인간형 블록 수준으로 보정) */
export function improvisedEnemy(name: string, cr: number, over: Partial<Combatant> = {}): Omit<Combatant, "id" | "initiative"> {
  const half = Math.floor(cr / 2);
  const hp = cr >= 1 ? Math.round(20 * cr) : Math.max(4, Math.round(40 * cr));
  const damage = cr >= 1 ? `${Math.round(2 * cr)}d6` : cr >= 0.5 ? "1d8+1" : cr >= 0.25 ? "1d6+1" : "1d4+1";
  return {
    name, side: "enemy", ac: 12 + half, hp, maxHp: hp, attackBonus: 3 + half, damage,
    saveBonus: 3 + half, saveDc: 12 + half, conditions: [], defeated: false, ...over,
  };
}

/** SRD 인간형 블록을 세계에 맞게 이름만 바꿔 쓴다 */
export function enemyFromStatBlock(name: string, statblockId: string): Omit<Combatant, "id" | "initiative"> {
  const sb = STATBLOCKS.find((s) => s.id === statblockId);
  if (!sb) throw new Error(`없는 능력치 블록: ${statblockId}. 가능한 값: ${STATBLOCKS.map((s) => s.id).join(", ")}`);
  return improvisedEnemy(name, crValue(sb.cr), { ac: sb.ac, hp: sb.hp, maxHp: sb.hp });
}

export type AttackResult = {
  d20: number;
  total: number;
  ac: number;
  hit: boolean;
  critical: boolean;
  damage: number;
  damageRolls: number[];
};

export function resolveAttack(
  attackBonus: number,
  ac: number,
  damage: string,
  opts: { advantage?: "normal" | "advantage" | "disadvantage"; rng?: Rng; damageBonus?: number } = {},
): AttackResult {
  const rng = opts.rng ?? secureRandom;
  const a = die(20, rng);
  const b = opts.advantage && opts.advantage !== "normal" ? die(20, rng) : a;
  const d20 = opts.advantage === "advantage" ? Math.max(a, b) : opts.advantage === "disadvantage" ? Math.min(a, b) : a;
  const critical = d20 === 20;
  const total = d20 + attackBonus;
  const hit = critical || (d20 !== 1 && total >= ac);
  if (!hit) return { d20, total, ac, hit, critical, damage: 0, damageRolls: [] };
  const dmg = rollDice(damage, { rng, critical });
  return { d20, total, ac, hit, critical, damage: Math.max(0, dmg.total + (opts.damageBonus ?? 0)), damageRolls: dmg.rolls };
}

export type DeathSaves = { successes: number; failures: number; stable: boolean };

/** SRD 5.2 사망 내성: 10 이상 성공, 1은 실패 2회, 20은 HP 1로 깨어남 */
export function rollDeathSave(state: DeathSaves, rng: Rng = secureRandom): { roll: number; state: DeathSaves; revived: boolean } {
  const roll = die(20, rng);
  if (roll === 20) return { roll, state: { successes: 0, failures: 0, stable: false }, revived: true };
  const next = { ...state };
  if (roll === 1) next.failures += 2;
  else if (roll >= 10) next.successes += 1;
  else next.failures += 1;
  if (next.successes >= 3) next.stable = true;
  return { roll, state: next, revived: false };
}

export const COMBAT_RULES_SUMMARY = {
  actions: (combat.actions as { ko: string; summary: string }[]).map((a) => `${a.ko}: ${a.summary}`),
  zones: combat.zones_lgmrd.principle,
  morale: combat.morale_cairn.rule,
  odysseyDeath: combat.zero_hp.odyssey_rule.note,
};
