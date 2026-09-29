// 서버 설정 — 앱 안의 ⚙️ 설정 화면에서 바꾼다. data/settings.json (git 제외, 권한 600)에 저장.
// 환경 변수(.env)가 있으면 기본값으로 쓰고, 설정 화면에서 넣은 값이 우선한다.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(import.meta.dirname, "../data/settings.json");

export type Effort = "low" | "medium" | "high";
export type Settings = { anthropicApiKey?: string; model?: string; effort?: Effort };

export const MODELS = [
  { id: "claude-opus-5", name: "Claude Opus 5 (기본 · 추천)" },
  { id: "claude-fable-5-1", name: "Claude Fable 5.1 (가장 뛰어남 · 비쌈)" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5 (빠르고 저렴)" },
] as const;

let current: Settings = {};

export async function loadSettings(): Promise<Settings> {
  try {
    current = JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    current = {};
  }
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
export const model = () => current.model || process.env.GM_MODEL || "claude-opus-5";
export const effort = (): Effort => current.effort || (process.env.GM_EFFORT as Effort) || "high";

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
