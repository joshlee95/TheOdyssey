// Portions Copyright (c) 2026 heojunfo
// 게임 서버 — 정적 웹 클라이언트 + Socket.IO. 실행: npm run dev (API 키가 없으면 모의 GM으로 동작)
import { randomInt } from "node:crypto";
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
import { check, Input, limit, sameOrigin, sweepLimits } from "./guard";
import { loadRooms, saveRooms } from "./persist";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB = path.join(ROOT, "web");
const PORT = Number(process.env.PORT ?? 3000);
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 100);
/** 아무도 접속해 있지 않은 방을 이만큼 두었다가 지운다 */
const IDLE_ROOM_MS = 6 * 60 * 60 * 1000;

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
const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
/** 서버 컴퓨터에서 접속했는지. ngrok 같은 터널은 모든 접속을 localhost로 보이게 하므로 이것만으로는 부족하다 → 관리자 토큰도 본다 */
const isLocal = (socket: Socket) => LOOPBACK.includes(socket.handshake.address);
const canEditSettings = (socket: Socket, adminToken: unknown) => isLocal(socket) && settings.isAdmin(adminToken);
/** 호출 제한용 접속자 구분. 터널 뒤에서는 모두 localhost라 프록시가 붙인 X-Forwarded-For를 쓴다 */
function clientKey(socket: Socket): string {
  const addr = socket.handshake.address;
  const fwd = String(socket.handshake.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return LOOPBACK.includes(addr) && fwd ? fwd : addr;
}

async function loadIslands(): Promise<Map<string, Island>> {
  const dir = path.join(ROOT, "islands");
  const islands = new Map<string, Island>();
  for (const d of await readdir(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith("_")) continue;
    try {
      const raw = parse(await readFile(path.join(dir, d.name, "island.yaml"), "utf8"));
      const r = IslandSchema.safeParse(raw);
      if (r.success) {
        // 섬은 폴더 이름으로 찾는다. yaml 안의 id가 달라도 다른 섬(특히 공식 섬)을 덮어쓰지 못하게
        if (r.data.id !== d.name) console.warn(`[islands] ${d.name}: island.yaml의 id(${r.data.id})가 폴더 이름과 달라 폴더 이름을 씁니다`);
        islands.set(d.name, { ...r.data, id: d.name });
      } else console.warn(`[islands] ${d.name} 검증 실패 — 건너뜀 (npm run validate -- ${d.name})`);
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
  if (!file.startsWith(WEB + path.sep)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
// 다른 웹사이트에서 온 접속은 받지 않는다 (WebSocket에는 CORS가 없어서 직접 막아야 한다)
const io = new Server(http, {
  allowRequest: (req, cb) => cb(null, sameOrigin(req)),
  maxHttpBufferSize: 200_000,
});
const rooms = await loadRooms();
for (const g of rooms.values()) wire(g);
let islands = await loadIslands();

const roomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join("");
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
  const room = () => {
    const g = game();
    if (!g) throw new Error("먼저 방에 들어와 주세요");
    return g;
  };
  const client = clientKey(socket);
  /** 제한을 확인하고 핸들러를 실행한다 */
  const limited = (event: string, fn: (...a: any[]) => unknown) => safe((...a: any[]) => (limit(event, client), fn(...a)));
  const enter = (g: Game, playerId: string) => {
    if (socket.data.code) socket.leave(socket.data.code);
    socket.data.code = g.code;
    socket.data.playerId = playerId;
    socket.join(g.code);
    const p = g.players.get(playerId)!;
    p.connected = true;
    emptySince.delete(g.code);
    socket.emit("state", g.snapshot(playerId));
    g.emit("changed");
    // 재접속 토큰은 본인에게만 준다. 선원 id는 모두에게 보이므로 id만으로는 들어올 수 없다
    return { code: g.code, playerId, token: g.resumeToken(playerId) };
  };
  const newRoom = (rating: Rating) => {
    if (rooms.size >= MAX_ROOMS) throw new Error("서버에 방이 너무 많아요. 잠시 뒤에 다시 해 주세요");
    const g = new Game(roomCode(), rating);
    rooms.set(g.code, g);
    wire(g);
    return g;
  };
  /** Claude를 부르는 라운드 진행 — 실패해도 서버가 죽지 않게 받아 둔다 */
  const resolve = (g: Game) => {
    limit("round", client);
    g.resolveRound(gm).catch((err) => {
      console.error(err);
      g.addLog({ type: "system", text: `⚠️ ${(err as Error).message}` });
    });
  };

  /** 브라우저가 가진 섬 공방 토큰들 — 공개 전 섬은 작성자에게만 보인다 */
  const myTokens = new Set<string>(check(Input.handshakeTokens, socket.handshake.auth?.tokens));
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
  sendMeta().catch((err) => console.error("[meta]", err));

  socket.on("room:create", limited("room:create", (raw: unknown) => {
    const { nickname, rating, adult } = check(Input.roomCreate, raw);
    if (rating === "mature" && !adult) throw new Error("성인 등급 방은 성인임을 확인해야 만들 수 있어요");
    const g = newRoom(rating);
    return enter(g, g.join(nickname).id);
  }));

  socket.on("room:join", limited("room:join", (raw: unknown) => {
    const { code, nickname, adult } = check(Input.roomJoin, raw);
    const g = rooms.get(code.toUpperCase());
    if (!g) throw new Error("없는 방이에요");
    if (g.rating === "mature" && !adult) throw new Error("성인 등급 방이에요. 성인임을 확인해야 들어갈 수 있어요");
    return enter(g, g.join(nickname).id);
  }));

  socket.on("room:resume", limited("room:join", (raw: unknown) => {
    const { code, playerId, token } = check(Input.roomResume, raw);
    const g = rooms.get(code);
    if (!g || !g.players.has(playerId) || !g.checkResumeToken(playerId, token)) throw new Error("이어서 할 방이 없어요");
    return enter(g, playerId);
  }));

  socket.on("character:pregen", safe((raw: unknown) => {
    const input = PREGENS[check(Input.pregen, raw)];
    if (!input) throw new Error("없는 캐릭터예요");
    room().setCharacter(me(), quickBuild(input));
  }));

  socket.on("character:quick", safe((input: QuickBuildInput) => {
    room().setCharacter(me(), quickBuild(input));
  }));

  socket.on("character:full", safe((raw: unknown) => {
    room().setCharacter(me(), check(CharacterSchema, raw));
  }));

  socket.on("island:start", limited("island:start", async (raw: unknown) => {
    const islandId = check(Input.islandId, raw);
    const g = room();
    if (g.hostId !== me()) throw new Error("방장만 섬을 고를 수 있어요");
    islands = await loadIslands();
    const island = islands.get(islandId);
    if (!island || !(await canSee(islandId))) throw new Error("없는 섬이에요");
    g.startIsland(island, gm).catch((err) => g.addLog({ type: "system", text: `⚠️ ${(err as Error).message}` }));
  }));

  socket.on("action:submit", safe((raw: unknown) => {
    const a = check(Input.action, raw);
    const g = room();
    g.submitAction(me(), a);
    if (g.allSubmitted()) resolve(g);
  }));

  socket.on("action:retract", safe(() => room().retractAction(me())));

  socket.on("round:resolve", safe(() => {
    const g = room();
    if (g.hostId !== me()) throw new Error("방장만 라운드를 진행할 수 있어요");
    if (!g.visit) throw new Error("먼저 섬을 골라 주세요");
    resolve(g);
  }));

  socket.on("action:preview", safe((raw: unknown) => parseAction(check(Input.text(1000), raw ?? ""))));
  socket.on("hidden:confess", safe((raw: unknown) => room().confess(me(), check(Input.text(32), raw))));
  socket.on("xcard", safe(() => room().xcard()));
  socket.on("chat", safe((raw: unknown) => room().chat(me(), check(Input.text(500), raw))));

  // ── 설정 (서버 컴퓨터에서, 콘솔에 찍힌 설정 링크로 연 브라우저만 바꿀 수 있다) ─────
  socket.on("settings:get", safe((adminToken: unknown) => ({ ...settings.publicView(), canEdit: canEditSettings(socket, adminToken), gm: gm.name })));
  socket.on("settings:set", limited("settings:set", async (raw: unknown) => {
    const input = check(Input.settings, raw);
    if (!canEditSettings(socket, input.adminToken)) throw new Error("설정은 서버를 켠 컴퓨터에서, 서버 콘솔에 표시된 설정 링크로 열어야 바꿀 수 있어요");
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
    if (input.effort) next.effort = input.effort;
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
  socket.on("workshop:create", limited("workshop:create", async (raw: unknown) => {
    const { author, title } = check(Input.workshopCreate, raw);
    const r = await workshop.create(author, title);
    myTokens.add(r.token);
    return r;
  }));
  socket.on("workshop:mine", safe(async (raw: unknown) => {
    const tokens = check(Input.workshopTokens, raw ?? []);
    for (const t of tokens) myTokens.add(t);
    return { islands: (await Promise.all(tokens.map((t) => workshop.listMine(t)))).flat() };
  }));
  socket.on("workshop:load", safe((raw: unknown) => {
    const { id, token } = check(Input.workshopRef, raw);
    return workshop.load(id, token);
  }));
  socket.on("workshop:save", safe((raw: unknown) => {
    const { id, token, draft, title } = check(Input.workshopSave, raw);
    return workshop.save(id, token, draft, title);
  }));
  socket.on("workshop:build", limited("workshop:build", async (raw: unknown) => {
    const { id, token } = check(Input.workshopRef, raw);
    if (!useClaude) throw new Error("섬으로 만들려면 ⚙️ 설정에서 Anthropic API 키를 넣어 주세요");
    if (building.has(id)) throw new Error("이 섬은 이미 만드는 중이에요. 끝날 때까지 기다려 주세요");
    building.add(id);
    try {
      const r = await workshop.build(id, token, (msg) => socket.emit("workshop:progress", msg), { apiKey: settings.apiKey()!, model: settings.model() });
      islands = await loadIslands();
      await sendMeta();
      return r;
    } finally {
      building.delete(id);
    }
  }));
  socket.on("workshop:publish", safe(async (raw: unknown) => {
    const { id, token, published } = check(Input.workshopPublish, raw);
    const r = await workshop.publish(id, token, published);
    await sendMeta();
    return r;
  }));
  /** 혼자 해 보기: 작성자 혼자 들어간 방을 만들고 바로 그 섬에 상륙한다 */
  socket.on("workshop:solo", limited("workshop:solo", async (raw: unknown) => {
    const { islandId, nickname, rating, adult, pregen } = check(Input.workshopSolo, raw);
    islands = await loadIslands();
    const island = islands.get(islandId);
    if (!island || !(await canSee(islandId))) throw new Error("그 섬은 아직 플레이할 수 없어요. 내 섬이면 먼저 '섬으로 만들기'를 해 주세요");
    if (rating === "mature" && !adult) throw new Error("성인 등급으로 해 보려면 성인 확인이 필요해요");
    const g = newRoom(rating);
    const player = g.join(nickname || "선원");
    g.setCharacter(player.id, quickBuild(PREGENS[pregen] ?? PREGENS[0]));
    g.startIsland(island, gm).catch((err) => g.addLog({ type: "system", text: `⚠️ ${(err as Error).message}` }));
    return { code: g.code, playerId: player.id, token: g.resumeToken(player.id) };
  }));

  socket.on("disconnect", () => {
    const g = game();
    const p = g?.players.get(me());
    if (p) {
      // 같은 선원이 다른 탭으로 이미 다시 들어와 있으면 접속 끊김으로 표시하지 않는다
      const stillHere = [...(io.sockets.adapter.rooms.get(g!.code) ?? [])].some((s) => s !== socket.id && io.sockets.sockets.get(s)?.data.playerId === p.id);
      p.connected = stillHere;
      if (![...g!.players.values()].some((x) => x.connected)) emptySince.set(g!.code, Date.now());
      g!.emit("changed");
    }
  });
});

// ── 방 정리 · 저장 · 종료 ──────────────────────────────────────
/** 섬 공방에서 지금 만드는 중인 섬 (같은 섬을 겹쳐 만들어 비용이 두 번 들지 않게) */
const building = new Set<string>();
/** 방 코드 → 마지막 선원이 나간 시각 */
const emptySince = new Map<string, number>();
for (const g of rooms.values()) emptySince.set(g.code, Date.now());

setInterval(() => {
  const now = Date.now();
  for (const [code, since] of emptySince) {
    if (now - since < IDLE_ROOM_MS) continue;
    rooms.get(code)?.removeAllListeners();
    rooms.delete(code);
    emptySince.delete(code);
    console.log(`[rooms] ${code} — 오래 비어 있어 정리했어요`);
  }
  sweepLimits();
}, 10 * 60 * 1000).unref();

const persist = () => saveRooms(rooms).catch((err) => console.error("[rooms] 저장 실패:", (err as Error).message));
setInterval(persist, 30 * 1000).unref();

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} — 방 ${rooms.size}개를 저장하고 끕니다`);
  io.close();
  await persist();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// 놓친 오류 하나로 모든 방이 날아가지 않게 기록만 하고 계속 돈다
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

http.listen(PORT, () => {
  console.log(`⛵ The Odyssey — http://localhost:${PORT}`);
  console.log(`   GM: ${gm.name}${useClaude ? "" : " — ⚙️ 설정에서 API 키를 넣으면 Claude GM으로 바뀝니다"}`);
  console.log(`   섬 ${islands.size}개: ${[...islands.keys()].join(", ")}${rooms.size ? ` · 이어 할 방 ${rooms.size}개` : ""}`);
  console.log(`   ⚙️ 설정 링크 (이 컴퓨터에서만, 남에게 보내지 마세요): http://localhost:${PORT}/#admin=${settings.adminToken()}`);
});
