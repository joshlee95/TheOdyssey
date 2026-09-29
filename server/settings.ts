// Portions Copyright (c) 2026 heojunfo
// 서버 설정 — 앱 안의 ⚙️ 설정 화면에서 바꾼다. data/settings.json (git 제외, 권한 600)에 저장.
// 환경 변수(.env)가 있으면 기본값으로 쓰고, 설정 화면에서 넣은 값이 우선한다.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(import.meta.dirname, "../data/settings.json");

export type Effort = "low" | "medium" | "high";
/** adminToken: 설정을 바꿀 수 있는 관리자 비밀. 서버 콘솔에 찍히는 링크로만 받는다 */
export type Settings = { anthropicApiKey?: string; model?: string; effort?: Effort; adminToken?: string };

export const DEFAULT_MODEL = "claude-opus-5-5";
export const MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5 (기본 · 추천)" },
  { id: "claude-fable-5-1", name: "Claude Fable 5.1 (가장 뛰어남 · 비쌈)" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 (빠르고 저렴)" },
] as const;
/** 예전 설정에 저장된 이전 세대 모델 → 같은 계열 최신 모델 */
const LEGACY_MODELS: Record<string, string> = { "claude-opus-5": "claude-opus-5-5", "claude-sonnet-5": "claude-sonnet-5-5" };

let current: Settings = {};

export async function loadSettings(): Promise<Settings> {
  try {
    current = JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    current = {};
  }
  const upgraded = current.model && LEGACY_MODELS[current.model];
  if (upgraded) {
    console.log(`[settings] 모델 ${current.model} → ${upgraded} (같은 계열 최신 모델로 바꿈)`);
    await saveSettings({ ...current, model: upgraded });
  }
  if (!current.adminToken) await saveSettings({ ...current, adminToken: randomBytes(16).toString("hex") });
  return current;
}

export async function saveSettings(next: Settings) {
  current = next;
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  await chmod(FILE, 0o600);
}

export function apiKey(): string | undefined {
  return current.anthropicApiKey || process.env.ANTHROPIC_API_KEY || undefined;
}
export const model = () => current.model || process.env.GM_MODEL || DEFAULT_MODEL;
export const effort = (): Effort => current.effort || (process.env.GM_EFFORT as Effort) || "high";
export const adminToken = () => current.adminToken!;

export function isAdmin(token: unknown): boolean {
  const want = current.adminToken;
  if (!want || typeof token !== "string" || token.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(want));
}

export function publicView() {
  const key = apiKey();
  return {
    hasKey: !!key,
    masked: key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null,
    source: current.anthropicApiKey ? "settings" : process.env.ANTHROPIC_API_KEY ? "env" : null,
    model: model(),
    effort: effort(),
    models: MODELS,
  };
}
