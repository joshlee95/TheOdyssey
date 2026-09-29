// GM 도구 — 입력은 Zod 하나로 정의해 Claude용 JSON 스키마와 서버 검증에 함께 쓴다.
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const Id = z.string().min(1);
const Reason = z.string().min(1).describe("이 도구를 쓰는 이유 (짧게)");

export const TOOL_INPUTS = {
  roll: z.object({
    player_id: Id,
    check_type: z.enum(["skill", "ability", "save"]),
    check: z.string().describe("skill이면 기술 id(예: sleight_of_hand), ability/save면 능력치 id(str, dex, con, int, wis, cha)"),
    dc: z.number().int().min(1).max(40).optional().describe("난이도. against_npc가 있고 손재주·은신·기만이면 생략 가능(그 NPC의 눈썰미 DC 사용)"),
    against_npc: Id.optional().describe("NPC를 상대로 한 판정이면 그 NPC id — 호감도에 따른 이점/불리가 자동 적용된다"),
    advantage: z.enum(["normal", "advantage", "disadvantage"]).optional(),
    hidden_action_id: Id.optional().describe("비밀 행동의 성패를 가리는 판정이면 그 id"),
    position: z.enum(["controlled", "risky", "desperate"]).optional().describe("실패하면 무엇을 잃는가: 안정(주춤)·위험(기본, 피해·상태·시계 2칸)·절박(최악, 시계 3칸). 절박에 뛰어든 선원은 영감을 받는다"),
    reason: Reason,
  }),
  tick_clock: z.object({
    clock_id: Id.default("crisis").describe("crisis는 섬의 위기 시계. 다른 시계는 create_clock으로 만든 id"),
    ticks: z.number().int().min(-5).max(5).describe("효과: 제한 1, 보통 2, 큰 3, 극단 5 / 대가: 가벼움 1, 보통 2, 심각 3"),
    reason: Reason,
  }),
  create_clock: z.object({
    id: Id,
    name: z.string().min(1),
    segments: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]).describe("4 복잡함 · 6 까다로움 · 8 벅참 · 10~12 장기"),
    type: z.enum(["danger", "progress", "racing", "tug_of_war", "faction"]),
  }),
  ask_oracle: z.object({
    question: z.string().min(1).describe("섬 팩에 답이 없는 예/아니오 질문"),
    odds: z.enum(["almost_certain", "likely", "fifty_fifty", "unlikely", "small_chance"]),
  }),
  set_scene_aspect: z.object({ text: z.string().min(1).describe("장면에 붙은 사실 한 줄. 예: 기름 번진 바닥, 정전된 층"), remove: z.boolean().optional() }),
  start_combat: z.object({
    enemies: z
      .array(
        z.object({
          name: z.string().min(1),
          count: z.number().int().min(1).max(12).default(1),
          statblock: z.string().optional().describe("SRD 인간형 블록 id (commoner, guard, bandit, cultist, noble, warrior_infantry, priest_acolyte, scout, tough, spy, pirate, bandit_captain, priest, cultist_fanatic, warrior_veteran, guard_captain, tough_boss, gladiator, mage, pirate_captain, assassin, archmage)"),
          cr: z.number().min(0).max(20).optional().describe("statblock이 없으면 CR로 즉석 수치 생성 (1/8=0.125)"),
          npc_id: Id.optional().describe("섬 NPC가 싸움에 끼면 그 id"),
        }),
      )
      .min(1),
    surprised: z.enum(["crew", "enemies", "none"]).default("none"),
    zones: z.array(z.string()).optional().describe("구역 이름들 (25ft 단위). 예: 부두, 창고 안, 지붕"),
  }),
  attack: z.object({
    attacker: Id.describe("선원 id 또는 적 id"),
    target: Id.describe("선원 id 또는 적 id"),
    damage: z.string().optional().describe("선원 공격의 무기 피해 주사위 (예: 1d8). 적은 생략하면 자기 피해 사용"),
    ability: z.enum(["str", "dex", "wis", "int", "cha"]).optional().describe("선원 공격 능력치 (근접 str, 원거리·기교 dex, 이능 wis/int/cha)"),
    advantage: z.enum(["normal", "advantage", "disadvantage"]).optional(),
    reason: Reason,
  }),
  apply_damage: z.object({
    target: Id,
    dice: z.string().describe("피해 주사위 또는 고정값 (예: 3d6, 5)"),
    save: z.object({ ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]), dc: z.number().int(), half: z.boolean().default(true) }).optional(),
    type: z.string().optional(),
    reason: Reason,
  }),
  apply_condition: z.object({
    target: Id,
    condition: z.enum(["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]),
    remove: z.boolean().optional(),
  }),
  end_combat: z.object({ outcome: z.enum(["victory", "fled", "surrender", "negotiated", "defeat"]), reason: Reason }),
  haggle: z.object({
    player_id: Id,
    merchant_npc: Id,
    skill: z.enum(["persuasion", "deception", "intimidation", "performance"]),
    reason: Reason,
  }),
  buy: z.object({
    player_id: Id,
    item: z.string().min(1),
    kind: z.enum(["mundane", "tech", "magic", "anomaly"]).default("mundane"),
    base_price: z.number().min(0).describe("물가표 기준 정가(코인)"),
    item_tech: z.enum(["primitive", "medieval", "industrial", "modern", "futuristic"]).optional().describe("물건의 기술 수준 (생략하면 섬과 같음)"),
    merchant_npc: Id.optional(),
    qty: z.number().int().min(1).max(99).default(1),
  }),
  sell: z.object({
    player_id: Id,
    item: z.string().min(1).describe("선원 소지품 이름"),
    base_price: z.number().min(0),
    sale_kind: z.enum(["equipment", "valuable", "magic"]),
    merchant_npc: Id.optional(),
  }),
  pay: z.object({
    player_id: Id,
    amount: z.number().min(0).describe("코인"),
    to: Id.optional().describe("다른 선원 id면 그 선원에게 건넨다"),
    reason: Reason,
  }),
  advance_act: z.object({ act: z.number().int().min(1), reason: Reason }),
  move_party: z.object({ location_id: Id }),
  discover_location: z.object({ location_id: Id, reason: Reason }),
  reveal_island_secret: z.object({ secret_id: Id, level: z.enum(["hint", "full"]) }),
  change_affinity: z.object({
    npc_id: Id,
    target: Id.describe("선원 id 또는 다른 NPC id"),
    delta: z.number().int().min(-30).max(30),
    reason: Reason,
    witnessed: z.boolean().describe("다른 NPC가 보거나 들을 수 있었나 — true면 소문이 번진다"),
  }),
  start_event: z.object({ event_id: Id }),
  resolve_trial: z.object({ trial_id: Id, outcome: z.enum(["success", "fail"]) }),
  grant_blessing: z.object({ player_id: Id, blessing_id: Id }),
  give_treasure: z.object({ treasure_id: Id }),
  grant_inspiration: z.object({ player_id: Id, reason: Reason }),
  update_character: z.object({
    player_id: Id,
    hp_delta: z.number().int().optional(),
    add_conditions: z.array(z.string()).optional(),
    remove_conditions: z.array(z.string()).optional(),
    add_items: z.array(z.object({ name: z.string(), kind: z.enum(["mundane", "tech", "magic", "anomaly"]) })).optional(),
    remove_items: z.array(z.string()).optional(),
    reason: Reason,
  }),
  whisper: z.object({ player_id: Id, text: z.string().min(1) }),
  expose_hidden_action: z.object({
    hidden_action_id: Id,
    note: z.string().min(1).describe("모두에게 보일 시스템 설명 한 문장: 누가 / 무엇을 숨기려다 / 누구에게 / 어떻게 들켰는지"),
  }),
  share_hidden_action: z.object({ hidden_action_id: Id, player_id: Id, how: z.string().min(1) }),
  record_ruling: z.object({ text: z.string().min(1).describe("이 섬에서 정한 규칙 판정. 예: 건희의 스마트폰은 이 섬에서 켜지지 않는다") }),
  end_island: z.object({ exit_id: Id }),
} as const;
export type ToolName = keyof typeof TOOL_INPUTS;
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_INPUTS)[N]>;

const DESCRIPTIONS: Record<ToolName, string> = {
  roll: "서버가 d20 판정을 굴린다. 결과가 불확실한 행동에는 반드시 이 도구를 쓰고, 결과를 지어내지 않는다. 판정 전에 position을 정한다. 결과는 선원들 화면에 자동으로 표시된다.",
  tick_clock: "진행 시계를 움직인다(Blades in the Dark). crisis는 섬 위기 시계 — 발동할 clock·finale 이벤트가 있으면 결과로 알려 준다.",
  create_clock: "장면이나 세력의 시계를 새로 만든다 (탈출 vs 추격, 해킹 vs 역추적, 세력의 계획).",
  ask_oracle: "섬 팩에 답이 없는 예/아니오 사실을 서버가 굴려 정한다(Ironsworn 오라클). 선원에게 유리하게 임의로 정하지 않는다.",
  set_scene_aspect: "장면에 붙은 사실 한 줄을 등록한다(Fate). 선원이 이를 영리하게 활용하면 그 판정에 이점을 준다.",
  start_combat: "전투를 시작한다(SRD 5.2). 서버가 적 수치를 만들고 우선권을 굴린다. 결과로 행동 순서를 돌려준다.",
  attack: "공격 한 번을 굴린다. 명중·치명타·피해·HP 감소를 서버가 처리한다. 선원 순서대로, 적 차례에는 적 id로 부른다.",
  apply_damage: "함정, 폭발, 광역 이능 등 공격 굴림이 아닌 피해. save를 주면 대상이 내성을 굴린다.",
  apply_condition: "SRD 상태 이상을 걸거나 푼다.",
  end_combat: "전투를 끝낸다. 적이 도망치거나 항복하거나 협상으로 끝나도 된다.",
  haggle: "상인과 흥정한다. 서버가 판정하고 다음 buy/sell에 적용할 배율을 기억한다. 위협은 성공해도 호감이 떨어진다.",
  buy: "물건을 산다. 서버가 기술 수준·상인 호감도·흥정을 반영한 값을 계산해 돈을 빼고 소지품에 넣는다. 정가는 물가표를 따른다.",
  sell: "소지품을 판다. 장비는 50%(흥정해도 최대 65%), 보석·교역품은 100%.",
  pay: "숙박, 식사, 뇌물, 서비스, 정보 값 등을 치르거나 다른 선원에게 돈을 건넨다.",
  advance_act: "이야기를 다음 막으로 넘긴다. 현재 막의 전환점(turn)이 일어났을 때만 쓴다.",
  move_party: "일행이 인접한 장소로 이동한다. 숨겨진 장소는 발견한 뒤에만 갈 수 있다.",
  discover_location: "숨겨진 장소를 발견한다.",
  reveal_island_secret: "섬의 비밀을 선원들에게 공개한다. hint는 힌트 하나, full은 진실 전체.",
  change_affinity: "NPC의 호감도를 바꾼다. NPC의 likes/dislikes에 닿는 행동이 있을 때 쓴다. 보통 ±5~10, 큰 사건은 ±15~30.",
  start_event: "섬의 이벤트를 발동한다. 결과로 장면 내용을 돌려준다.",
  resolve_trial: "고난의 결과를 기록한다.",
  grant_blessing: "선원에게 축복을 내린다. 축복의 condition이 충족됐을 때만.",
  give_treasure: "유물을 배(파티)에 싣는다.",
  grant_inspiration: "배경의 영감 조건에 맞게 행동한 선원에게 영감을 준다(파티 공용, 최대 4).",
  update_character: "HP, 상태, 소지품을 바꾼다. HP가 0이 되면 쓰러짐 상태가 된다.",
  whisper: "특정 선원에게만 보이는 서술. 혼자 본 것, 비밀 행동의 결과, 속삭임 등.",
  expose_hidden_action: "선원의 비밀 행동이 탄로났다. 원문과 note가 모두에게 공개된다(라운드 서술 뒤에 표시).",
  share_hidden_action: "수상한 행동을 조사해 성공한 선원 한 명에게만 비밀 행동의 진실을 알려 준다.",
  record_ruling: "다른 세계에서 온 능력·물건이 이 섬에서 어떻게 작동하는지 등, 앞으로도 지킬 판정을 기록한다.",
  end_island: "섬의 결말을 확정한다. 이 라운드 서술에서 에필로그를 들려준다.",
};

export const TOOLS: Anthropic.Beta.Messages.BetaTool[] = (Object.keys(TOOL_INPUTS) as ToolName[]).map((name) => {
  const { $schema: _, ...schema } = z.toJSONSchema(TOOL_INPUTS[name]) as Record<string, unknown>;
  return {
    name,
    description: DESCRIPTIONS[name],
    input_schema: schema as Anthropic.Beta.Messages.BetaTool["input_schema"],
  };
});
