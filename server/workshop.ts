// 섬 공방 — 친구가 브라우저에서 자유롭게 섬을 쓰고, Claude로 섬 팩을 만들고, 혼자 먼저 플레이해 본다.
// 저장: islands/<id>/draft.md (자유 서술), island.yaml (변환 결과), workshop.json (작성자·비밀 토큰·공개 여부·리뷰)
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { buildIsland, type BuildResult } from "./island-builder";

const ROOT = path.resolve(import.meta.dirname, "../islands");

export type WorkshopMeta = {
  id: string;
  author: string;
  /** 작성자 브라우저에만 있는 비밀. 이게 있어야 초안을 읽고 고칠 수 있다 */
  token: string;
  title: string;
  published: boolean;
  updatedAt: number;
  review?: Omit<BuildResult, "island"> & { builtAt: number };
};

const metaPath = (id: string) => path.join(ROOT, id, "workshop.json");
const safeId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);

async function readMeta(id: string): Promise<WorkshopMeta | null> {
  if (!safeId(id)) return null;
  try {
    return JSON.parse(await readFile(metaPath(id), "utf8"));
  } catch {
    return null;
  }
}

async function mustOwn(id: string, token: string): Promise<WorkshopMeta> {
  const meta = await readMeta(id);
  if (!meta) throw new Error("MISSING:이 섬이 서버에 없어요. 목록에서 뺄게요");
  if (meta.token !== token) throw new Error("이 섬을 고칠 권한이 없어요");
  return meta;
}

/** 공방에서 만든 섬 중 아직 공개하지 않은 섬 id → 작성자 토큰 (섬 목록 필터용) */
export async function privateIslands(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const d of await readdir(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const meta = await readMeta(d.name);
    if (meta && !meta.published) out.set(meta.id, meta.token);
  }
  return out;
}

export async function listMine(token: string) {
  const mine = [];
  for (const d of await readdir(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const meta = await readMeta(d.name);
    if (meta?.token === token) mine.push({ id: meta.id, title: meta.title, published: meta.published, updatedAt: meta.updatedAt, built: !!meta.review });
  }
  return mine.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function create(author: string, title: string) {
  if (!author.trim()) throw new Error("닉네임을 입력해 주세요");
  const id = `isle-${randomBytes(3).toString("hex")}`;
  const token = randomBytes(16).toString("hex");
  await mkdir(path.join(ROOT, id), { recursive: true });
  const meta: WorkshopMeta = { id, author: author.trim(), token, title: title.trim() || "제목 없는 섬", published: false, updatedAt: Date.now() };
  await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  await writeFile(path.join(ROOT, id, "draft.md"), "");
  return { id, token };
}

export async function load(id: string, token: string) {
  const meta = await mustOwn(id, token);
  const draft = await readFile(path.join(ROOT, id, "draft.md"), "utf8").catch(() => "");
  return { id, title: meta.title, author: meta.author, published: meta.published, draft, review: meta.review ?? null };
}

export async function save(id: string, token: string, draft: string, title?: string) {
  const meta = await mustOwn(id, token);
  if (draft.length > 60_000) throw new Error("글이 너무 길어요 (6만 자까지)");
  await writeFile(path.join(ROOT, id, "draft.md"), draft);
  meta.updatedAt = Date.now();
  if (title?.trim()) meta.title = title.trim();
  await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return { savedAt: meta.updatedAt };
}

export async function build(id: string, token: string, onProgress: (msg: string) => void, claude: { apiKey: string; model: string }) {
  const meta = await mustOwn(id, token);
  const draft = await readFile(path.join(ROOT, id, "draft.md"), "utf8");
  if (draft.trim().length < 30) throw new Error("섬 이야기를 조금만 더 써 주세요 (30자 이상)");
  const current = await readFile(path.join(ROOT, id, "island.yaml"), "utf8").catch(() => null);
  const result = await buildIsland({ id, author: meta.author, draft, current, onProgress, ...claude });
  await writeFile(path.join(ROOT, id, "island.yaml"), `# 섬 공방에서 생성됨 (작성자 ${meta.author})\n${stringify(result.island, { lineWidth: 0 })}`);
  const { island, ...review } = result;
  meta.review = { ...review, builtAt: Date.now() };
  meta.title = island.meta.title;
  meta.updatedAt = Date.now();
  await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return {
    review: meta.review,
    preview: { title: island.meta.title, tagline: island.meta.tagline, rumor: island.public.rumor, genre: island.world.reality.genre,
      npcs: island.npcs.map((n) => `${n.name} — ${n.role}`), acts: island.story.acts.map((a) => a.name) },
  };
}

export async function publish(id: string, token: string, published: boolean) {
  const meta = await mustOwn(id, token);
  if (published && !meta.review) throw new Error("먼저 '섬으로 만들기'를 해 주세요");
  meta.published = published;
  await writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return { published };
}
