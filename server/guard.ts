// Copyright (c) 2026 heojunfo
// 소켓 입력 검증과 호출 제한. 브라우저가 보내는 값은 믿지 않고 여기서 모양과 길이를 확인한다.
import type { IncomingMessage } from "node:http";
import { z } from "zod";

// ── 입력 스키마 ───────────────────────────────────────────────────

const Nickname = z.string().trim().min(1, "닉네임을 입력해 주세요").max(20, "닉네임은 20자까지예요");
const Rating = z.enum(["all", "teen", "mature"], "등급을 골라 주세요");
const Id = z.string().max(64);
const Token = z.string().max(64);

export const Input = {
  handshakeTokens: z.array(Token).max(50).catch([]),
  roomCreate: z.object({ nickname: Nickname, rating: Rating, adult: z.boolean().default(false) }),
  roomJoin: z.object({ code: z.string().max(8), nickname: Nickname, adult: z.boolean().default(false) }),
  roomResume: z.object({ code: z.string().max(8), playerId: Id, token: Token }),
  pregen: z.number().int().min(0),
  islandId: Id,
  action: z.object({ kind: z.enum(["do", "say", "pass"]), text: z.string().max(1000).default(""), useInspiration: z.boolean().default(false) }),
  text: (max: number) => z.string().max(max),
  settings: z.object({
    adminToken: Token,
    apiKey: z.string().max(300).optional(),
    model: z.string().max(64).optional(),
    effort: z.enum(["low", "medium", "high"]).optional(),
    clearKey: z.boolean().optional(),
  }),
  workshopCreate: z.object({ author: z.string().trim().max(20), title: z.string().trim().max(60).default("") }),
  workshopTokens: z.array(Token).max(50),
  workshopRef: z.object({ id: Id, token: Token }),
  workshopSave: z.object({ id: Id, token: Token, draft: z.string().max(60_000, "글이 너무 길어요 (6만 자까지)"), title: z.string().max(60).optional() }),
  workshopPublish: z.object({ id: Id, token: Token, published: z.boolean() }),
  workshopSolo: z.object({ islandId: Id, nickname: z.string().trim().max(20).default(""), rating: Rating, adult: z.boolean().default(false), pregen: z.number().int().min(0).default(0) }),
};

/** zod 오류를 사람이 읽을 한 줄로 */
export function check<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "잘못된 입력이에요");
  return r.data;
}

// ── 호출 제한 ─────────────────────────────────────────────────────

type Rule = { max: number; windowMs: number };
const MIN = 60_000;
/** 이벤트별 제한. perClient는 접속자 하나, global은 서버 전체 (Claude 비용이 드는 것 위주) */
export const LIMITS: Record<string, { perClient: Rule; global?: Rule }> = {
  "room:create": { perClient: { max: 10, windowMs: 10 * MIN }, global: { max: 60, windowMs: 10 * MIN } },
  "room:join": { perClient: { max: 30, windowMs: MIN } },
  "island:start": { perClient: { max: 5, windowMs: 10 * MIN }, global: { max: 30, windowMs: 10 * MIN } },
  "round": { perClient: { max: 20, windowMs: 10 * MIN }, global: { max: 120, windowMs: 10 * MIN } },
  "workshop:create": { perClient: { max: 5, windowMs: 60 * MIN }, global: { max: 30, windowMs: 60 * MIN } },
  "workshop:build": { perClient: { max: 3, windowMs: 30 * MIN }, global: { max: 10, windowMs: 30 * MIN } },
  "workshop:solo": { perClient: { max: 5, windowMs: 10 * MIN }, global: { max: 30, windowMs: 10 * MIN } },
  "settings:set": { perClient: { max: 10, windowMs: MIN } },
};

const hits = new Map<string, number[]>();

function allow(key: string, rule: Rule, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (recent.length >= rule.max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/** 제한을 넘으면 던진다. client는 접속자를 구분하는 값(IP 등) */
export function limit(event: string, client: string) {
  const rule = LIMITS[event];
  if (!rule) return;
  const now = Date.now();
  if (rule.global && !allow(`*:${event}`, rule.global, now)) throw new Error("지금 서버에 요청이 몰렸어요. 잠시 뒤에 다시 해 주세요");
  if (!allow(`${client}:${event}`, rule.perClient, now)) throw new Error("너무 자주 요청했어요. 잠시 뒤에 다시 해 주세요");
}

/** 오래된 기록 정리 (메모리가 계속 늘지 않게) */
export function sweepLimits() {
  const now = Date.now();
  const longest = Math.max(...Object.values(LIMITS).flatMap((r) => [r.perClient.windowMs, r.global?.windowMs ?? 0]));
  for (const [key, times] of hits) if (!times.some((t) => now - t < longest)) hits.delete(key);
}

// ── 접속 출처 ─────────────────────────────────────────────────────

/**
 * 다른 웹사이트가 방문자의 브라우저로 이 서버에 붙는 것을 막는다 (WebSocket에는 CORS가 없다).
 * Origin이 없으면(브라우저가 아닌 도구) 통과, 있으면 접속한 Host와 같거나 ALLOWED_ORIGINS에 있어야 한다.
 */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  const forwarded = String(req.headers["x-forwarded-host"] ?? "").split(",")[0].trim();
  return host === req.headers.host || (!!forwarded && host === forwarded);
}
