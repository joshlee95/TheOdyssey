// 사용법: npm run island:build -- <섬 id>
// islands/<id>/draft.md(자유 서술 질문지)를 읽어 Claude로 island.yaml을 만들고 검증한다.
// island.yaml이 이미 있으면 그것을 바탕으로 draft의 변경점만 반영한다 (기존 파일은 island.prev.yaml로 백업).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { z } from "zod";
import { IslandSchema, IslandShape, lintIsland } from "../shared/island";
import { DEFAULT_MODEL } from "../server/settings";

const ISLANDS_DIR = path.resolve(import.meta.dirname, "../islands");
const MAX_ATTEMPTS = 3;

const notes = {
  invented: z.array(z.string()), // 작성자가 쓰지 않았는데 AI가 채운 부분
  questions: z.array(z.string()), // 작성자에게 확인하고 싶은 점
};
// 모델에게 요구하는 형태 / 받은 뒤 검사하는 형태 (참조 무결성 검사 포함)
const BuildFormat = z.object({ island: IslandShape, ...notes });
const BuildCheck = z.object({ island: IslandSchema, ...notes });

const system = (id: string) => `당신은 친구들이 함께 하는 LLM 기반 TRPG의 섬 설계 편집자입니다.
친구 한 명이 자기 섬에 대해 자유롭게 쓴 질문지(draft)를 받아, AI 게임 마스터가 진행에 쓸 섬 팩 JSON으로 옮깁니다.

원칙:
- 작성자의 의도, 고유명사, 문장의 맛을 최대한 그대로 살립니다. 요약하거나 무난하게 다듬지 마세요.
- 비어 있는 칸은 스키마를 채우는 데 꼭 필요한 만큼만, 작성자가 쓴 분위기에 맞춰 채웁니다.
  직접 지어낸 내용은 하나도 빠짐없이 invented에 "필드 경로: 무엇을 지어냈는지" 형식으로 적습니다.
- 작성자에게 확인이 필요한 모호한 점은 questions에 적습니다.
- public 블록(rumor, first_sight, arrival)은 모든 플레이어에게 공개됩니다. 비밀이나 섬의 정체가 새지 않게 쓰세요.
- 모든 비밀은 최소 한 NPC의 knows에 들어가거나 힌트로 발견할 수 있는 경로가 있어야 합니다.
- world.reality에는 이 섬의 세계(장르, 시대, 마법·기술 수준, 말투, 외부인을 보는 시선, 다른 세계의 마법·기술이 여기서 어떻게 되는지)를 담습니다.
- story는 진짜 극의 흐름이 되게 짭니다: 휘말리는 계기(hook) → 점점 커지는 위기 → 중반의 반전(비밀과 연결) → 가장 어두운 순간 → 선원들의 선택으로 결말이 갈리는 클라이맥스. 막마다 goal, beats, turn을 채웁니다.
- trials(고난)는 여러 막에 나눠 두고, 실패해도 대가를 치르고 이야기가 이어지게 합니다. blessings(축복)는 얻는 조건과 규칙상 효과를 분명히 씁니다.
- NPC마다 likes/dislikes와 호감도 단계별 behaviors(감정이 아니라 구체적인 '행동')를 채우고, 다른 NPC와의 relations(동맹·경쟁·연모·원한)를 엮습니다. adult는 사실대로, 미성년 NPC는 romance를 절대 true로 두지 않습니다.
- 유물(treasures)의 power는 어느 세계의 섬에서든 통하게 씁니다.
- clock/finale 이벤트의 clock 값은 world.clock.segments 이하입니다. finale은 보통 마지막 칸입니다.
- 모든 id는 영문 소문자·숫자·하이픈이고, 섬 id는 반드시 "${id}"입니다. 본문 텍스트는 한국어로 씁니다.
- schema_version은 1입니다.
- 기존 island가 함께 주어지면 그것을 바탕으로 draft와 달라진 점만 반영하고, 기존 id는 유지합니다.`;

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("섬 id를 알려 주세요: npm run island:build -- <섬 id>");

  const dir = path.join(ISLANDS_DIR, id);
  const draft = await readFile(path.join(dir, "draft.md"), "utf8");
  const islandPath = path.join(dir, "island.yaml");
  const current = await readFile(islandPath, "utf8").catch(() => null);

  const client = new Anthropic();
  let feedback = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`… 섬 팩 생성 중 (${attempt}/${MAX_ATTEMPTS})`);
    const response = await client.messages.parse({
      model: process.env.GM_MODEL ?? DEFAULT_MODEL,
      max_tokens: 16000,
      system: system(id),
      messages: [
        {
          role: "user",
          content: [
            `<draft>\n${draft}\n</draft>`,
            current ? `<current_island>\n${current}\n</current_island>` : "",
            feedback,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(BuildFormat) },
    });

    if (response.stop_reason === "refusal") {
      console.error(`✗ 모델이 변환을 거절했어요: ${response.stop_details?.explanation ?? "사유 없음"}`);
      process.exitCode = 1;
      return;
    }
    if (response.stop_reason === "max_tokens") throw new Error("출력이 잘렸어요 — max_tokens를 늘려 주세요");

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
      console.log(`  ! 검증 오류가 있어 다시 시도해요\n${z.prettifyError(result.error).replace(/^/gm, "    ")}`);
      continue;
    }

    const { island, invented, questions } = result.data;
    if (current) await copyFile(islandPath, path.join(dir, "island.prev.yaml"));
    await writeFile(
      islandPath,
      `# draft.md에서 생성됨 — 직접 고쳐도 됩니다. 검사: npm run validate -- ${id}\n` +
        stringify(island, { lineWidth: 0 }),
    );
    const warnings = lintIsland(island);
    const review = [
      `# ${island.meta.title} — 생성 리뷰`,
      "",
      "## AI가 채운 부분 (확인 후 draft.md나 island.yaml에서 고쳐 주세요)",
      ...(invented.length ? invented.map((s) => `- ${s}`) : ["- 없음"]),
      "",
      "## 확인하고 싶은 점",
      ...(questions.length ? questions.map((s) => `- ${s}`) : ["- 없음"]),
      "",
      "## 검사 경고",
      ...(warnings.length ? warnings.map((s) => `- ${s}`) : ["- 없음"]),
    ].join("\n");
    await writeFile(path.join(dir, "review.md"), review + "\n");

    console.log(`✓ ${path.relative(process.cwd(), islandPath)} 생성 완료`);
    console.log(review.replace(/^/gm, "  "));
    return;
  }

  console.error(`✗ ${MAX_ATTEMPTS}번 시도했지만 검증을 통과하지 못했어요. draft.md를 보완하거나 island.yaml을 직접 써 주세요.`);
  process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  if (err instanceof Anthropic.AuthenticationError)
    console.error("✗ Anthropic 인증에 실패했어요. ANTHROPIC_API_KEY를 설정하거나 `ant auth login`을 실행해 주세요.");
  else throw err;
  process.exitCode = 1;
}
