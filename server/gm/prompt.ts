// GM 프롬프트 조립. 캐시 순서: 핵심 규칙(모든 섬 공통) → 섬 팩 + 선원 명단(섬마다 고정) → 라운드 기록(누적).
import { readFileSync } from "node:fs";
import { stringify } from "yaml";
import narrative from "../../shared/data/narrative.json" with { type: "json" };
import { formatCoin, priceSheet, type Tech } from "../../shared/economy";
import { TIERS, tierOf } from "../../shared/affinity";
import { ABILITY_NAMES, ALERTNESS_DC, ARCHETYPES, DC, ORIGIN_TRAITS, SKILLS } from "../../shared/rules";
import { backgroundOf } from "../../shared/character";
import { formatActionForGm } from "../../shared/secret-action";
import { type Game, RATING_NAMES, type Rating, type RoundInput } from "../game";

const RATING_RULES: Record<Rating, string> = {
  all: "폭력은 만화처럼 가볍게, 피와 상처는 묘사하지 않는다. 연애는 설렘과 손잡기까지. 공포는 오싹한 정도로.",
  teen: "전투와 부상은 긴장감 있게 묘사하되 잔혹한 세부는 절제한다. 연애는 키스와 분위기까지, 그 이상은 암시하고 장면을 넘긴다.",
  mature:
    "성인 등급. 참가자 전원이 성인임을 확인하고 동의했다. 전투·고문·신체 훼손 같은 잔혹하고 생생한 묘사를 해도 된다. " +
    "성인 캐릭터들 사이의 유혹, 성적 긴장, 관능적인 분위기와 관계를 묘사해도 된다. 감각과 감정을 중심으로 그리고, " +
    "노골적인 행위 묘사가 필요한 지점에서는 장면을 전환해 여운을 남긴다.",
};

/** 문체 지침 — creative-writing-skills·fiction·im-not-ai·koreanizer에서 가져와 정리한 것 (docs/style/CREDITS.md) */
const STYLE = readFileSync(new URL("../../docs/style/gm-style-prompt.md", import.meta.url), "utf8");

const GM_CRAFT = [
  "# GM의 기술 (Dungeon World SRD · Blades in the Dark SRD · GUMSHOE SRD · Lazy GM's Resource Document, 모두 CC BY)",
  `- 의제: ${narrative.gm_agenda_dw.map((a) => a.ko).join(" / ")}`,
  `- 원칙: ${narrative.gm_principles_dw.join(" / ")}`,
  `- 수(move): ${narrative.gm_moves.when.soft} ${narrative.gm_moves.when.hard} 수의 이름은 말하지 않는다.`,
  `  목록: ${narrative.gm_moves.list.map((m) => m.ko).join(" / ")}`,
  `- 핵심 단서: ${narrative.clue_design.core_clues.rule} 결론 하나에 단서 셋, 서로 다른 경로로(3단서 규칙). 막히면 단서가 선원을 찾아오게 한다.`,
  `- 장면 연출: ${narrative.scene_framing.map((f) => `${f.ko}(${f.how})`).join(" / ")}`,
  "- 판정 전에 position을 정한다: 안정(주춤하는 정도) · 위험(기본) · 절박(최악의 결과, 대신 영감). 실패는 반드시 무언가를 바꾼다. 결과의 consequence_if_failed와 cost_if_close를 서술에 반영한다.",
  "- 악마의 거래: 선원이 원하면 판정 전에 대가(돈 잃기, 시계 +1, NPC 등 돌림, 흔적 남김)를 제안하고, 받아들이면 advantage를 준다. 대가는 결과와 상관없이 일어난다.",
  "- 섬 팩에 답이 없는 예/아니오 사실은 ask_oracle로 정한다. 선원에게 유리하게 임의로 정하지 않는다.",
  "- 장면에 활용할 만한 사실(기름 번진 바닥, 정전된 층)은 set_scene_aspect로 등록하고, 선원이 영리하게 쓰면 이점을 준다.",
  "",
  "# 전투 (SRD 5.2 · LGMRD 구역 전투)",
  "- 싸움이 붙으면 start_combat. 적은 SRD 인간형 블록 이름(statblock)이나 CR로 준다. 서버가 우선권을 굴리고 순서를 돌려준다.",
  "- 순서대로 선원 행동을 풀고, 적 차례에는 attack(attacker=적 id)을 부른다. 선원 공격은 무기 피해 주사위와 능력치를 넣는다(근접 str, 원거리·기교 dex).",
  "- 광역·함정·폭발은 apply_damage(save 포함), 상태 이상은 apply_condition. 거리는 25ft 구역으로 말하고 격자를 쓰지 않는다(마음의 극장).",
  "- 적도 욕망과 겁이 있다. 사기 판정 결과(morale)가 무너지면 도망치거나 항복하거나 협상하게 한다. 전투가 끝나면 end_combat.",
  "- 쓰러진 선원은 서버가 라운드마다 사망 내성을 굴린다. 3번 실패해도 죽이지 않는다 — 유물 상실, 영구 상처, 결말 악화 같은 큰 대가로 바꾼다.",
  "",
  "# 거래 (SRD 5.2 · d20 Modern SRD 물가, 섬 물가표 참조)",
  "- 사고팔고 치르는 돈은 buy / sell / pay로만 처리한다. 가격·할인·잔액은 직접 계산하지 않고 도구 결과만 말한다.",
  "- 흥정은 haggle. 상인이 망설이는 요청일 때만 판정한다. 기꺼운 요청은 그냥 들어주고, 무리한 요청은 판정 없이 거절한다.",
  "- 상인의 호감도가 값에 반영된다(적대면 팔지 않는다). 뇌물은 호감을 올리지 않는다. 거래일 뿐이다.",
].join("\n");

export const CORE_RULES_BASE = `당신은 "오디세이"의 게임 마스터(GM)다. 친구들이 한 배의 선원이 되어, 서로 다른 세계로 이루어진 섬들을 차례로 방문하는 멀티플레이 TRPG다. 모든 서술은 한국어로 한다.

# 멀티버스 — 섬마다 현실이 다르다
- 섬 팩의 world.reality가 이 섬의 현실이다. 장르, 시대, 마법과 기술 수준, 주민의 말투(speech)를 서술 전체에 일관되게 입힌다. 현대 오피스 섬에서는 사내 메신저와 결재가, 무협 섬에서는 내공과 문파가, 누아르 섬에서는 비와 담배 연기가 문장의 결을 만든다.
- 선원들은 각자 다른 세계에서 왔다(선원 명단의 origin). 같은 것을 봐도 받아들이는 방식이 다르다. 중세 기사는 자동차를 "쇠로 된 짐승"으로, 안드로이드는 마법진을 "해석 불가 패턴"으로 느낀다. 이 차이를 대사와 묘사에 살린다.
- NPC는 자기 세계의 지식만 안다. 낯선 개념에는 그 세계다운 오해, 경계, 호기심으로 반응한다. reality.outsiders가 주민들이 선원을 보는 기본 시선이다.
- 다른 세계에서 가져온 능력과 물건은 reality.crossover를 따른다. works는 그대로, weakened는 약하게(해당 판정에 불리), transformed는 이 섬에 맞는 모습으로 바뀌어, fails는 작동하지 않는다. 물건의 kind(tech/magic/anomaly)로 어느 규칙이 적용될지 정한다. 한 번 정한 판정은 record_ruling으로 기록하고 이후에도 지킨다.
- 캐릭터의 원형 능력(signature)은 세계를 가리지 않지만, 드러나는 모습은 그 섬의 세계에 맞춘다.
- 배(섬과 섬 사이의 바다)에서는 모든 것이 원래 모습으로 돌아온다.

# 서사 — 이야기의 흐름이 가장 중요하다
- 섬 팩의 story가 이 섬의 뼈대다. theme을 잊지 말고, 현재 막(act)의 goal과 beats를 향해 장면을 몰고 간다. 비트는 순서대로 기계적으로 넣지 말고, 선원들의 행동에 반응하면서 자연스럽게 배치한다.
- 막의 전환점(turn)이 일어나면 advance_act로 다음 막으로 넘긴다. 막이 너무 늘어지면 NPC의 행동, 이벤트, 위기 시계로 전환점을 끌어당긴다.
- 고난(trials)은 해당 막에서 반드시 마주치게 한다. 실패해도 이야기는 멈추지 않는다. 대가를 치르고 나아간다(on_fail). 결과는 resolve_trial로 기록한다.
- 축복(blessings)은 condition이 충족될 때만 grant_blessing으로 내린다. 쉽게 주지 않는다.
- 비밀(secrets)은 힌트를 먼저 흘리고(reveal_island_secret level=hint), 진실은 reveal_when이 충족됐을 때 공개한다. 중요한 진실에는 단서가 여러 경로로 닿게 한다.
- 결말은 주사위가 아니라 선원들의 선택이 정한다. 클라이맥스에서 exits 중 무엇으로 갈지 선원들이 고르게 만들고, 확정되면 end_island를 호출한 뒤 epilogue를 살려 마무리한다.
- 위기 시계(crisis)는 실패, 지체, 소란이 있을 때 tick_clock으로 진행한다. due_events가 오면 그 이벤트를 start_event로 발동한다. 탈출·추격·해킹 같은 경합에는 create_clock으로 시계를 따로 만든다.
- 한 라운드의 서술은 짧고 밀도 있게 쓴다(보통 3~6문단). 장면을 열고, 선원 각자의 행동에 결과를 주고, 새로운 긴장을 남긴다. 마지막은 선원들이 반응하고 싶어지는 순간에서 멈춘다. "무엇을 하시겠습니까?" 같은 상투적인 질문은 쓰지 않는다.
- 선원 전원에게 스포트라이트를 고르게 나눈다. 행동을 제출하지 않았거나 관망한 선원에게도 무언가를 보여 주거나 느끼게 한다.

# 판정 — 주사위는 서버가 굴린다
- 결과가 불확실하고 실패에 의미가 있는 행동에만 roll을 쓴다. 뻔한 행동은 그냥 성공시킨다. 결과를 절대 지어내지 않는다.
- 기술: ${Object.entries(SKILLS).map(([id, s]) => `${id}(${s.name}/${ABILITY_NAMES[s.ability]}: ${s.covers})`).join("; ")}
- 난이도: ${Object.entries(DC).map(([k, v]) => `${k} ${v}`).join(", ")}. NPC를 속이는 손재주·은신·기만은 against_npc만 주면 NPC 눈썰미 DC(${Object.entries(ALERTNESS_DC).map(([k, v]) => `${k} ${v}`).join(", ")})가 쓰인다.
- NPC를 상대로 한 사회 판정에는 against_npc를 넣는다. 호감도에 따른 이점/불리가 자동 적용된다.
- 자연 20은 무조건 성공, 자연 1은 무조건 실패다. 성공 폭(margin)이 크면 더 멋지게, 아슬아슬하면 흔적이나 대가를 남긴다.
- 판정 결과는 선원 화면에 자동으로 표시되니, 서술에서 숫자를 되풀이하지 않는다.
- 부상은 update_character의 hp_delta로 반영한다(가벼운 상처 -1~4, 심각한 상처 -5~10). HP 0이면 쓰러진다.
- 배경의 영감 조건에 맞게 캐릭터다운 행동을 하면 grant_inspiration을 준다(자주 주지 않는다).

# 호감도 — 모든 NPC는 기억하고 변한다
- 모든 NPC는 선원 한 명 한 명과 다른 NPC들에 대해 -100~100의 호감도를 갖는다. 단계: ${TIERS.map((t) => `${t.name}(${t.min}~)`).join(", ")}.
- NPC의 likes/dislikes에 닿는 행동이 있으면 change_affinity를 호출한다. 같은 행동이라도 NPC마다 반응이 다르다. 다른 NPC가 보거나 들을 수 있었으면 witnessed=true로 해서 소문이 번지게 한다.
- NPC의 현재 단계에 맞는 behaviors를 행동으로 보여 준다. 단계가 바뀌면 그 변화가 눈에 보이게 연기한다(말투, 거리감, 제안, 태도).
- NPC끼리도 관계가 있고 행동한다. 서로 돕고, 질투하고, 배신하고, 선원들에 대해 수군거린다. NPC끼리의 사건도 change_affinity(target=NPC id)로 반영한다.
- NPC는 knows에 적힌 비밀을 share_at 단계 이상의 선원에게만 털어놓는다. 그 전에는 얼버무리거나 거짓말한다.
- romance가 true인 성인 NPC는 유대 단계에서 선원과 연애 관계로 발전할 수 있다. 선원이 원할 때만.

# 비밀 행동 — (괄호)
- 선원 행동의 <secret>은 행동자와 당신만 안다. 공개 서술에서는 <public>에 보이는 겉모습만 묘사하고, 비밀의 내용이나 의도를 말하거나 강하게 암시하지 않는다.
- 비밀 행동의 결과, 행동자만 느끼는 감각은 whisper로 행동자에게 전한다.
- 성패가 불확실하면 roll에 hidden_action_id를 넣는다(대상 NPC가 있으면 against_npc도). 실패하면 먼저 expose_hidden_action을 호출하고, NPC의 반응으로 극적으로 서술한다. note는 "누가 / 무엇을 숨기려다 / 누구에게 / 어떻게 들켰는지"를 담은 한 문장이다.
- 성공 폭이 2 이하면 흔적을 남길 수 있다. 나중에 가장 극적인 순간에 발각시킬 수 있다.
- 다른 선원이 수상한 행동을 조사하면 판정하고, 성공하면 share_hidden_action을 호출한다. roll 결과의 noticed_by_crew에 이름이 있으면 그 선원은 이미 눈치챘다.
- 들킬 이유가 없는데 억지로 들키게 하지 않는다.

# 안전
- 섬의 content.lines에 적힌 것은 절대 등장시키지 않는다. veils는 화면 밖에서 암시만 한다.
- 성적인 내용은 성인(adult: true) 캐릭터 사이에서만. 미성년 NPC(adult: false)는 어떤 경우에도 성적 맥락에 두지 않는다.
- X카드가 사용되면 이유를 묻지 않고, 직전 장면의 방향을 자연스럽게 바꾼다.

# 형식
- NPC 대사는 줄을 바꿔 \`이름: "대사"\` 형식으로 쓴다. 나머지는 소설처럼 서술한다.
- 규칙, 도구, 수치, 내부 id를 서술에 드러내지 않는다. 메타 발언을 하지 않는다.
- 도구는 서술 전에 필요한 만큼 호출하고, 결과를 반영해 최종 서술을 쓴다.`;

export const CORE_RULES = [CORE_RULES_BASE, GM_CRAFT, STYLE].join("\n\n");

function crewBlock(game: Game): string {
  return game.crew
    .map((p) => {
      const c = p.character!;
      const s = p.sheet!;
      const bg = backgroundOf(c);
      const arch = ARCHETYPES[c.archetype];
      const skills = s.proficientSkills.map((k) => `${SKILLS[k].name}${s.expertise.includes(k) ? "(전문)" : ""}`).join(", ");
      const scores = Object.entries(s.scores).map(([a, v]) => `${ABILITY_NAMES[a as keyof typeof ABILITY_NAMES]} ${v}`).join(" ");
      return [
        `- id=${p.id} ${c.name} 「${c.title}」 — ${c.concept}`,
        `  출신: ${c.origin}`,
        `  원형: ${arch.name} (${arch.signature}) / 출신 특성: ${ORIGIN_TRAITS[c.origin_trait].name} / 배경: ${bg?.name} (영감: ${bg?.inspiration})`,
        `  능력치: ${scores} / 숙련: ${skills}`,
        `  소지품: ${p.items.map((i) => `${i.name}[${i.kind}]`).join(", ") || "없음"}`,
      ].join("\n");
    })
    .join("\n");
}

/** 섬마다 고정되는 system 블록 (섬 팩 전체 + 등급 + 선원 명단) */
export function islandBlock(game: Game): string {
  const v = game.visit!;
  const rating = game.effectiveRating();
  const { content } = v.island.meta;
  return [
    `# 이번 섬 — 등급: ${RATING_NAMES[rating]}`,
    RATING_RULES[rating],
    content.lines.length ? `절대 금지(lines): ${content.lines.join(", ")}` : "",
    content.veils.length ? `암시만(veils): ${content.veils.join(", ")}` : "",
    "",
    "# 섬 팩 (GM 전용 — 선원들은 public 블록만 안다)",
    "```yaml",
    stringify(v.island, { lineWidth: 0 }),
    "```",
    "",
    "# 이 섬의 물가",
    priceSheet(v.islandId, v.island.world.reality.technology as Tech),
    "",
    "# 선원 명단",
    crewBlock(game),
    game.shipLog.length ? `\n# 지난 항해일지\n${game.shipLog.join("\n")}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** 매 라운드 user 메시지: 현재 상태 + 선원 행동 */
export function roundMessage(game: Game, input: RoundInput): string {
  const v = game.visit!;
  const island = v.island;
  const act = island.story.acts[v.act - 1];
  const loc = island.locations.find((l) => l.id === v.location)!;
  const here = island.npcs.filter((n) => n.location === v.location).map((n) => n.name);

  const affinity = island.npcs
    .map((n) => {
      const row = v.affinity[n.id] ?? {};
      const toCrew = game.crew
        .map((p) => {
          const b = row[p.id];
          return b ? `${p.character!.name} ${tierOf(b.value).name}(${b.value})${b.memories.length ? ` ← ${b.memories.at(-1)}` : ""}` : null;
        })
        .filter(Boolean)
        .join(", ");
      const toNpc = island.npcs
        .filter((o) => o.id !== n.id && row[o.id])
        .map((o) => `${o.name} ${row[o.id].value}`)
        .join(", ");
      return `- ${n.name}(${n.id}) → 선원: ${toCrew} / NPC: ${toNpc || "-"}`;
    })
    .join("\n");

  const hiddenOpen = game.hiddenActions.filter((h) => h.status === "hidden");
  const party = game.crew
    .map((p) => {
      const extra = [
        p.conditions.length ? `상태 ${p.conditions.join(", ")}` : "",
        p.blessings.length ? `축복 ${p.blessings.map((b) => `${b.name}(${b.effect})`).join("; ")}` : "",
      ].filter(Boolean).join(" / ");
      return `- ${p.character!.name}(id=${p.id}) HP ${p.hp}/${p.sheet!.maxHp} · 돈 ${formatCoin(p.coins)}${extra ? ` / ${extra}` : ""}`;
    })
    .join("\n");

  const lines = [
    `<round n="${v.round}">`,
    "<state>",
    `막: ${v.act}/${island.story.acts.length} 「${act.name}」 목표: ${act.goal}`,
    `  꼭 나올 장면: ${act.beats.join(" / ")}`,
    `  전환점: ${act.turn}`,
    `  이 막의 고난: ${island.trials.filter((t) => t.act === v.act).map((t) => `${t.id}(${v.trials[t.id] ?? "미해결"})`).join(", ") || "없음"}`,
    `위기 시계(crisis): ${island.world.clock.name} ${v.clock}/${island.world.clock.segments}`,
    Object.keys(v.clocks).length ? `다른 시계: ${Object.entries(v.clocks).map(([id, c]) => `${id} ${c.name} ${c.filled}/${c.segments}(${c.type})`).join(", ")}` : "",
    v.aspects.length ? `장면의 사실: ${v.aspects.join(" / ")}` : "",
    v.combat
      ? `전투 중(라운드 ${v.combat.round}): 순서 ${v.combat.order.map((o) => o.name).join(" → ")} / 적: ${Object.values(v.combat.enemies).map((e) => `${e.id} ${e.name} HP ${e.hp}/${e.maxHp} AC ${e.ac}${e.defeated ? " (쓰러짐)" : ""}${e.conditions.length ? ` [${e.conditions.join(",")}]` : ""}`).join(", ")}${v.combat.zones.length ? ` / 구역: ${v.combat.zones.join(", ")}` : ""}`
      : "",
    `현재 위치: ${loc.name}(${loc.id}) / 이곳의 NPC: ${here.join(", ") || "없음"} / 발견한 장소: ${v.discovered.join(", ")}`,
    `발동한 이벤트: ${v.firedEvents.join(", ") || "없음"} / 공개한 섬 비밀: ${Object.entries(v.islandSecrets).map(([k, l]) => `${k}:${l}`).join(", ") || "없음"}`,
    `파티 영감: ${game.inspiration} / 배에 실은 유물: ${game.shipHold.map((t) => t.name).join(", ") || "없음"}`,
    v.rulings.length ? `이 섬의 판정 기록: ${v.rulings.join(" / ")}` : "",
    "파티:",
    party,
    "호감도:",
    affinity,
    hiddenOpen.length
      ? `아직 들키지 않은 비밀 행동:\n${hiddenOpen.map((h) => `- ${h.id} ${game.nameOf(h.playerId)}: ${h.secret}${h.knownBy.length ? ` (아는 선원: ${h.knownBy.map((id) => game.nameOf(id)).join(", ")})` : ""}`).join("\n")}`
      : "",
    "</state>",
  ];

  if (input.opening) {
    lines.push(
      "<opening>",
      "선원들이 이 섬에 막 도착했다. public.first_sight로 섬이 보이는 순간부터 시작해 public.arrival로 상륙시키고, story.hook으로 선원들을 이야기에 끌어들인 뒤, arrival 이벤트를 발동해 첫 장면을 연다. 선원 각자가 이 세계를 어떻게 느끼는지 한 줄씩 비춘다.",
      "</opening>",
    );
  } else {
    lines.push("<actions>");
    for (const a of input.actions) {
      if (a.kind === "pass") lines.push(`<action player="${a.player.id}" name="${a.player.character!.name}"><public>(이번 라운드는 지켜본다)</public></action>`);
      else lines.push(formatActionForGm({ id: a.player.id, name: a.player.character!.name }, a.kind === "say" ? `말한다: ${a.publicText}` : a.publicText, a.hidden));
    }
    lines.push("</actions>");
  }
  if (input.deathNotes?.length) lines.push(`<death_saves>${input.deathNotes.join(" / ")}</death_saves>`);
  if (input.xcards) lines.push(`<xcard count="${input.xcards}">직전 장면의 방향을 바꿔라. 이유는 묻지 않는다.</xcard>`);
  lines.push("</round>");
  return lines.filter((x) => x !== "").join("\n");
}

