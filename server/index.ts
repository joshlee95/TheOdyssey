// 게임 서버 — 정적 웹 클라이언트 + Socket.IO. 실행: npm run dev (API 키가 없으면 모의 GM으로 동작)
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Server, type Socket } from "socket.io";
import { parse } from "yaml";
import { CharacterSchema, PREGENS, quickBuild, type QuickBuildInput } from "../shared/character";
import { type Island, IslandSchema } from "../shared/island";
import { ARCHETYPES, BACKGROUNDS, ORIGIN_TRAITS } from "../shared/rules";
import { parseAction } from "../shared/secret-action";
import { Game, type GM, type Rating } from "./game";
import { ClaudeGM } from "./gm/claude";
import { MockGM } from "./gm/mock";
import * as workshop from "./workshop";
import * as settings from "./settings";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB = path.join(ROOT, "web");
const PORT = Number(process.env.PORT ?? 3000);

await settings.loadSettings();
let useClaude = false;
let gm: GM = new MockGM();
/** 설정이 바뀌면 GM을 다시 만든다. 이미 진행 중인 방도 다음 라운드부터 새 GM을 쓴다 */
function configureGM() {
  const key = settings.apiKey();
  useClaude = !!key && process.env.GM !== "mock";
  gm = useClaude ? new ClaudeGM({ apiKey: key!, model: settings.model(), effort: settings.effort() }) : new MockGM();
}
configureGM();
const isLocal = (socket: Socket) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket.handshake.address);

async function loadIslands(): Promise<Map<string, Island>> {
  const dir = path.join(ROOT, "islands");
  const islands = new Map<string, Island>();
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith("_")) continue;
    try {
      const raw = parse(await readFile(path.join(dir, d.name, "island.yaml"), "utf8"));
      const r = IslandSchema.safeParse(raw);
      if (r.success) islands.set(r.data.id, r.data);
      else console.warn(`[islands] ${d.name} 검증 실패 — 건너뜀 (npm run validate -- ${d.name})`);
    } catch (err) {
      console.warn(`[islands] ${d.name} 읽기 실패: ${(err as Error).message}`);
    }
  }
  return islands;
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const file = path.normalize(path.join(WEB, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(WEB)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
const io = new Server(http);
const rooms = new Map<string, Game>();
let islands = await loadIslands();

const roomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  while (rooms.has(code));
  return code;
};

function wire(game: Game) {
  const broadcast = () => {
    for (const s of io.sockets.adapter.rooms.get(game.code) ?? []) {
      const sock = io.sockets.sockets.get(s);
      const pid = sock?.data.playerId as string | undefined;
      if (sock && pid) sock.emit("state", game.snapshot(pid));
    }
  };
  let pending: NodeJS.Timeout | null = null;
  game.on("changed", () => {
    if (pending) return;
    pending = setTimeout(() => ((pending = null), broadcast()), 50);
  });
  game.on("log", (entry) => {
    for (const s of io.sockets.adapter.rooms.get(game.code) ?? []) {
      const sock = io.sockets.sockets.get(s);
      const pid = sock?.data.playerId as string | undefined;
      const view = pid && game.viewLog(entry, pid);
      if (view) sock!.emit("log", view);
    }
  });
  game.on("gm:delta", (d: string) => io.to(game.code).emit("gm:delta", d));
  game.on("gm:status", (s: string) => io.to(game.code).emit("gm:status", s));
}

io.on("connection", (socket: Socket) => {
  const game = () => rooms.get(socket.data.code as string);
  const me = () => socket.data.playerId as string;
  const safe = (fn: (...a: any[]) => unknown) => async (...args: any[]) => {
    const ack = typeof args.at(-1) === "function" ? args.pop() : null;
    try {
      const result = await fn(...args);
      ack?.({ ok: true, ...(result as object) });
    } catch (err) {
      ack?.({ ok: false, error: (err as Error).message });
    }
  };
  const enter = (g: Game, playerId: string) => {
    socket.data.code = g.code;
    socket.data.playerId = playerId;
    socket.join(g.code);
    const p = g.players.get(playerId)!;
    p.connected = true;
    socket.emit("state", g.snapshot(playerId));
    return { code: g.code, playerId };
  };

  /** 브라우저가 가진 섬 공방 토큰들 — 공개 전 섬은 작성자에게만 보인다 */
  const myTokens = new Set<string>((socket.handshake.auth?.tokens as string[] | undefined) ?? []);
  const canSee = async (id: string) => {
    const priv = await workshop.privateIslands();
    return !priv.has(id) || myTokens.has(priv.get(id)!);
  };
  const sendMeta = async () => socket.emit("meta", {
    gm: gm.name,
    islands: (await Promise.all([...islands.values()].map(async (i) => ((await canSee(i.id)) ? i : null))))
      .filter((i): i is Island => !!i)
      .map((i) => ({
      id: i.id, title: i.meta.title, tagline: i.meta.tagline, rating: i.meta.content.rating, genre: i.world.reality.genre,
      rumor: i.public.rumor, author: i.meta.author,
    })),
    pregens: PREGENS,
    archetypes: ARCHETYPES,
    traits: ORIGIN_TRAITS,
    backgrounds: BACKGROUNDS,
  });
  void sendMeta();

  socket.on("room:create", safe(({ nickname, rating, adult }: { nickname: string; rating: Rating; adult: boolean }) => {
    if (!nickname?.trim()) throw new Error("닉네임을 입력해 주세요");
    if (rating === "mature" && !adult) throw new Error("성인 등급 방은 성인임을 확인해야 만들 수 있어요");
    const g = new Game(roomCode(), rating);
    rooms.set(g.code, g);
    wire(g);
    return enter(g, g.join(nickname.trim()).id);
  }));

  socket.on("room:join", safe(({ code, nickname, adult }: { code: string; nickname: string; adult: boolean }) => {
    const g = rooms.get(code?.toUpperCase());
    if (!g) throw new Error("없는 방이에요");
    if (!nickname?.trim()) throw new Error("닉네임을 입력해 주세요");
    if (g.rating === "mature" && !adult) throw new Error("성인 등급 방이에요. 성인임을 확인해야 들어갈 수 있어요");
    return enter(g, g.join(nickname.trim()).id);
  }));

  socket.on("room:resume", safe(({ code, playerId }: { code: string; playerId: string }) => {
    const g = rooms.get(code);
    if (!g || !g.players.has(playerId)) throw new Error("이어서 할 방이 없어요");
    return enter(g, playerId);
  }));

  socket.on("character:pregen", safe((index: number) => {
    const input = PREGENS[index];
    if (!input) throw new Error("없는 캐릭터예요");
    game()!.setCharacter(me(), quickBuild(input));
  }));

  socket.on("character:quick", safe((input: QuickBuildInput) => {
    game()!.setCharacter(me(), quickBuild(input));
  }));

  socket.on("character:full", safe((raw: unknown) => {
    game()!.setCharacter(me(), CharacterSchema.parse(raw));
  }));

  socket.on("island:start", safe(async (islandId: string) => {
    const g = game()!;
    if (g.hostId !== me()) throw new Error("방장만 섬을 고를 수 있어요");
    islands = await loadIslands();
    const island = islands.get(islandId);
    if (!island || !(await canSee(islandId))) throw new Error("없는 섬이에요");
    void g.startIsland(island, gm).catch((err) => g.addLog({ type: "system", text: `⚠️ ${err.message}` }));
  }));

  socket.on("action:submit", safe(async (a: { kind: "do" | "say" | "pass"; text: string; useInspiration?: boolean }) => {
    const g = game()!;
    g.submitAction(me(), { kind: a.kind, text: (a.text ?? "").slice(0, 1000), useInspiration: !!a.useInspiration });
    if (g.allSubmitted()) void g.resolveRound(gm);
  }));

  socket.on("action:retract", safe(() => game()!.retractAction(me())));

  socket.on("round:resolve", safe(() => {
    const g = game()!;
    if (g.hostId !== me()) throw new Error("방장만 라운드를 진행할 수 있어요");
    void g.resolveRound(gm);
  }));

  socket.on("action:preview", safe((text: string) => parseAction(String(text ?? ""))));
  socket.on("hidden:confess", safe((id: string) => game()!.confess(me(), id)));
  socket.on("xcard", safe(() => game()!.xcard()));
  socket.on("chat", safe((text: string) => game()!.chat(me(), String(text).slice(0, 500))));

  // ── 설정 (서버 컴퓨터에서만 바꿀 수 있다) ─────────────────
  socket.on("settings:get", safe(() => ({ ...settings.publicView(), canEdit: isLocal(socket), gm: gm.name })));
  socket.on("settings:set", safe(async (input: { apiKey?: string; model?: string; effort?: settings.Effort; clearKey?: boolean }) => {
    if (!isLocal(socket)) throw new Error("설정은 서버를 켠 컴퓨터에서만 바꿀 수 있어요");
    const cur = await settings.loadSettings();
    const next: settings.Settings = { ...cur };
    if (input.clearKey) delete next.anthropicApiKey;
    const key = input.apiKey?.trim();
    if (key) {
      if (!key.startsWith("sk-ant-")) throw new Error("Anthropic API 키는 sk-ant- 로 시작해요");
      next.anthropicApiKey = key;
    }
    if (input.model) {
      if (!settings.MODELS.some((m) => m.id === input.model)) throw new Error("모르는 모델이에요");
      next.model = input.model;
    }
    if (input.effort && ["low", "medium", "high"].includes(input.effort)) next.effort = input.effort;
    // 키가 실제로 쓸 수 있는지 한 번 확인한다
    const testKey = next.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (testKey && (key || input.model)) {
      try {
        await new Anthropic({ apiKey: testKey }).models.retrieve(next.model || settings.model());
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) throw new Error("키가 올바르지 않아요. 다시 확인해 주세요");
        if (err instanceof Anthropic.NotFoundError) throw new Error("이 키로는 그 모델을 쓸 수 없어요");
        if (err instanceof Anthropic.APIError) throw new Error(`확인 실패: ${err.message}`);
        throw err;
      }
    }
    await settings.saveSettings(next);
    configureGM();
    io.emit("gm:changed", gm.name);
    return { ...settings.publicView(), canEdit: true, gm: gm.name };
  }));

  // ── 섬 공방 ─────────────────────────────────────────────
  socket.on("workshop:create", safe(async ({ author, title }: { author: string; title: string }) => {
    const r = await workshop.create(String(author ?? ""), String(title ?? ""));
    myTokens.add(r.token);
    return r;
  }));
  socket.on("workshop:mine", safe(async (tokens: string[]) => {
    for (const t of tokens ?? []) myTokens.add(t);
    return { islands: (await Promise.all((tokens ?? []).map((t) => workshop.listMine(t)))).flat() };
  }));
  socket.on("workshop:load", safe(({ id, token }: { id: string; token: string }) => workshop.load(id, token)));
  socket.on("workshop:save", safe(({ id, token, draft, title }: { id: string; token: string; draft: string; title?: string }) =>
    workshop.save(id, token, String(draft ?? ""), title)));
  socket.on("workshop:build", safe(async ({ id, token }: { id: string; token: string }) => {
    if (!useClaude) throw new Error("섬으로 만들려면 서버에 ANTHROPIC_API_KEY가 필요해요 (.env)");
    const r = await workshop.build(id, token, (msg) => socket.emit("workshop:progress", msg), { apiKey: settings.apiKey()!, model: settings.model() });
    islands = await loadIslands();
    await sendMeta();
    return r;
  }));
  socket.on("workshop:publish", safe(async ({ id, token, published }: { id: string; token: string; published: boolean }) => {
    const r = await workshop.publish(id, token, !!published);
    await sendMeta();
    return r;
  }));
  /** 혼자 해 보기: 작성자 혼자 들어간 방을 만들고 바로 그 섬에 상륙한다 */
  socket.on("workshop:solo", safe(async ({ islandId, nickname, rating, adult, pregen }: { islandId: string; nickname: string; rating: Rating; adult: boolean; pregen: number }) => {
    islands = await loadIslands();
    const island = islands.get(islandId);
    if (!island || !(await canSee(islandId))) throw new Error("그 섬은 아직 플레이할 수 없어요. 내 섬이면 먼저 '섬으로 만들기'를 해 주세요");
    if (rating === "mature" && !adult) throw new Error("성인 등급으로 해 보려면 성인 확인이 필요해요");
    const g = new Game(roomCode(), rating);
    rooms.set(g.code, g);
    wire(g);
    const player = g.join(String(nickname || "선원"));
    g.setCharacter(player.id, quickBuild(PREGENS[pregen] ?? PREGENS[0]));
    void g.startIsland(island, gm).catch((err) => g.addLog({ type: "system", text: `⚠️ ${err.message}` }));
    return { code: g.code, playerId: player.id };
  }));

  socket.on("disconnect", () => {
    const g = game();
    const p = g?.players.get(me());
    if (p) {
      p.connected = false;
      g!.emit("changed");
    }
  });
});

http.listen(PORT, () => {
  console.log(`⛵ The Odyssey — http://localhost:${PORT}`);
  console.log(`   GM: ${gm.name}${useClaude ? "" : " — ANTHROPIC_API_KEY를 설정하면 Claude GM으로 바뀝니다"}`);
  console.log(`   섬 ${islands.size}개: ${[...islands.keys()].join(", ")}`);
});
