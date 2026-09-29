// Portions Copyright (c) 2026 heojunfo
// 게임 방 하나의 상태와 규칙 실행. 서버가 유일한 진실의 원천이고, 선원마다 보이는 것을 걸러서 내보낸다.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  type AffinityState,
  applyAffinityChange,
  bond,
  MEMORY_LIMIT,
  socialAdvantage,
  tierOf,
} from "../shared/affinity";
import { type Character, deriveSheet, type Item, levelUp } from "../shared/character";
import type { Island } from "../shared/island";
import {
  ABILITIES,
  type Ability,
  type Advantage,
  ALERTNESS_DC,
  type Check,
  checkLabel,
  type CheckResult,
  MAX_INSPIRATION,
  OPPOSED_PASSIVE,
  passiveScore,
  rollCheck,
  type Sheet,
  type Skill,
  SKILL_IDS,
} from "../shared/rules";
import { canSeeSecret, parseAction, type SecretAction } from "../shared/secret-action";
import {
  type Combatant, conditionName, crValue, type DeathSaves, enemyFromStatBlock, improvisedEnemy, resolveAttack, rollDice, rollDeathSave,
} from "../shared/combat";
import { buyPrice, formatCoin, fromBits, haggleTier, sellPrice, STARTING_BITS, type Tech, toBits } from "../shared/economy";
import { ALERTNESS_DC as ALERT, modifier } from "../shared/rules";
import narrative from "../shared/data/narrative.json" with { type: "json" };
import { TOOL_INPUTS, type ToolInput, type ToolName } from "./gm/tools";

export type Rating = "all" | "teen" | "mature";
export const RATING_RANK: Record<Rating, number> = { all: 0, teen: 1, mature: 2 };
export const RATING_NAMES: Record<Rating, string> = { all: "전체 이용가", teen: "15세", mature: "성인" };

export type Player = {
  id: string;
  nickname: string;
  character: Character | null;
  sheet: Sheet | null;
  hp: number;
  conditions: string[];
  items: Item[];
  blessings: { id: string; islandId: string; name: string; effect: string; lasts: "island" | "campaign" }[];
  connected: boolean;
  /** 돈 (bit = 0.01코인) */
  coins: number;
  /** 방어구·방패로 더하는 AC (맨몸 AC = 10 + 민첩) */
  armorBonus: number;
  deathSaves: DeathSaves | null;
};

export type LogEntry = { id: number; at: number } & (
  | { type: "narration"; text: string }
  | { type: "action"; playerId: string; kind: ActionKind; publicText: string; hiddenIds: string[] }
  | { type: "roll"; playerId: string; label: string; result: CheckResult; hiddenActionId?: string; reason: string }
  | { type: "system"; text: string; to?: string[] }
  | { type: "whisper"; to: string; text: string }
  | { type: "reveal"; hiddenActionId: string; note: string }
  | { type: "affinity"; to: string; npcName: string; delta: number; tierChange?: [string, string] }
  | { type: "chat"; playerId: string; text: string }
);
type LogInput = LogEntry extends infer E ? (E extends LogEntry ? Omit<E, "id" | "at"> : never) : never;

export type ActionKind = "do" | "say" | "pass";
type Pending = { kind: ActionKind; text: string; useInspiration: boolean };

export type Visit = {
  islandId: string;
  island: Island;
  round: number;
  act: number;
  clock: number;
  location: string;
  discovered: string[];
  islandSecrets: Record<string, "hint" | "full">;
  firedEvents: string[];
  trials: Record<string, "success" | "fail">;
  affinity: AffinityState;
  rulings: string[];
  /** crisis 외의 진행 시계 */
  clocks: Record<string, { name: string; segments: number; filled: number; type: string }>;
  aspects: string[];
  /** 상인 id → 선원 id → 흥정 결과 배율 */
  haggles: Record<string, Record<string, { buy: number | null; sell: number | null }>>;
  combat: { round: number; order: { id: string; name: string; initiative: number; side: "crew" | "enemy" }[]; enemies: Record<string, Combatant>; zones: string[]; fallen: number; moraleChecks: number } | null;
  /** GM(Claude) 대화 기록 — 섬 하나 동안 이어 쓴다 */
  messages: unknown[];
  exitId?: string;
};

export type Phase = "lobby" | "round_open" | "resolving" | "island_ended";

export type RoundInput = {
  actions: { player: Player; kind: ActionKind; publicText: string; hidden: SecretAction[] }[];
  xcards: number;
  opening: boolean;
  deathNotes?: string[];
};

export interface GM {
  readonly name: string;
  /** 한 라운드를 진행한다. 서술 텍스트를 돌려주고, 도구는 game.runTool로 실행한다 */
  runRound(game: Game, input: RoundInput, hooks: { onText: (delta: string) => void; streaming: boolean }): Promise<string>;
  /** 섬을 떠날 때 항해일지에 남길 요약 */
  summarize(game: Game): Promise<string>;
}

const newId = () => randomBytes(6).toString("hex");
const POSITIONS = narrative.position.levels as { id: string; ko: string; on_fail: string; on_cost: string }[];
const ORACLE = narrative.oracle_ironsworn as { odds: { id: string; ko: string; yes_if_d100_at_least: number }[] };
const COMBAT_RULES = "행동 1회(공격·질주·이탈·회피·돕기·숨기·영향 주기·이능·대비·살피기·궁리·조작) + 이동 + 추가 행동/반응. 거리는 25ft 구역 단위로 말한다. 적 차례에는 attack을 적 id로 부른다.";

export class Game extends EventEmitter {
  readonly code: string;
  hostId = "";
  rating: Rating;
  phase: Phase = "lobby";
  players = new Map<string, Player>();
  log: LogEntry[] = [];
  hiddenActions: SecretAction[] = [];
  inspiration = 0;
  shipHold: { islandId: string; id: string; name: string; kind: string; power: string }[] = [];
  shipLog: string[] = [];
  visit: Visit | null = null;
  pending = new Map<string, Pending>();
  xcards = 0;
  private logSeq = 0;
  private hiddenSeq = 0;
  /** 라운드 서술 뒤에 공개할 탄로 */
  private deferred: LogInput[] = [];
  private usedInspiration = new Set<string>();
  /** 선원 id → 재접속 토큰. 본인에게만 알려 주고 snapshot에는 넣지 않는다 (id는 모두에게 보이므로) */
  private resumeTokens = new Map<string, string>();

  constructor(code: string, rating: Rating) {
    super();
    this.code = code;
    this.rating = rating;
  }

  // ── 방 · 선원 ─────────────────────────────────────────────────

  join(nickname: string): Player {
    const player: Player = {
      id: newId(), nickname, character: null, sheet: null, hp: 0, conditions: [], items: [], blessings: [], connected: true,
      coins: STARTING_BITS, armorBonus: 0, deathSaves: null,
    };
    this.players.set(player.id, player);
    this.resumeTokens.set(player.id, randomBytes(16).toString("hex"));
    if (!this.hostId) this.hostId = player.id;
    this.addLog({ type: "system", text: `${nickname}님이 배에 올랐습니다.` });
    this.changed();
    return player;
  }

  /** 재접속 토큰 — 선원 본인에게만 돌려준다 */
  resumeToken(playerId: string): string {
    return this.resumeTokens.get(playerId)!;
  }

  checkResumeToken(playerId: string, token: unknown): boolean {
    const want = this.resumeTokens.get(playerId);
    if (!want || typeof token !== "string" || token.length !== want.length) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(want));
  }

  setCharacter(playerId: string, character: Character) {
    const p = this.mustPlayer(playerId);
    // 섬에 있는 동안 캐릭터를 갈아 끼우면 HP·상태가 초기화되므로 막는다 (처음 만드는 것은 된다)
    if (p.character && this.visit && this.phase !== "island_ended") throw new Error("섬에 있는 동안에는 캐릭터를 바꿀 수 없어요");
    p.character = character;
    p.sheet = deriveSheet(character);
    p.hp = Math.max(0, Math.min(p.sheet.maxHp, character.hp ?? p.sheet.maxHp));
    p.conditions = [...character.conditions];
    p.items = [...character.items];
    this.addLog({ type: "system", text: `${p.nickname}님의 캐릭터: ${character.name} (${character.title})` });
    this.changed();
  }

  get crew(): Player[] {
    return [...this.players.values()].filter((p) => p.character);
  }

  effectiveRating(): Rating {
    if (!this.visit) return this.rating;
    const island = this.visit.island.meta.content.rating;
    return RATING_RANK[island] < RATING_RANK[this.rating] ? island : this.rating;
  }

  // ── 섬 ────────────────────────────────────────────────────────

  async startIsland(island: Island, gm: GM) {
    if (this.phase === "resolving") throw new Error("라운드 진행 중에는 섬을 바꿀 수 없어요");
    if (!this.crew.length) throw new Error("캐릭터를 만든 선원이 없어요");
    const affinity: AffinityState = {};
    for (const npc of island.npcs) {
      for (const p of this.crew) bond(affinity, npc.id, p.id, npc.affinity);
      for (const r of npc.relations) bond(affinity, npc.id, r.npc, r.affinity);
    }
    this.visit = {
      islandId: island.id, island, round: 0, act: 1, clock: 0,
      location: island.world.start_location,
      discovered: island.locations.filter((l) => !l.hidden).map((l) => l.id),
      islandSecrets: {}, firedEvents: [], trials: {}, affinity, rulings: [], messages: [],
      clocks: {}, aspects: [], haggles: {}, combat: null,
    };
    for (const p of this.players.values()) p.blessings = p.blessings.filter((b) => b.lasts === "campaign");
    this.inspiration = Math.max(this.inspiration, 2); // 상륙할 때 영감을 최소 2로 (Fate의 refresh)
    this.addLog({ type: "system", text: `⛵ ${island.meta.title} — ${island.meta.tagline}` });
    await this.resolveRound(gm, { opening: true });
  }

  // ── 라운드 ────────────────────────────────────────────────────

  submitAction(playerId: string, action: Pending) {
    if (this.phase !== "round_open") throw new Error("지금은 행동을 제출할 수 없어요");
    const p = this.mustPlayer(playerId);
    if (!p.character) throw new Error("캐릭터를 먼저 만들어 주세요");
    if (action.useInspiration && this.inspiration <= 0) throw new Error("남은 영감이 없어요");
    this.pending.set(playerId, action);
    this.changed();
  }

  retractAction(playerId: string) {
    if (this.phase !== "round_open") return;
    this.pending.delete(playerId);
    this.changed();
  }

  allSubmitted(): boolean {
    const active = this.crew.filter((p) => p.connected);
    return active.length > 0 && active.every((p) => this.pending.has(p.id));
  }

  xcard() {
    this.xcards++;
    this.addLog({ type: "system", text: "✋ 누군가 X카드를 사용했습니다. 다음 서술에서 장면의 방향이 바뀝니다." });
  }

  async resolveRound(gm: GM, opts: { opening?: boolean } = {}) {
    const visit = this.visit;
    if (!visit) throw new Error("섬에 상륙하지 않았어요");
    if (!opts.opening && (this.phase !== "round_open" || this.pending.size === 0)) return;

    this.phase = "resolving";
    this.usedInspiration.clear();
    const deathNotes = opts.opening ? [] : this.deathSaveTick();
    const actions: RoundInput["actions"] = [];
    for (const [playerId, a] of this.pending) {
      const player = this.mustPlayer(playerId);
      const parsed = parseAction(a.kind === "pass" ? "(관망한다)" : a.text);
      const publicText = a.kind === "pass" ? "지켜본다" : parsed.publicText;
      const hidden = a.kind === "pass" ? [] : parsed.secrets.map((secret) => this.recordHidden(player.id, publicText, secret));
      this.addLog({ type: "action", playerId, kind: a.kind, publicText, hiddenIds: hidden.map((h) => h.id) });
      if (a.useInspiration) this.usedInspiration.add(playerId);
      actions.push({ player, kind: a.kind, publicText, hidden });
    }
    this.pending.clear();
    const xcards = this.xcards;
    this.xcards = 0;
    this.changed();

    // 새 비밀 행동이 있는 라운드는 누출 검사를 위해 서술을 모았다가 한 번에 보낸다
    const streaming = !actions.some((a) => a.hidden.length);
    this.emit("gm:status", "thinking");
    let narration = "";
    try {
      narration = await gm.runRound(this, { actions, xcards, opening: !!opts.opening, deathNotes }, {
        streaming,
        onText: (delta) => streaming && this.emit("gm:delta", delta),
      });
    } catch (err) {
      this.addLog({ type: "system", text: `⚠️ GM 오류: ${(err as Error).message}. 이번 라운드 행동은 GM에게 전달돼 있으니, 다시 내지 말고 다음 행동을 이어서 제출해 주세요.` });
      console.error(err);
    }
    this.emit("gm:status", "idle");

    if (narration.trim()) this.addLog({ type: "narration", text: narration.trim() });
    for (const d of this.deferred.splice(0)) this.addLog(d);
    visit.round++;
    if (visit.combat) visit.combat.round++;

    if (visit.exitId) {
      this.phase = "island_ended";
      const summary = await gm.summarize(this).catch(() => `${visit.island.meta.title}을(를) 떠났다.`);
      this.shipLog.push(`[${visit.island.meta.title}] ${summary}`);
      // 이정표 성장: 섬 하나를 마칠 때마다 1레벨, HP는 늘어난 만큼 회복
      for (const p of this.crew) {
        const next = levelUp(p.character!);
        if (next.level === p.character!.level) continue;
        const before = p.sheet!.maxHp;
        p.character = next;
        p.sheet = deriveSheet(next);
        p.hp = Math.min(p.sheet.maxHp, p.hp + (p.sheet.maxHp - before));
        this.addLog({ type: "system", text: `⬆️ ${next.name} 레벨 ${next.level} — 최대 HP ${p.sheet.maxHp}, 숙련 보너스 +${p.sheet.proficiency}` });
      }
      this.addLog({ type: "system", text: `📜 항해일지: ${summary}` });
    } else {
      this.phase = "round_open";
    }
    this.changed();
  }

  private recordHidden(playerId: string, publicText: string, secret: string): SecretAction {
    const h: SecretAction = {
      id: `h-${++this.hiddenSeq}`, playerId, round: this.visit?.round ?? 0, publicText, secret, status: "hidden", knownBy: [],
    };
    this.hiddenActions.push(h);
    return h;
  }

  confess(playerId: string, hiddenId: string) {
    const h = this.hiddenActions.find((x) => x.id === hiddenId && x.playerId === playerId);
    if (!h || h.status !== "hidden") throw new Error("공개할 수 있는 비밀 행동이 아니에요");
    h.status = "confessed";
    h.revealNote = `${this.nameOf(playerId)}이(가) 스스로 밝혔습니다: ${h.secret}`;
    this.addLog({ type: "reveal", hiddenActionId: h.id, note: h.revealNote });
    this.changed();
  }

  chat(playerId: string, text: string) {
    this.addLog({ type: "chat", playerId, text });
  }

  // ── GM 도구 실행 ──────────────────────────────────────────────

  runTool(name: string, raw: unknown): { ok: true; result: unknown } | { ok: false; error: string } {
    if (!(name in TOOL_INPUTS)) return { ok: false, error: `없는 도구: ${name}` };
    const parsed = TOOL_INPUTS[name as ToolName].safeParse(raw);
    if (!parsed.success) return { ok: false, error: `입력 오류: ${parsed.error.message}` };
    try {
      const result = (this.tools as Record<string, (i: unknown) => unknown>)[name](parsed.data);
      this.changed();
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private tools: { [N in ToolName]: (input: ToolInput<N>) => unknown } = {
    roll: (i) => {
      const p = this.mustCrew(i.player_id);
      const check = this.parseCheck(i.check_type, i.check);
      const npc = i.against_npc ? this.mustNpc(i.against_npc) : null;
      let dc = i.dc;
      if (dc === undefined) {
        if (npc && check.type === "skill" && OPPOSED_PASSIVE[check.skill]) dc = ALERTNESS_DC[npc.alertness];
        else throw new Error("dc가 필요해요");
      }
      const sources: Advantage[] = [i.advantage ?? "normal"];
      if (npc && check.type === "skill") sources.push(socialAdvantage(this.affinityValue(npc.id, p.id), check.skill));
      if (this.usedInspiration.delete(p.id) && this.inspiration > 0) {
        this.inspiration--;
        sources.push("advantage");
      }
      const adv = sources.includes("advantage") && !sources.includes("disadvantage")
        ? "advantage"
        : sources.includes("disadvantage") && !sources.includes("advantage") ? "disadvantage" : "normal";

      const hidden = i.hidden_action_id ? this.mustHidden(i.hidden_action_id) : null;
      const result = rollCheck(p.sheet!, check, dc, { advantage: adv });
      this.addLog({ type: "roll", playerId: p.id, label: checkLabel(check), result, hiddenActionId: hidden?.id, reason: i.reason });

      // 같은 자리의 선원이 수동 감지·통찰로 눈치채는지
      const noticed: string[] = [];
      const passive = check.type === "skill" ? OPPOSED_PASSIVE[check.skill] : undefined;
      if (hidden && passive && hidden.status === "hidden") {
        for (const other of this.crew) {
          if (other.id === p.id || hidden.knownBy.includes(other.id)) continue;
          if (passiveScore(other.sheet!, passive) >= result.total) {
            hidden.knownBy.push(other.id);
            noticed.push(other.character!.name);
            this.addLog({ type: "whisper", to: other.id, text: `👁️ 당신은 ${p.character!.name}의 수상한 움직임을 눈치챘다 — ${hidden.secret}` });
          }
        }
      }
      const position = POSITIONS.find((x) => x.id === (i.position ?? "risky"))!;
      if (i.position === "desperate" && this.inspiration < MAX_INSPIRATION) {
        this.inspiration++;
        this.addLog({ type: "system", text: `🌟 절박한 상황에 뛰어든 ${p.character!.name} — 영감 +1 (${this.inspiration}/${MAX_INSPIRATION})` });
      }
      return {
        total: result.total, dc, success: result.success, critical: result.critical, margin: result.margin,
        dice: result.dice, advantage: adv, noticed_by_crew: noticed,
        position: position.ko,
        consequence_if_failed: result.success ? undefined : position.on_fail,
        cost_if_close: result.success && result.margin <= 2 ? position.on_cost : undefined,
      };
    },

    tick_clock: (i) => {
      const v = this.mustVisit();
      if (i.clock_id === "crisis") {
        const { name, segments } = v.island.world.clock;
        v.clock = Math.max(0, Math.min(segments, v.clock + i.ticks));
        this.addLog({ type: "system", text: `⏳ ${name} ${"●".repeat(v.clock)}${"○".repeat(segments - v.clock)}` });
        const due = v.island.events.filter(
          (e) => (e.kind === "clock" || e.kind === "finale") && (e.clock ?? 99) <= v.clock && !v.firedEvents.includes(e.id),
        );
        return { clock: v.clock, segments, due_events: due.map((e) => ({ id: e.id, kind: e.kind, when: e.when })) };
      }
      const c = v.clocks[i.clock_id];
      if (!c) throw new Error(`없는 시계: ${i.clock_id}. 먼저 create_clock으로 만드세요`);
      c.filled = Math.max(0, Math.min(c.segments, c.filled + i.ticks));
      this.addLog({ type: "system", text: `⏱️ ${c.name} ${"●".repeat(c.filled)}${"○".repeat(c.segments - c.filled)}` });
      return { clock: c.filled, segments: c.segments, full: c.filled >= c.segments };
    },

    create_clock: (i) => {
      const v = this.mustVisit();
      if (i.id === "crisis" || v.clocks[i.id]) throw new Error(`이미 있는 시계 id: ${i.id}`);
      v.clocks[i.id] = { name: i.name, segments: i.segments, filled: 0, type: i.type };
      this.addLog({ type: "system", text: `⏱️ 새 시계 — ${i.name} ${"○".repeat(i.segments)}` });
      return { ok: true };
    },

    ask_oracle: (i) => {
      const odds = ORACLE.odds.find((o) => o.id === i.odds)!;
      const roll = Math.floor(Math.random() * 100) + 1;
      const yes = roll >= odds.yes_if_d100_at_least;
      const extreme = roll % 11 === 0 && roll <= 99; // 11, 22, …, 99: 극단적 결과나 반전
      return { answer: yes ? "예" : "아니오", roll, extreme, note: extreme ? "두 자리가 같다 — 극단적인 결과나 반전으로 해석" : undefined };
    },

    set_scene_aspect: (i) => {
      const v = this.mustVisit();
      if (i.remove) v.aspects = v.aspects.filter((a) => a !== i.text);
      else if (!v.aspects.includes(i.text)) {
        v.aspects.push(i.text);
        this.addLog({ type: "system", text: `📌 ${i.text}` });
      }
      return { aspects: v.aspects };
    },

    start_combat: (i) => {
      const v = this.mustVisit();
      if (v.combat) throw new Error("이미 전투 중이에요. end_combat을 먼저 호출하세요");
      const enemies: Record<string, Combatant> = {};
      let seq = 0;
      for (const e of i.enemies) {
        const base = e.statblock ? enemyFromStatBlock(e.name, e.statblock) : improvisedEnemy(e.name, e.cr ?? 0.5);
        for (let k = 0; k < e.count; k++) {
          const id = e.npc_id && e.count === 1 ? e.npc_id : `e${++seq}`;
          enemies[id] = { ...base, id, name: e.count > 1 ? `${e.name} ${k + 1}` : e.name, initiative: 0, conditions: [] };
        }
      }
      // 우선권: 선원은 d20+민첩, 같은 종류의 적 무리는 한 번만 굴린다(SRD 5.2). 기습당한 쪽은 불리.
      const d20 = (dis: boolean) => {
        const a = Math.floor(Math.random() * 20) + 1;
        const b = Math.floor(Math.random() * 20) + 1;
        return dis ? Math.min(a, b) : a;
      };
      const order: NonNullable<Visit["combat"]>["order"] = [];
      for (const p of this.crew) {
        if (p.hp <= 0) continue;
        order.push({ id: p.id, name: p.character!.name, initiative: d20(i.surprised === "crew") + modifier(p.sheet!.scores.dex), side: "crew" });
      }
      const groups = new Map<string, number>();
      for (const e of Object.values(enemies)) {
        const key = e.name.replace(/ \d+$/, "");
        if (!groups.has(key)) groups.set(key, d20(i.surprised === "enemies") + Math.floor(e.attackBonus / 2));
        e.initiative = groups.get(key)!;
        order.push({ id: e.id, name: e.name, initiative: e.initiative, side: "enemy" });
      }
      order.sort((a, b) => b.initiative - a.initiative || (a.side === "crew" ? -1 : 1));
      v.combat = { round: 1, order, enemies, zones: i.zones ?? [], fallen: 0, moraleChecks: 0 };
      this.addLog({ type: "system", text: `⚔️ 전투 — 순서: ${order.map((o) => `${o.name}(${o.initiative})`).join(" → ")}` });
      return {
        order,
        enemies: Object.values(enemies).map((e) => ({ id: e.id, name: e.name, ac: e.ac, hp: e.hp, attack_bonus: e.attackBonus, damage: e.damage, save_dc: e.saveDc })),
        rules: COMBAT_RULES,
      };
    },

    attack: (i) => {
      const v = this.mustVisit();
      const attacker = this.combatantView(i.attacker);
      const target = this.combatantView(i.target);
      let bonus: number;
      let damage: string;
      let damageBonus = 0;
      if (attacker.kind === "crew") {
        const sheet = attacker.player.sheet!;
        const ability = i.ability ?? "str";
        const mod = modifier(sheet.scores[ability]);
        bonus = mod + sheet.proficiency;
        damage = i.damage ?? "1d4";
        damageBonus = mod;
      } else {
        bonus = attacker.enemy.attackBonus;
        damage = i.damage ?? attacker.enemy.damage;
      }
      const ac = target.kind === "crew" ? 10 + modifier(target.player.sheet!.scores.dex) + target.player.armorBonus : target.enemy.ac;
      const r = resolveAttack(bonus, ac, damage, { advantage: i.advantage, damageBonus });
      const aName = attacker.kind === "crew" ? attacker.player.character!.name : attacker.enemy.name;
      const tName = target.kind === "crew" ? target.player.character!.name : target.enemy.name;
      const result = this.applyHp(target, -r.damage, r.critical);
      this.addLog({
        type: "system",
        text: `🗡️ ${aName} → ${tName}: d20 ${r.d20}+${bonus} = ${r.total} vs AC ${ac} · ${r.hit ? (r.critical ? "치명타!" : "명중") : "빗나감"}${r.hit ? ` · 피해 ${r.damage}` : ""}${result.note ? ` · ${result.note}` : ""}`,
      });
      return { ...r, attack_bonus: bonus, target_hp: result.hp, target_down: result.down, morale: result.morale };
    },

    apply_damage: (i) => {
      const target = this.combatantView(i.target);
      let { total } = rollDice(i.dice);
      let saved: boolean | undefined;
      if (i.save) {
        const d = Math.floor(Math.random() * 20) + 1;
        const saveBonus = target.kind === "crew"
          ? modifier(target.player.sheet!.scores[i.save.ability]) + (target.player.sheet!.saveProficiencies.includes(i.save.ability) ? target.player.sheet!.proficiency : 0)
          : target.enemy.saveBonus;
        saved = d !== 1 && (d === 20 || d + saveBonus >= i.save.dc);
        if (saved) total = i.save.half ? Math.floor(total / 2) : 0;
      }
      const result = this.applyHp(target, -total, false);
      const name = target.kind === "crew" ? target.player.character!.name : target.enemy.name;
      this.addLog({ type: "system", text: `💥 ${name}: ${i.reason} — 피해 ${total}${saved === undefined ? "" : saved ? " (내성 성공)" : " (내성 실패)"}${result.note ? ` · ${result.note}` : ""}` });
      return { damage: total, saved, target_hp: result.hp, target_down: result.down, morale: result.morale };
    },

    apply_condition: (i) => {
      const target = this.combatantView(i.target);
      const list = target.kind === "crew" ? target.player.conditions : target.enemy.conditions;
      const name = conditionName(i.condition);
      if (i.remove) {
        const idx = list.indexOf(name);
        if (idx >= 0) list.splice(idx, 1);
      } else if (!list.includes(name)) list.push(name);
      const who = target.kind === "crew" ? target.player.character!.name : target.enemy.name;
      this.addLog({ type: "system", text: `${i.remove ? "✔️" : "⚠️"} ${who}: ${name}${i.remove ? " 해제" : ""}` });
      return { conditions: list };
    },

    end_combat: (i) => {
      const v = this.mustVisit();
      if (!v.combat) throw new Error("전투 중이 아니에요");
      v.combat = null;
      const labels = { victory: "승리", fled: "도주", surrender: "항복", negotiated: "협상", defeat: "패배" } as const;
      this.addLog({ type: "system", text: `🕊️ 전투 종료 — ${labels[i.outcome]}` });
      return { ok: true };
    },

    haggle: (i) => {
      const v = this.mustVisit();
      const p = this.mustCrew(i.player_id);
      const npc = this.mustNpc(i.merchant_npc);
      const dc = Math.max(15, ALERT[npc.alertness] + 2);
      const adv = socialAdvantage(this.affinityValue(npc.id, p.id), i.skill);
      const r = rollCheck(p.sheet!, { type: "skill", skill: i.skill }, dc, { advantage: adv });
      const tier = haggleTier(r.kept, r.total, dc);
      ((v.haggles[npc.id] ??= {})[p.id] = { buy: tier.buy_mult, sell: tier.sell_mult });
      this.addLog({ type: "roll", playerId: p.id, label: `흥정(${checkLabel({ type: "skill", skill: i.skill })})`, result: r, reason: i.reason });
      let affinityDelta = tier.affinity + (i.skill === "intimidation" && r.success ? -10 : 0);
      if (affinityDelta) this.tools.change_affinity({ npc_id: npc.id, target: p.id, delta: affinityDelta, reason: "흥정", witnessed: false });
      return {
        result: tier.id, buy_multiplier: tier.buy_mult, sell_multiplier: tier.sell_mult,
        refused: tier.buy_mult === null, affinity_change: affinityDelta || undefined,
      };
    },

    buy: (i) => {
      const v = this.mustVisit();
      const p = this.mustCrew(i.player_id);
      const islandTech = v.island.world.reality.technology as Tech;
      const haggle = i.merchant_npc ? v.haggles[i.merchant_npc]?.[p.id] : undefined;
      if (haggle && haggle.buy === null) throw new Error("흥정이 틀어져서 이 상인은 팔지 않아요");
      const price = buyPrice(toBits(i.base_price), {
        itemTech: (i.item_tech ?? islandTech) as Tech, islandTech,
        merchantAffinity: i.merchant_npc ? this.affinityValue(i.merchant_npc, p.id) : undefined,
        haggleBuyMult: haggle?.buy, qty: i.qty,
      });
      if (price.bits === null) throw new Error(price.reason);
      if (p.coins < price.bits) throw new Error(`돈이 모자라요: ${formatCoin(price.bits)} 필요, ${formatCoin(p.coins)} 있음`);
      p.coins -= price.bits;
      for (let k = 0; k < i.qty; k++) p.items.push({ name: i.item, kind: i.kind });
      if (i.merchant_npc && v.haggles[i.merchant_npc]) delete v.haggles[i.merchant_npc][p.id]; // 흥정은 한 거래에만
      this.addLog({ type: "system", text: `🛒 ${p.character!.name}: ${i.item}${i.qty > 1 ? ` ×${i.qty}` : ""} — ${formatCoin(price.bits)}${price.breakdown.length ? ` (${price.breakdown.join(", ")})` : ""} · 남은 돈 ${formatCoin(p.coins)}` });
      return { paid: fromBits(price.bits), balance: fromBits(p.coins), breakdown: price.breakdown };
    },

    sell: (i) => {
      const v = this.mustVisit();
      const p = this.mustCrew(i.player_id);
      const idx = p.items.findIndex((x) => x.name === i.item);
      if (idx < 0) throw new Error(`${p.character!.name}에게 ${i.item}이(가) 없어요`);
      const haggle = i.merchant_npc ? v.haggles[i.merchant_npc]?.[p.id] : undefined;
      if (haggle && haggle.sell === null) throw new Error("흥정이 틀어져서 이 상인은 사지 않아요");
      const bits = sellPrice(toBits(i.base_price), i.sale_kind, haggle?.sell);
      p.items.splice(idx, 1);
      p.coins += bits;
      if (i.merchant_npc && v.haggles[i.merchant_npc]) delete v.haggles[i.merchant_npc][p.id];
      this.addLog({ type: "system", text: `💰 ${p.character!.name}: ${i.item} 판매 +${formatCoin(bits)} · 남은 돈 ${formatCoin(p.coins)}` });
      return { received: fromBits(bits), balance: fromBits(p.coins) };
    },

    pay: (i) => {
      const p = this.mustCrew(i.player_id);
      const bits = toBits(i.amount);
      if (p.coins < bits) throw new Error(`돈이 모자라요: ${formatCoin(bits)} 필요, ${formatCoin(p.coins)} 있음`);
      p.coins -= bits;
      const to = i.to ? this.mustCrew(i.to) : null;
      if (to) to.coins += bits;
      this.addLog({ type: "system", text: `🪙 ${p.character!.name} → ${to ? to.character!.name : i.reason}: ${formatCoin(bits)} · 남은 돈 ${formatCoin(p.coins)}` });
      return { balance: fromBits(p.coins) };
    },

    advance_act: (i) => {
      const v = this.mustVisit();
      const acts = v.island.story.acts;
      if (i.act <= v.act) throw new Error(`이미 ${v.act}막이에요`);
      if (i.act > acts.length) throw new Error(`${acts.length}막까지만 있어요`);
      v.act = i.act;
      const act = acts[i.act - 1];
      this.addLog({ type: "system", text: `🎭 ${i.act}막 — ${act.name}` });
      return { act: i.act, ...act };
    },

    move_party: (i) => {
      const v = this.mustVisit();
      const loc = this.mustLocation(i.location_id);
      if (!v.discovered.includes(loc.id)) throw new Error("아직 발견하지 않은 장소예요");
      const here = this.mustLocation(v.location);
      const adjacent = here.connects_to.includes(loc.id) || loc.connects_to.includes(here.id);
      if (!adjacent && loc.id !== here.id) throw new Error(`${here.name}에서 ${loc.name}(으)로 바로 갈 수 없어요`);
      v.location = loc.id;
      this.addLog({ type: "system", text: `📍 ${loc.name}` });
      const events = v.island.events.filter((e) => e.kind === "location" && e.where === loc.id && !v.firedEvents.includes(e.id));
      return { location: loc, npcs_here: v.island.npcs.filter((n) => n.location === loc.id).map((n) => n.id), location_events: events.map((e) => e.id) };
    },

    discover_location: (i) => {
      const v = this.mustVisit();
      const loc = this.mustLocation(i.location_id);
      if (!v.discovered.includes(loc.id)) {
        v.discovered.push(loc.id);
        this.addLog({ type: "system", text: `🗺️ 새로운 장소를 발견했다: ${loc.name}` });
      }
      return { discovered: loc.id };
    },

    reveal_island_secret: (i) => {
      const v = this.mustVisit();
      const s = v.island.secrets.find((x) => x.id === i.secret_id);
      if (!s) throw new Error(`없는 비밀: ${i.secret_id}`);
      const already = v.islandSecrets[s.id];
      if (i.level === "hint") {
        if (already === "full") return { already: "full" };
        const shown = this.log.filter((e) => e.type === "system" && e.text.startsWith(`🔎 [${s.id}]`)).length;
        const hint = s.hints[Math.min(shown, s.hints.length - 1)];
        v.islandSecrets[s.id] = "hint";
        this.addLog({ type: "system", text: `🔎 [${s.id}] 단서: ${hint}` });
        return { hint };
      }
      v.islandSecrets[s.id] = "full";
      this.addLog({ type: "system", text: `💡 진실이 드러났다: ${s.truth}` });
      return { truth: s.truth };
    },

    change_affinity: (i) => {
      const v = this.mustVisit();
      const npc = this.mustNpc(i.npc_id);
      const targetIsPlayer = this.players.has(i.target);
      if (!targetIsPlayer) this.mustNpc(i.target);
      const updates = applyAffinityChange(v.affinity, {
        from: npc.id, to: i.target, delta: i.delta, reason: i.reason, witnessed: i.witnessed,
      });
      for (const u of updates) {
        if (!this.players.has(u.to)) continue;
        const before = tierOf(u.before);
        const after = tierOf(u.after);
        this.addLog({
          type: "affinity", to: u.to, npcName: this.npcName(u.from), delta: u.after - u.before,
          tierChange: u.tierChanged ? [before.name, after.name] : undefined,
        });
      }
      return updates.map((u) => {
        const t = tierOf(u.after);
        const n = v.island.npcs.find((x) => x.id === u.from)!;
        const behavior = t.id === "neutral" ? n.personality : n.behaviors[t.id];
        return { npc: u.from, toward: u.to, value: u.after, tier: t.name, tier_changed: u.tierChanged, via: u.via, behavior_now: behavior };
      });
    },

    start_event: (i) => {
      const v = this.mustVisit();
      const e = v.island.events.find((x) => x.id === i.event_id);
      if (!e) throw new Error(`없는 이벤트: ${i.event_id}`);
      if (e.once && v.firedEvents.includes(e.id)) throw new Error("이미 발동한 이벤트예요");
      if (!v.firedEvents.includes(e.id)) v.firedEvents.push(e.id);
      return { scene: e.scene, stakes: e.stakes };
    },

    resolve_trial: (i) => {
      const v = this.mustVisit();
      const t = v.island.trials.find((x) => x.id === i.trial_id);
      if (!t) throw new Error(`없는 고난: ${i.trial_id}`);
      v.trials[t.id] = i.outcome;
      this.addLog({ type: "system", text: `⚔️ 고난 「${t.name}」 — ${i.outcome === "success" ? "극복했다" : "대가를 치렀다"}` });
      return { consequence: i.outcome === "success" ? t.on_success : t.on_fail };
    },

    grant_blessing: (i) => {
      const v = this.mustVisit();
      const p = this.mustCrew(i.player_id);
      const b = v.island.blessings.find((x) => x.id === i.blessing_id);
      if (!b) throw new Error(`없는 축복: ${i.blessing_id}`);
      if (p.blessings.some((x) => x.id === b.id && x.islandId === v.islandId)) throw new Error("이미 받은 축복이에요");
      p.blessings.push({ id: b.id, islandId: v.islandId, name: b.name, effect: b.effect, lasts: b.lasts });
      this.addLog({ type: "system", text: `✨ ${p.character!.name}에게 축복이 깃들었다 — 「${b.name}」 ${b.effect}` });
      return { ok: true };
    },

    give_treasure: (i) => {
      const v = this.mustVisit();
      const t = v.island.treasures.find((x) => x.id === i.treasure_id);
      if (!t) throw new Error(`없는 유물: ${i.treasure_id}`);
      if (this.shipHold.some((x) => x.id === t.id && x.islandId === v.islandId)) throw new Error("이미 실은 유물이에요");
      this.shipHold.push({ islandId: v.islandId, id: t.id, name: t.name, kind: t.kind, power: t.power });
      this.addLog({ type: "system", text: `🏺 유물을 얻었다 — 「${t.name}」 ${t.power}` });
      return { ok: true };
    },

    grant_inspiration: (i) => {
      const p = this.mustCrew(i.player_id);
      if (this.inspiration >= MAX_INSPIRATION) return { inspiration: this.inspiration, capped: true };
      this.inspiration++;
      this.addLog({ type: "system", text: `🌟 영감 +1 — ${p.character!.name}: ${i.reason} (파티 영감 ${this.inspiration}/${MAX_INSPIRATION})` });
      return { inspiration: this.inspiration };
    },

    update_character: (i) => {
      const p = this.mustCrew(i.player_id);
      const parts: string[] = [];
      if (i.hp_delta) {
        p.hp = Math.max(0, Math.min(p.sheet!.maxHp, p.hp + i.hp_delta));
        parts.push(`HP ${i.hp_delta > 0 ? "+" : ""}${i.hp_delta} (${p.hp}/${p.sheet!.maxHp})`);
        if (p.hp === 0 && !p.conditions.includes("쓰러짐")) p.conditions.push("쓰러짐");
        if (p.hp > 0) p.conditions = p.conditions.filter((c) => c !== "쓰러짐");
      }
      for (const c of i.add_conditions ?? []) if (!p.conditions.includes(c)) (p.conditions.push(c), parts.push(`+${c}`));
      for (const c of i.remove_conditions ?? []) if (p.conditions.includes(c)) (p.conditions = p.conditions.filter((x) => x !== c), parts.push(`-${c}`));
      for (const it of i.add_items ?? []) (p.items.push(it), parts.push(`+${it.name}`));
      for (const name of i.remove_items ?? []) {
        const idx = p.items.findIndex((x) => x.name === name);
        if (idx >= 0) (p.items.splice(idx, 1), parts.push(`-${name}`));
      }
      if (parts.length) this.addLog({ type: "system", text: `${i.hp_delta && i.hp_delta < 0 ? "🩸" : "🎒"} ${p.character!.name}: ${parts.join(", ")}` });
      return { hp: p.hp, max_hp: p.sheet!.maxHp, conditions: p.conditions, items: p.items.map((x) => x.name) };
    },

    whisper: (i) => {
      this.mustCrew(i.player_id);
      this.addLog({ type: "whisper", to: i.player_id, text: i.text });
      return { ok: true };
    },

    expose_hidden_action: (i) => {
      const h = this.mustHidden(i.hidden_action_id);
      if (h.status !== "hidden") throw new Error("이미 공개된 비밀 행동이에요");
      h.status = "exposed";
      h.revealNote = i.note;
      h.revealedRound = this.visit?.round;
      this.deferred.push({ type: "reveal", hiddenActionId: h.id, note: i.note });
      return { ok: true };
    },

    share_hidden_action: (i) => {
      const h = this.mustHidden(i.hidden_action_id);
      const p = this.mustCrew(i.player_id);
      if (!h.knownBy.includes(p.id) && h.playerId !== p.id) h.knownBy.push(p.id);
      this.addLog({ type: "whisper", to: p.id, text: `👁️ ${i.how} — ${this.nameOf(h.playerId)}의 비밀: ${h.secret}` });
      return { ok: true };
    },

    record_ruling: (i) => {
      this.mustVisit().rulings.push(i.text);
      return { rulings: this.visit!.rulings.length };
    },

    end_island: (i) => {
      const v = this.mustVisit();
      const exit = v.island.exits.find((x) => x.id === i.exit_id);
      if (!exit) throw new Error(`없는 결말: ${i.exit_id}`);
      v.exitId = exit.id;
      for (const tid of exit.grants) {
        const t = v.island.treasures.find((x) => x.id === tid);
        if (t && !this.shipHold.some((x) => x.id === t.id && x.islandId === v.islandId))
          this.shipHold.push({ islandId: v.islandId, id: t.id, name: t.name, kind: t.kind, power: t.power });
      }
      this.deferred.push({ type: "system", text: `🏁 결말 — 「${exit.name}」` });
      return { epilogue: exit.epilogue, grants: exit.grants };
    },
  };

  // ── 전투 헬퍼 ─────────────────────────────────────────────────

  private combatantView(id: string): { kind: "crew"; player: Player } | { kind: "enemy"; enemy: Combatant } {
    const p = this.players.get(id);
    if (p?.character) return { kind: "crew", player: p };
    const e = this.visit?.combat?.enemies[id];
    if (e) {
      if (e.defeated) throw new Error(`${e.name}은(는) 이미 쓰러졌어요`);
      return { kind: "enemy", enemy: e };
    }
    throw new Error(`전투 참가자가 아니에요: ${id}${this.visit?.combat ? "" : " (start_combat을 먼저 호출하세요)"}`);
  }

  /** HP 변화 적용. 선원은 0이 되면 의식 불명 + 사망 내성, 적은 쓰러지고 사기 판정(Cairn) */
  private applyHp(t: ReturnType<Game["combatantView"]>, delta: number, critical: boolean): { hp: number; down: boolean; note?: string; morale?: string } {
    if (t.kind === "crew") {
      const p = t.player;
      const wasDown = p.hp <= 0;
      p.hp = Math.max(0, Math.min(p.sheet!.maxHp, p.hp + delta));
      if (p.hp === 0 && delta < 0) {
        if (!p.conditions.includes("의식 불명")) p.conditions.push("의식 불명");
        if (wasDown && p.deathSaves) p.deathSaves.failures += critical ? 2 : 1; // 쓰러진 뒤 맞으면 사망 내성 실패
        else p.deathSaves = { successes: 0, failures: 0, stable: false };
        return { hp: 0, down: true, note: `${p.character!.name} 쓰러짐` };
      }
      if (p.hp > 0 && wasDown) {
        p.conditions = p.conditions.filter((c) => c !== "의식 불명" && c !== "쓰러짐");
        p.deathSaves = null;
      }
      return { hp: p.hp, down: false };
    }
    const e = t.enemy;
    e.hp = Math.max(0, Math.min(e.maxHp, e.hp + delta));
    if (e.hp > 0) return { hp: e.hp, down: false };
    e.defeated = true;
    const c = this.visit!.combat!;
    c.fallen++;
    const enemies = Object.values(c.enemies);
    const alive = enemies.filter((x) => !x.defeated);
    let morale: string | undefined;
    // 첫 사상자와 절반이 쓰러졌을 때 사기 판정 (지혜 내성 DC 10)
    if (alive.length && (c.fallen === 1 || (c.fallen >= enemies.length / 2 && c.moraleChecks < 2))) {
      c.moraleChecks++;
      const leader = alive.reduce((a, b) => (b.saveBonus > a.saveBonus ? b : a));
      const roll = Math.floor(Math.random() * 20) + 1 + leader.saveBonus;
      morale = roll >= 10 ? "사기 유지 — 계속 싸운다" : "사기 붕괴 — 도망치거나 항복하거나 협상하려 한다";
    }
    return { hp: 0, down: true, note: `${e.name} 쓰러짐${morale ? ` · ${morale}` : ""}`, morale };
  }

  /** 라운드 시작 때 쓰러진 선원의 사망 내성 (SRD 5.2). 3번 실패해도 죽이지 않고 '큰 대가'로 넘긴다 */
  private deathSaveTick(): string[] {
    const notes: string[] = [];
    for (const p of this.crew) {
      if (p.hp > 0 || !p.deathSaves || p.deathSaves.stable || p.deathSaves.failures >= 3) continue;
      const r = rollDeathSave(p.deathSaves);
      p.deathSaves = r.state;
      if (r.revived) {
        p.hp = 1;
        p.deathSaves = null;
        p.conditions = p.conditions.filter((c) => c !== "의식 불명" && c !== "쓰러짐");
        notes.push(`${p.character!.name} 사망 내성 20 — HP 1로 깨어남`);
      } else {
        const st = p.deathSaves!;
        const tail = st.stable ? " · 안정됨" : st.failures >= 3 ? " · 3번 실패 — 큰 대가를 치러야 한다" : "";
        notes.push(`${p.character!.name} 사망 내성 ${r.roll} (성공 ${st.successes} / 실패 ${st.failures})${tail}`);
      }
    }
    for (const n of notes) this.addLog({ type: "system", text: `🕯️ ${n}` });
    return notes;
  }

  // ── 조회 헬퍼 ─────────────────────────────────────────────────

  affinityValue(npcId: string, target: string): number {
    return this.visit?.affinity[npcId]?.[target]?.value ?? 0;
  }

  nameOf(playerId: string): string {
    const p = this.players.get(playerId);
    return p?.character?.name ?? p?.nickname ?? playerId;
  }

  npcName(id: string): string {
    return this.visit?.island.npcs.find((n) => n.id === id)?.name ?? id;
  }

  private parseCheck(type: "skill" | "ability" | "save", id: string): Check {
    if (type === "skill") {
      if (!SKILL_IDS.includes(id as Skill)) throw new Error(`없는 기술: ${id}. 가능한 값: ${SKILL_IDS.join(", ")}`);
      return { type, skill: id as Skill };
    }
    if (!ABILITIES.includes(id as Ability)) throw new Error(`없는 능력치: ${id}. 가능한 값: ${ABILITIES.join(", ")}`);
    return { type, ability: id as Ability };
  }

  private mustPlayer(id: string): Player {
    const p = this.players.get(id);
    if (!p) throw new Error(`없는 선원: ${id}`);
    return p;
  }
  private mustCrew(id: string): Player {
    const p = this.mustPlayer(id);
    if (!p.character || !p.sheet) throw new Error(`${p.nickname}은(는) 캐릭터가 없어요`);
    return p;
  }
  private mustVisit(): Visit {
    if (!this.visit) throw new Error("섬에 상륙하지 않았어요");
    return this.visit;
  }
  private mustNpc(id: string) {
    const n = this.mustVisit().island.npcs.find((x) => x.id === id);
    if (!n) throw new Error(`없는 NPC: ${id}`);
    return n;
  }
  private mustLocation(id: string) {
    const l = this.mustVisit().island.locations.find((x) => x.id === id);
    if (!l) throw new Error(`없는 장소: ${id}`);
    return l;
  }
  private mustHidden(id: string): SecretAction {
    const h = this.hiddenActions.find((x) => x.id === id);
    if (!h) throw new Error(`없는 비밀 행동: ${id}`);
    return h;
  }

  // ── 로그와 보기 ───────────────────────────────────────────────

  addLog(entry: LogInput) {
    const full = { ...entry, id: ++this.logSeq, at: Date.now() } as LogEntry;
    this.log.push(full);
    this.emit("log", full);
  }

  private changed() {
    this.emit("changed");
  }

  /** 이 선원에게 보여 줄 로그 항목 (못 보는 항목은 null) */
  viewLog(e: LogEntry, viewerId: string): unknown {
    switch (e.type) {
      case "whisper":
      case "affinity":
        return e.to === viewerId ? e : null;
      case "system":
        return !e.to || e.to.includes(viewerId) ? e : null;
      case "action": {
        const secrets = e.hiddenIds
          .map((id) => this.hiddenActions.find((h) => h.id === id)!)
          .filter((h) => h && canSeeSecret(h, viewerId))
          .map((h) => ({ id: h.id, text: h.secret, status: h.status }));
        return { ...e, secrets, name: this.nameOf(e.playerId) };
      }
      case "roll": {
        const h = e.hiddenActionId ? this.hiddenActions.find((x) => x.id === e.hiddenActionId) : undefined;
        const name = this.nameOf(e.playerId);
        if (h && !canSeeSecret(h, viewerId)) return { id: e.id, at: e.at, type: "roll", name, secret: true };
        return { ...e, name };
      }
      case "chat":
        return { ...e, name: this.players.get(e.playerId)?.nickname ?? "?" };
      default:
        return e;
    }
  }

  /** 이 선원 화면에 필요한 전체 상태 */
  /** 서버를 다시 켜도 이어 할 수 있게 저장할 상태 (data/rooms.json) */
  toJSON() {
    return {
      code: this.code, hostId: this.hostId, rating: this.rating, phase: this.phase,
      players: [...this.players.values()], log: this.log, hiddenActions: this.hiddenActions, inspiration: this.inspiration,
      shipHold: this.shipHold, shipLog: this.shipLog, visit: this.visit, pending: [...this.pending], xcards: this.xcards,
      logSeq: this.logSeq, hiddenSeq: this.hiddenSeq, deferred: this.deferred, resumeTokens: [...this.resumeTokens],
    };
  }

  static restore(data: ReturnType<Game["toJSON"]>): Game {
    const g = new Game(data.code, data.rating);
    g.hostId = data.hostId;
    // 서술 도중에 꺼졌으면 그 라운드는 끝난 것으로 보고 다음 행동을 받는다
    g.phase = data.phase === "resolving" ? "round_open" : data.phase;
    g.players = new Map(data.players.map((p) => [p.id, { ...p, connected: false }]));
    g.log = data.log;
    g.hiddenActions = data.hiddenActions;
    g.inspiration = data.inspiration;
    g.shipHold = data.shipHold;
    g.shipLog = data.shipLog;
    g.visit = data.visit;
    g.pending = new Map(data.pending);
    g.xcards = data.xcards;
    g.logSeq = data.logSeq;
    g.hiddenSeq = data.hiddenSeq;
    g.deferred = data.deferred;
    g.resumeTokens = new Map(data.resumeTokens);
    return g;
  }

  snapshot(viewerId: string) {
    const v = this.visit;
    const me = this.players.get(viewerId);
    const island = v?.island;
    const relationships = v && me?.character
      ? island!.npcs
          .map((n) => ({ n, b: v.affinity[n.id]?.[viewerId] }))
          .filter(({ b }) => b && b.memories.length)
          .map(({ n, b }) => ({ npc: n.name, tier: tierOf(b!.value).name, memories: b!.memories.slice(-MEMORY_LIMIT) }))
      : [];
    return {
      code: this.code,
      you: viewerId,
      hostId: this.hostId,
      rating: this.rating,
      effectiveRating: this.effectiveRating(),
      phase: this.phase,
      inspiration: this.inspiration,
      players: [...this.players.values()].map((p) => ({
        id: p.id, nickname: p.nickname, connected: p.connected, submitted: this.pending.has(p.id),
        character: p.character && {
          name: p.character.name, title: p.character.title, origin: p.character.origin, concept: p.character.concept,
          archetype: p.character.archetype, background: p.character.background,
        },
        hp: p.hp, maxHp: p.sheet?.maxHp ?? 0, conditions: p.conditions, items: p.items, blessings: p.blessings,
        level: p.character?.level ?? 0, coins: formatCoin(p.coins), deathSaves: p.deathSaves,
        sheet: p.id === viewerId ? p.sheet : undefined,
      })),
      myPending: this.pending.get(viewerId) ?? null,
      myHidden: this.hiddenActions.filter((h) => h.playerId === viewerId),
      island: island && {
        id: island.id, title: island.meta.title, tagline: island.meta.tagline,
        genre: island.world.reality.genre, act: v!.act, actName: island.story.acts[v!.act - 1]?.name, acts: island.story.acts.length,
        clock: v!.clock, clockName: island.world.clock.name, segments: island.world.clock.segments,
        location: island.locations.find((l) => l.id === v!.location)?.name,
        round: v!.round,
        clocks: Object.values(v!.clocks),
        aspects: v!.aspects,
        combat: v!.combat && {
          round: v!.combat.round,
          order: v!.combat.order.map((o) => ({ ...o, down: o.side === "enemy" ? v!.combat!.enemies[o.id]?.defeated : (this.players.get(o.id)?.hp ?? 1) <= 0 })),
          enemies: Object.values(v!.combat.enemies).map((e) => ({ name: e.name, hp: e.hp, maxHp: e.maxHp, defeated: e.defeated, conditions: e.conditions })),
        },
      },
      relationships,
      shipHold: this.shipHold,
      shipLog: this.shipLog,
      log: this.log.map((e) => this.viewLog(e, viewerId)).filter(Boolean),
    };
  }
}
