// 한국어 서술의 AI 티 검사 — docs/style/ai-tells-ko.json의 패턴을 센다.
// 출처: im-not-ai(MIT), koreanizer(MIT), creative-writing-skills(Apache-2.0)의 분류를 바탕으로 한 우리 목록.
import tells from "../docs/style/ai-tells-ko.json" with { type: "json" };

export type Tell = { id: string; category: string; pattern: string; max: number; severity: string };
const PATTERNS = (tells.patterns as Tell[]).map((t) => ({ ...t, re: new RegExp(t.pattern, "g") }));
export const TELL_THRESHOLD = tells._meta.threshold;

export type LintHit = { id: string; category: string; count: number; max: number; samples: string[] };

/** 텍스트 하나에서 max를 넘은 패턴만 돌려준다. score = 초과 횟수의 합 */
export function lintProse(text: string): { score: number; hits: LintHit[] } {
  const hits: LintHit[] = [];
  let score = 0;
  for (const p of PATTERNS) {
    const matches = [...text.matchAll(p.re)];
    if (matches.length > p.max) {
      score += matches.length - p.max;
      hits.push({
        id: p.id, category: p.category, count: matches.length, max: p.max,
        samples: matches.slice(0, 3).map((m) => text.slice(Math.max(0, m.index! - 12), m.index! + m[0].length + 12).replace(/\n/g, " ")),
      });
    }
  }
  return { score, hits };
}

/** 윤문 패스에 줄 지시문: 걸린 패턴만 짚는다 */
export function lintReport(hits: LintHit[]): string {
  return hits.map((h) => `- ${h.category}(${h.id}) ${h.count}회 (허용 ${h.max}): ${h.samples.map((s) => `「${s}」`).join(" ")}`).join("\n");
}
