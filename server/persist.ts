// Copyright (c) 2026 heojunfo
// 방 저장 — 서버를 다시 켜도 진행 중인 게임을 이어 할 수 있게 data/rooms.json(git 제외, 권한 600)에 둔다.
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Game } from "./game";

const FILE = path.resolve(import.meta.dirname, "../data/rooms.json");

export async function loadRooms(): Promise<Map<string, Game>> {
  const rooms = new Map<string, Game>();
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[rooms] 저장된 방을 읽지 못했어요: ${(err as Error).message}`);
    return rooms;
  }
  for (const data of Array.isArray(raw) ? raw : []) {
    try {
      const g = Game.restore(data);
      rooms.set(g.code, g);
    } catch (err) {
      console.warn(`[rooms] 방 하나를 복원하지 못했어요: ${(err as Error).message}`);
    }
  }
  return rooms;
}

/** 쓰는 도중에 꺼져도 파일이 깨지지 않게 임시 파일에 쓰고 바꿔 끼운다 */
export async function saveRooms(rooms: Map<string, Game>) {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify([...rooms.values()]), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, FILE);
}
