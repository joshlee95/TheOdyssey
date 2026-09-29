// Portions Copyright (c) 2026 heojunfo
// 자유 서술(draft) → 섬 팩 변환. 명령어(scripts/build-island.ts)와 웹 섬 공방이 같이 쓴다.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { type Island, IslandSchema, IslandShape, lintIsland } from "../shared/island";
import { lintProse } from "../shared/prose-lint";
import { DEFAULT_MODEL } from "./settings";

const MAX_ATTEMPTS = 3;
const notes = {
  invented: z.array(z.string()), // 작성자가 쓰지 않았는데 AI가 채운 부분
  questions: z.array(z.string()), // 작성자에게 확인하고 싶은 점
};
const BuildFormat = z.object({ island: IslandShape, ...notes });
const BuildCheck = z.object({ island: IslandSchema, ...notes });

const system = (id: string, author: string) => `당신은 친구들이 함께 하는 한국어 TRPG의 섬 설계 편집자입니다.
친구 한 명이 자기 섬에 대해 형식 없이 자유롭게 쓴 글(draft)을 받아, AI 게임 마스터가 진행에 쓸 섬 팩 JSON으로 옮깁니다.
draft는 메모, 대화체, 줄글, 목록 무엇이든 될 수 있습니다. 순서나 항목이 스키마와 달라도 괜찮습니다.

원칙:
- 작성자의 의도, 고유명사, 문장의 맛을 최대한 그대로 살립니다. 요약하거나 무난하게 다듬지 마세요. 작성자가 쓴 대사는 NPC sample_lines에 그대로 옮깁니다.
- 비어 있는 부분은 작성자가 쓴 분위기에 맞춰 채우되, 직접 지어낸 내용은 하나도 빠짐없이 invented에 "어디: 무엇을 지어냈는지" 형식으로 적습니다.
- 작성자에게 확인하고 싶은 모호한 점이나 더 쓰면 좋아질 부분은 questions에 짧은 질문으로 적습니다(최대 6개).
- public 블록(rumor, first_sight, arrival)은 모든 플레이어에게 공개됩니다. 비밀이나 섬의 정체가 새지 않게 쓰세요.
- world.reality에는 이 섬의 세계(장르, 시대, 마법·기술 수준, 말투, 외부인을 보는 시선, 다른 세계의 마법·기술이 여기서 어떻게 되는지)를 담습니다.
- story는 진짜 극의 흐름이 되게 짭니다: 휘말리는 계기 → 커지는 위기 → 중반의 반전(비밀과 연결) → 가장 어두운 순간 → 선원들의 선택으로 결말이 갈리는 클라이맥스.
- trials는 여러 막에 나눠 두고 실패해도 이야기가 이어지게, blessings는 얻는 조건과 규칙상 효과를 분명히 씁니다.
- NPC마다 likes/dislikes, 호감도 단계별 behaviors(구체적인 행동), 다른 NPC와의 relations, 말투(voice)와 sample_lines 3~5줄을 채웁니다. adult는 사실대로, 미성년 NPC는 romance를 절대 true로 두지 않습니다.
- 이름은 그 세계 사람들이 실제로 부르는 이름으로. 괄호 한자 병기, 줄표 부제, 과장 수식어(저주받은/영원의/운명의)는 쓰지 않습니다.
- 문장은 구체 명사와 동사로. 감정 이름 붙이기, 상투 몸짓(숨을 삼켰다, 눈빛이 흔들렸다), "마치 ~처럼" 남발, 줄표, 번역투를 쓰지 않습니다.
- 유물(treasures)의 power는 어느 세계의 섬에서든 통하게 씁니다.
- clock/finale 이벤트의 clock 값은 world.clock.segments 이하입니다.
- 모든 id는 영문 소문자·숫자·하이픈이고, 섬 id는 반드시 "${id}", meta.author는 "${author}"입니다. 본문은 한국어로 씁니다. schema_version은 1입니다.
- 기존 island가 함께 주어지면 그것을 바탕으로 draft와 달라진 점만 반영하고, 기존 id는 유지합니다.`;

export type BuildResult = {
  island: Island;
  invented: string[];
  questions: string[];
  warnings: string[];
  proseScore: number;
};

export async function buildIsland(opts: {
  id: string;
  author: string;
  draft: string;
  current?: string | null;
  onProgress?: (msg: string) => void;
  apiKey?: string;
  model?: string;
}): Promise<BuildResult> {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  let feedback = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    opts.onProgress?.(`섬을 짓는 중 (${attempt}/${MAX_ATTEMPTS})`);
    // 출력이 길어 스트리밍으로 받는다 (SDK는 max_tokens가 크면 비스트리밍 요청을 보내기 전에 거절한다)
    const stream = client.messages.stream({
      model: opts.model ?? process.env.GM_MODEL ?? DEFAULT_MODEL,
      max_tokens: 64000,
      system: system(opts.id, opts.author),
      messages: [
        {
          role: "user",
          content: [
            `<draft>\n${opts.draft}\n</draft>`,
            opts.current ? `<current_island>\n${opts.current}\n</current_island>` : "",
            feedback,
          ].filter(Boolean).join("\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(BuildFormat) },
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") throw new Error(`변환이 거절됐어요: ${response.stop_details?.explanation ?? "사유 없음"}`);
    if (response.stop_reason === "max_tokens") throw new Error("출력이 너무 길어 잘렸어요. 글을 조금 줄여 주세요");

    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      feedback = "<errors>\n이전 출력이 올바른 JSON이 아니었어요. 스키마에 맞는 JSON만 출력해 주세요.\n</errors>";
      continue;
    }
    const result = BuildCheck.safeParse(raw);
    if (!result.success) {
      feedback = [
        `<previous_attempt>\n${text}\n</previous_attempt>`,
        `<errors>\n${z.prettifyError(result.error)}\n</errors>`,
        "위 오류를 고친 전체 결과를 다시 출력해 주세요.",
      ].join("\n\n");
      opts.onProgress?.("검증 오류가 있어 다시 고치는 중");
      continue;
    }
    const { island, invented, questions } = result.data;
    island.id = opts.id; // 모델이 다른 섬 id를 써도 폴더 이름을 따른다 (공식 섬을 덮어쓰지 못하게)
    const proseScore = JSON.stringify(island).length ? lintProse(collectText(island)).score : 0;
    return { island, invented, questions, warnings: lintIsland(island), proseScore };
  }
  throw new Error(`${MAX_ATTEMPTS}번 시도했지만 섬 팩 검증을 통과하지 못했어요. 글을 조금 보완해서 다시 시도해 주세요`);
}

function collectText(node: unknown): string {
  if (typeof node === "string") return node + "\n";
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (node && typeof node === "object") return Object.values(node).map(collectText).join("");
  return "";
}
