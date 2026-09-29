// 비밀 행동: 행동 텍스트의 (괄호) 부분은 행동자와 AI GM만 안다.
// 다른 선원에게는 자리표시 문구만 보이고, 들키거나 스스로 밝힐 때 GM이 진실을 공개한다.
//
//   입력   50골드를 준다 (실은 무게만 맞춘 돌멩이 주머니를 건넨다)
//   공개   50골드를 준다 (미심쩍은 행동을 했다)
//   비밀   ["실은 무게만 맞춘 돌멩이 주머니를 건넨다"]

export const SECRET_PLACEHOLDER = "(미심쩍은 행동을 했다)";

const OPEN = new Set(["(", "（"]);
const CLOSE = new Set([")", "）"]);
const SECRET = Symbol("secret");

export type ParsedAction = {
  /** 다른 선원에게 보여 줄 문장 */
  publicText: string;
  /** 괄호 안 원문 (나온 순서대로) */
  secrets: string[];
};

/**
 * 괄호 규칙
 * - `(…)`, `（…）` 안은 비밀. 괄호가 중첩되면 가장 바깥 괄호 기준
 * - 닫히지 않은 괄호는 끝까지 비밀로 처리 (오타로 비밀이 새지 않게)
 * - `\(`, `\)`는 괄호 문자 그대로 공개
 * - 비밀 여러 개가 붙어 있으면 자리표시는 하나만
 */
export function parseAction(raw: string): ParsedAction {
  const parts: (string | typeof SECRET)[] = [];
  const secrets: string[] = [];
  let text = "";
  let secret = "";
  let depth = 0;

  const closeSecret = () => {
    const s = secret.trim();
    secret = "";
    if (!s) return; // 빈 괄호는 무시
    parts.push(text, SECRET);
    text = "";
    secrets.push(s);
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1] ?? "";
    if (ch === "\\" && (OPEN.has(next) || CLOSE.has(next))) {
      if (depth > 0) secret += next;
      else text += next;
      i++;
    } else if (OPEN.has(ch)) {
      if (depth > 0) secret += ch;
      depth++;
    } else if (CLOSE.has(ch) && depth > 0) {
      depth--;
      if (depth > 0) secret += ch;
      else closeSecret();
    } else if (depth > 0) {
      secret += ch;
    } else {
      text += ch;
    }
  }
  if (depth > 0) closeSecret();
  parts.push(text);

  let out = "";
  let lastWasSecret = false;
  for (const p of parts) {
    if (p === SECRET) {
      if (!lastWasSecret) out += SECRET_PLACEHOLDER;
      lastWasSecret = true;
    } else {
      if (p.trim()) lastWasSecret = false;
      out += p;
    }
  }
  return { publicText: out.replace(/\s+/g, " ").trim(), secrets };
}

export type SecretStatus =
  | "hidden" // 아직 아무도 모름 (행동자와 knownBy만 앎)
  | "exposed" // 판정 실패나 조사로 들킴
  | "confessed" // 행동자가 스스로 밝힘
  | "epilogue"; // 캠페인 피날레에서 공개

export type SecretAction = {
  id: string;
  playerId: string;
  round: number;
  publicText: string;
  secret: string;
  status: SecretStatus;
  /** 행동자 외에 진실을 아는 선원 (조사 성공 등) */
  knownBy: string[];
  revealedRound?: number;
  /** 공개 시 모두에게 보이는 시스템 설명 */
  revealNote?: string;
};

/** 이 선원에게 비밀 원문을 보여 줘도 되는지 */
export function canSeeSecret(s: SecretAction, viewerId: string): boolean {
  return s.status !== "hidden" || s.playerId === viewerId || s.knownBy.includes(viewerId);
}

export const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GM 프롬프트에 넣을 선원 행동 블록. 선원이 쓴 텍스트는 태그를 만들 수 없게 이스케이프한다. */
export function formatActionForGm(
  player: { id: string; name: string },
  publicText: string,
  secrets: Pick<SecretAction, "id" | "secret">[],
): string {
  const lines = [
    `<action player="${player.id}" name="${escapeXml(player.name)}">`,
    `  <public>${escapeXml(publicText)}</public>`,
    ...secrets.map((s) => `  <secret id="${s.id}">${escapeXml(s.secret)}</secret>`),
    `</action>`,
  ];
  return lines.join("\n");
}
