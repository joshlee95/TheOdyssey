// 섬 팩(island.yaml) 스키마 — 서버, 검증기, 에디터가 모두 이 파일을 기준으로 삼는다.
// 필드별 공개 범위: public = 모든 플레이어, 그 외 = AI GM + 섬지기(작성자)만.
import { z } from "zod";
import { TIER_IDS } from "./affinity";

const Id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "id는 소문자·숫자·하이픈만 쓸 수 있어요 (예: old-lighthouse)");
const Text = z.string().trim().min(1, "비어 있으면 안 돼요");

const Tier = z.enum(TIER_IDS);
/** 물건이나 능력의 성질 — 섬의 crossover 규칙이 어느 쪽에 적용되는지 정한다 */
export const Kind = z.enum(["mundane", "tech", "magic", "anomaly"]); // 평범 · 기술 · 마법/이능 · 정체불명
const Crossover = z.enum(["works", "weakened", "transformed", "fails"]); // 그대로 · 약해짐 · 모습이 바뀜 · 작동 안 함

const Location = z.object({
  id: Id,
  name: Text,
  description: Text,
  connects_to: z.array(Id).default([]),
  hidden: z.boolean().default(false), // true면 비밀/이벤트로 발견되기 전까지 지도에 없음
  tags: z.array(Text).default([]),
});

const Npc = z.object({
  id: Id,
  name: Text,
  role: Text,
  adult: z.boolean(), // 성인 여부 — 성적 묘사는 성인 사이에서만 허용
  look: Text,
  personality: Text,
  voice: Text, // 말투
  wants: Text,
  fears: Text,
  location: Id,
  alertness: z.enum(["dull", "normal", "sharp", "uncanny"]).default("normal"), // 눈썰미 → 속이기 DC
  /** 선원들에 대한 초기 호감도 (-100 ~ 100) */
  affinity: z.number().int().min(-100).max(100).default(0),
  likes: z.array(Text).min(1, "호감이 오르는 행동을 하나 이상 적어 주세요"),
  dislikes: z.array(Text).min(1, "호감이 떨어지는 행동을 하나 이상 적어 주세요"),
  /** 호감도 단계별 행동. neutral은 personality가 기본 */
  behaviors: z.object({ hostile: Text, wary: Text, friendly: Text, trusted: Text, bonded: Text }),
  romance: z.boolean().default(false), // 유대 단계에서 연애 관계로 발전할 수 있는지 (성인만)
  /** 다른 NPC와의 관계 (-100 ~ 100). 호감도 소문이 이 관계를 따라 퍼진다 */
  relations: z
    .array(z.object({ npc: Id, affinity: z.number().int().min(-100).max(100), note: Text }))
    .default([]),
  /** 이 NPC가 아는 섬의 비밀과, 선원에게 털어놓는 호감도 단계 */
  knows: z.array(z.object({ secret: Id, share_at: Tier })).default([]),
  sample_lines: z.array(Text).default([]),
});

const Secret = z.object({
  id: Id,
  truth: Text,
  hints: z.array(Text).min(1, "힌트를 하나 이상 적어 주세요"),
  reveal_when: Text, // 자연어 조건 — GM이 판단
});

const Event = z.object({
  id: Id,
  kind: z.enum(["arrival", "location", "clock", "random", "finale"]),
  where: Id.optional(), // kind=location일 때 장소 id
  clock: z.number().int().positive().optional(), // kind=clock/finale일 때 발동 칸
  when: Text, // 자연어 발동 조건
  scene: Text,
  stakes: Text.optional(), // 걸려 있는 것
  once: z.boolean().default(true),
});

const Exit = z.object({
  id: Id,
  name: Text,
  condition: Text,
  epilogue: Text,
  grants: z.array(Id).default([]), // treasure id
});

/** 서사 구조: 이 섬의 이야기가 어떻게 흘러가는가 */
const Story = z.object({
  theme: Text, // 이 섬이 선원들에게 던지는 질문 (예: "이름을 잃어도 나는 나인가?")
  hook: Text, // 선원들이 이 섬의 이야기에 휘말리는 계기
  acts: z
    .array(
      z.object({
        name: Text,
        goal: Text, // 이 막에서 선원들이 이루거나 알아내야 하는 것
        beats: z.array(Text).min(2), // 이 막에 꼭 등장시킬 장면들
        turn: Text, // 다음 막으로 넘어가는 전환점
      }),
    )
    .min(3, "막은 3개 이상 필요해요")
    .max(5),
});

/** 고난: 선원들이 반드시 넘어야 하는 시련 */
const Trial = z.object({
  id: Id,
  name: Text,
  act: z.number().int().min(1), // 등장하는 막 번호 (1부터)
  description: Text,
  test: Text, // 어떻게 넘는가 — 판정, 선택, 희생 등
  on_success: Text,
  on_fail: Text, // 실패해도 이야기는 계속된다 — 대가를 치르고 나아간다
});

/** 축복: 이 섬에서 얻을 수 있는 은혜 (유물과 달리 몸이나 운명에 깃든다) */
const Blessing = z.object({
  id: Id,
  name: Text,
  description: Text,
  condition: Text, // 어떻게 얻는가
  effect: Text, // 규칙상 효과: 특정 판정에 이점, 영감 +1, 최대 HP +, 한 번 죽음을 피함 등
  lasts: z.enum(["island", "campaign"]).default("campaign"),
});

const Treasure = z.object({
  id: Id,
  name: Text,
  description: Text,
  kind: Kind.default("anomaly"),
  power: Text, // 다른 섬에서 쓸 수 있는 효과 — 어느 세계에서든 통하게 쓴다
});

// 제약 검사(superRefine) 전의 순수 형태 — LLM 구조화 출력에도 이 형태를 쓴다.
export const IslandShape = z.object({
  schema_version: z.literal(1),
  id: Id,
  meta: z.object({
    title: Text,
    author: Text,
    tagline: Text,
    tone: z.array(Text).min(1).max(5),
    players: z
      .object({ min: z.number().int().min(1), max: z.number().int().max(6) })
      .default({ min: 2, max: 5 }),
    session_minutes: z.number().int().positive().default(90),
    content: z
      .object({
        rating: z.enum(["all", "teen", "mature"]).default("teen"), // 이 섬이 담고 있는 최고 수위
        lines: z.array(Text).default([]), // 절대 등장하지 않을 것
        veils: z.array(Text).default([]), // 화면 밖에서만 암시할 것
      })
      .default({ rating: "teen", lines: [], veils: [] }),
  }),
  public: z.object({
    rumor: Text, // 항해 중 선원들이 듣는 소문
    first_sight: Text, // 수평선에서 보이는 모습
    arrival: Text, // 상륙 장면 소재
  }),
  world: z.object({
    /** 이 섬의 현실 규칙 — 섬마다 세계가 다르다 */
    reality: z.object({
      genre: z.array(Text).min(1).max(4), // 예: [현대, 오피스, 블랙코미디]
      era: Text, // 시대감: "2020년대 서울", "마법이 저문 중세", "먼 미래의 궤도 도시"
      magic: z.enum(["none", "hidden", "rare", "common"]),
      technology: z.enum(["primitive", "medieval", "industrial", "modern", "futuristic"]),
      speech: Text, // 주민들의 말투와 언어감
      outsiders: Text, // 주민들이 선원(외부인)을 어떻게 받아들이는가
      crossover: z.object({
        magic: Crossover, // 다른 세계에서 가져온 마법·이능
        tech: Crossover, // 다른 세계에서 가져온 기술
        note: Text.optional(), // 예: "마법은 모두 사내 결재 서류의 형태로 발현된다"
      }),
      appearance: z.enum(["unchanged", "blend_in"]).default("unchanged"), // blend_in: 상륙하면 선원 겉모습이 이 세계에 맞게 바뀜
    }),
    premise: Text, // 섬의 진짜 정체
    laws: z.array(Text).default([]),
    start_location: Id,
    clock: z
      .object({ name: Text, segments: z.number().int().min(3).max(12) })
      .default({ name: "위기가 다가온다", segments: 6 }),
  }),
  locations: z.array(Location).min(1),
  npcs: z.array(Npc).default([]),
  secrets: z.array(Secret).default([]),
  events: z.array(Event).default([]),
  story: Story,
  trials: z.array(Trial).min(2, "고난을 두 개 이상 적어 주세요"),
  blessings: z.array(Blessing).min(1, "축복을 하나 이상 적어 주세요"),
  exits: z.array(Exit).min(1, "섬을 떠나는 방법을 하나 이상 적어 주세요"),
  treasures: z.array(Treasure).default([]),
  gm_notes: z
    .object({
      pacing: Text.optional(),
      do: z.array(Text).default([]),
      dont: z.array(Text).default([]),
    })
    .default({ do: [], dont: [] }),
});

export const IslandSchema = IslandShape.superRefine((island, ctx) => {
  const fail = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });

  const idSet = (key: "locations" | "npcs" | "secrets" | "events" | "exits" | "treasures" | "trials" | "blessings") => {
    const seen = new Set<string>();
    island[key].forEach((item, i) => {
      if (seen.has(item.id)) fail([key, i, "id"], `id "${item.id}"가 중복돼요`);
      seen.add(item.id);
    });
    return seen;
  };
  const locations = idSet("locations");
  idSet("npcs");
  const secrets = idSet("secrets");
  idSet("events");
  idSet("exits");
  const treasures = idSet("treasures");
  idSet("trials");
  idSet("blessings");
  island.trials.forEach((t, i) => {
    if (t.act > island.story.acts.length)
      fail(["trials", i, "act"], `${t.act}막은 없어요 (story.acts는 ${island.story.acts.length}막)`);
  });

  const mustExist = (set: Set<string>, id: string, path: (string | number)[], what: string) => {
    if (!set.has(id)) fail(path, `없는 ${what} id "${id}"를 가리키고 있어요`);
  };

  mustExist(locations, island.world.start_location, ["world", "start_location"], "장소");
  island.locations.forEach((loc, i) =>
    loc.connects_to.forEach((to, j) => mustExist(locations, to, ["locations", i, "connects_to", j], "장소")),
  );
  const npcs = new Set(island.npcs.map((n) => n.id));
  island.npcs.forEach((npc, i) => {
    mustExist(locations, npc.location, ["npcs", i, "location"], "장소");
    npc.knows.forEach((k, j) => mustExist(secrets, k.secret, ["npcs", i, "knows", j, "secret"], "비밀"));
    npc.relations.forEach((r, j) => {
      mustExist(npcs, r.npc, ["npcs", i, "relations", j, "npc"], "NPC");
      if (r.npc === npc.id) fail(["npcs", i, "relations", j, "npc"], "자기 자신과의 관계는 적을 수 없어요");
    });
    if (npc.romance && !npc.adult) fail(["npcs", i, "romance"], "미성년 NPC는 연애 대상이 될 수 없어요");
  });
  island.events.forEach((ev, i) => {
    if (ev.kind === "location") {
      if (!ev.where) fail(["events", i, "where"], "kind가 location이면 where(장소 id)가 필요해요");
      else mustExist(locations, ev.where, ["events", i, "where"], "장소");
    }
    if (ev.kind === "clock" || ev.kind === "finale") {
      if (ev.clock === undefined) fail(["events", i, "clock"], `kind가 ${ev.kind}이면 clock(칸 번호)이 필요해요`);
      else if (ev.clock > island.world.clock.segments)
        fail(["events", i, "clock"], `clock ${ev.clock}이 전체 칸 수 ${island.world.clock.segments}보다 커요`);
    }
  });
  island.exits.forEach((exit, i) =>
    exit.grants.forEach((t, j) => mustExist(treasures, t, ["exits", i, "grants", j], "유물")),
  );
  if (island.meta.players.min > island.meta.players.max)
    fail(["meta", "players"], "min이 max보다 커요");
});

export type Island = z.infer<typeof IslandSchema>;

/** 스키마상 문제는 아니지만 플레이 경험상 확인해 볼 만한 점. */
export function lintIsland(island: Island): string[] {
  const warnings: string[] = [];

  if (!island.events.some((e) => e.kind === "arrival"))
    warnings.push("arrival 이벤트가 없어요 — 상륙 첫 장면이 밋밋할 수 있어요");
  if (!island.events.some((e) => e.kind === "finale"))
    warnings.push("finale 이벤트가 없어요 — 위기 시계가 다 차도 아무 일도 일어나지 않아요");

  const knownSecrets = new Set(island.npcs.flatMap((n) => n.knows.map((k) => k.secret)));
  for (const s of island.secrets)
    if (!knownSecrets.has(s.id)) warnings.push(`비밀 "${s.id}"를 아는 NPC가 없어요 — 단서를 어디서 얻을지 확인해 보세요`);

  // 시작 장소에서 숨겨지지 않은 장소로 모두 갈 수 있는지 (연결은 양방향으로 취급)
  const adj = new Map<string, Set<string>>(island.locations.map((l) => [l.id, new Set<string>()]));
  for (const l of island.locations)
    for (const to of l.connects_to) {
      adj.get(l.id)?.add(to);
      adj.get(to)?.add(l.id);
    }
  const hidden = new Set(island.locations.filter((l) => l.hidden).map((l) => l.id));
  const reached = new Set([island.world.start_location]);
  const queue = [island.world.start_location];
  while (queue.length) {
    for (const next of adj.get(queue.shift()!) ?? [])
      if (!reached.has(next) && !hidden.has(next)) {
        reached.add(next);
        queue.push(next);
      }
  }
  for (const l of island.locations)
    if (!l.hidden && !reached.has(l.id)) warnings.push(`장소 "${l.id}"는 시작 장소에서 갈 수 없어요`);

  const actsWithTrial = new Set(island.trials.map((t) => t.act));
  if (actsWithTrial.size < Math.min(2, island.story.acts.length))
    warnings.push("고난이 한 막에만 몰려 있어요 — 여러 막에 나눠 배치해 보세요");
  if (!island.treasures.length) warnings.push("유물(treasures)이 없어요 — 다른 섬으로 이어지는 연결고리가 사라져요");

  if (island.npcs.length > 1 && island.npcs.every((n) => n.relations.length === 0))
    warnings.push("NPC끼리의 관계(relations)가 하나도 없어요 — 호감도 소문이 퍼지지 않아요");

  return warnings;
}
