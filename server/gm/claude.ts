// Portions Copyright (c) 2026 heojunfo
// Claude GM — 라운드마다 스트리밍 + 도구 루프. 섬 하나 동안 대화를 이어 쓰고(append-only), 앞부분은 캐시한다.
import Anthropic from "@anthropic-ai/sdk";
import type { Game, GM, RoundInput } from "../game";
import { lintProse, lintReport, TELL_THRESHOLD } from "../../shared/prose-lint";
import { CORE_RULES, islandBlock, roundMessage } from "./prompt";
import { TOOLS } from "./tools";

type Msg = Anthropic.Beta.Messages.BetaMessageParam;
type Effort = "low" | "medium" | "high";

const STYLE_BRIEF = "쓰지 않는 표현: 숨을 삼켰다·눈빛이 흔들렸다·정적이 흘렀다·공기가 무거워졌다·묘한/알 수 없는·~듯했다 연발·마치 ~처럼 남발·~에 대해·~에 의해·~하기 시작했다·그녀는 그녀의·과연 ~까?";
/** 거절 시 서버 측 폴백("default": 거절 사유에 맞는 모델로 API가 알아서 넘김)을 지원하는 모델 — 모델을 추가할 때 여기도 본다 */
const FALLBACK_FROM = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-opus-5"]);
const MAX_TOOL_TURNS = 16;

export class ClaudeGM implements GM {
  readonly name: string;
  private client: Anthropic;
  private model: string;
  private effort: Effort;

  /** 설정 화면(server/settings.ts)에서 받은 키·모델·effort로 만든다. 서술 품질이 우선이라 effort 기본은 high */
  constructor(opts: { apiKey: string; model: string; effort: Effort }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
    this.effort = opts.effort;
    this.name = `Claude (${opts.model})`;
  }
  /** 섬 id별 system 블록 — 섬이 바뀌거나 선원이 바뀔 때만 새로 만든다 */
  private systemCache = new Map<string, { key: string; blocks: Anthropic.Beta.Messages.BetaTextBlockParam[] }>();

  private system(game: Game) {
    const v = game.visit!;
    const key = `${v.islandId}:${game.crew.map((p) => p.id).join(",")}:${game.effectiveRating()}`;
    const cached = this.systemCache.get(v.islandId);
    if (cached?.key === key) return cached.blocks;
    const blocks: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
      { type: "text", text: CORE_RULES, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: islandBlock(game), cache_control: { type: "ephemeral", ttl: "1h" } },
    ];
    this.systemCache.set(v.islandId, { key, blocks });
    return blocks;
  }

  private request(game: Game, messages: Msg[], effort: Effort) {
    return {
      model: this.model,
      max_tokens: 16000,
      system: this.system(game),
      tools: TOOLS,
      messages,
      thinking: { type: "adaptive" as const },
      output_config: { effort },
      cache_control: { type: "ephemeral" as const },
      // 거절되면 서버에서 다른 모델로 이어 가게 (FALLBACK_FROM 모델에서만)
      ...(FALLBACK_FROM.has(this.model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    };
  }

  async runRound(game: Game, input: RoundInput, hooks: { onText: (d: string) => void; streaming: boolean }): Promise<string> {
    const v = game.visit!;
    const messages = v.messages as Msg[];
    // 기록은 덧붙이기만 한다(앞 턴을 고치면 thinking 블록이 무효가 된다). 지난 라운드가 오류로 끊겨 user 차례로
    // 끝났어도 새 user 메시지를 그대로 붙이면 API가 한 차례로 합쳐 읽으므로, 그 라운드의 행동도 GM이 본다
    closeDanglingToolUses(messages);
    messages.push({ role: "user", content: roundMessage(game, input) });

    let narration = "";
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const stream = this.client.beta.messages.stream(this.request(game, messages, this.effort));
      stream.on("text", (delta) => {
        narration += delta;
        hooks.onText(delta);
      });
      const msg = await stream.finalMessage();
      messages.push({ role: "assistant", content: msg.content });
      logUsage(msg);

      if (msg.stop_reason === "refusal") {
        game.addLog({ type: "system", text: "⚠️ GM이 이 장면을 이어 가지 못했어요. 행동을 바꿔 다시 시도해 주세요." });
        break;
      }
      if (msg.stop_reason === "pause_turn") continue;
      if (msg.stop_reason === "max_tokens") {
        closeDanglingToolUses(messages);
        break;
      }

      const uses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (!uses.length) break;

      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = uses.map((u) => {
        const r = game.runTool(u.name, u.input);
        return r.ok
          ? { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r.result) }
          : { type: "tool_result", tool_use_id: u.id, content: r.error, is_error: true };
      });
      messages.push({ role: "user", content: results });
      if (narration && !narration.endsWith("\n")) {
        narration += "\n\n";
        hooks.onText("\n\n");
      }
    }

    // 도구 효과는 이미 반영됐으니, 검수·윤문이 실패해도 서술은 버리지 않는다
    if (!hooks.streaming) {
      try {
        narration = await this.guardLeaks(game, narration);
      } catch (err) {
        console.error("[leak-guard] 실패 — 원래 서술을 씁니다:", (err as Error).message);
      }
    }
    try {
      return await this.polish(narration);
    } catch (err) {
      console.error("[polish] 실패 — 원래 서술을 씁니다:", (err as Error).message);
      return narration;
    }
  }

  /** 들키지 않은 비밀 행동이 공개 서술에 새어 나왔는지 검사하고, 새었다면 그 부분만 고친다 */
  private async guardLeaks(game: Game, narration: string): Promise<string> {
    const hidden = game.hiddenActions.filter((h) => h.status === "hidden");
    if (!hidden.length || !narration.trim()) return narration;
    const secrets = hidden.map((h) => `- ${game.nameOf(h.playerId)}: ${h.secret}`).join("\n");
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      output_config: { effort: "low" },
      system:
        "너는 TRPG 서술 검수자다. 아래 비밀들은 행동자 외의 선원이 알면 안 된다. 공개 서술이 비밀의 내용이나 의도를 드러내거나 강하게 암시하는지 판단하라. " +
        '드러내지 않으면 정확히 "OK"만 출력하라. 드러낸다면 그 부분만 겉으로 보이는 행동 묘사로 바꾼 전체 서술을 출력하라. 다른 설명은 붙이지 마라.',
      messages: [{ role: "user", content: `<secrets>\n${secrets}\n</secrets>\n<narration>\n${narration}\n</narration>` }],
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text || text === "OK" || res.stop_reason !== "end_turn") return narration;
    console.log("[leak-guard] 서술을 고쳤습니다");
    return text;
  }

  /**
   * AI 티 사후 윤문 — docs/style/ai-tells-ko.json으로 센 뒤 기준을 넘으면 걸린 곳만 고친다.
   * 규칙은 koreanizer 소설 모드(줄거리·대사 내용·이름은 그대로, 번역투와 상투구만 걷는다)와 im-not-ai 처방을 따른다.
   */
  private async polish(narration: string): Promise<string> {
    const { score, hits } = lintProse(narration);
    if (score < TELL_THRESHOLD) return narration;
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      system:
        "너는 한국 웹소설 편집자다. 아래 TRPG 서술에서 지적된 AI 티만 고쳐라. 사건, 대사 내용, 인물 이름, 판정 결과, 문단 순서는 그대로 둔다. " +
        "새 사실이나 비유를 보태지 않는다. 상투 몸짓은 그 인물만 할 법한 구체적인 행동으로, 감정 이름은 보이는 행동으로, 번역투는 한국어 어순으로 바꾼다. " +
        "줄표와 연결어미 뒤 쉼표는 문장을 나누어 없앤다. 분량은 원문과 비슷하게. 고친 서술 전문만 출력하고 설명은 붙이지 않는다.\n\n" + STYLE_BRIEF,
      messages: [{ role: "user", content: `<issues>\n${lintReport(hits)}\n</issues>\n<narration>\n${narration}\n</narration>` }],
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (!text || res.stop_reason !== "end_turn") return narration;
    const after = lintProse(text).score;
    console.log(`[polish] AI 티 ${score} → ${after}`);
    return after < score ? text : narration;
  }

  async summarize(game: Game): Promise<string> {
    const v = game.visit!;
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: "TRPG 항해일지 기록자다. 이번 섬에서 일어난 일을 다음 섬의 GM이 이어 쓸 수 있게 5줄 이내 한국어로 요약하라. 결말, 선원별 활약, NPC와의 관계 변화, 들키지 않은 비밀 행동, 남은 떡밥을 포함한다.",
      messages: [
        {
          role: "user",
          content: game.log
            .filter((e) => e.type === "narration" || e.type === "action" || e.type === "system" || e.type === "reveal")
            .slice(-80)
            .map((e) => (e.type === "narration" ? e.text : e.type === "action" ? `${game.nameOf(e.playerId)}: ${e.publicText}` : "note" in e ? e.note : e.text))
            .join("\n") + `\n\n결말: ${v.exitId}`,
        },
      ],
    });
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  }
}

function logUsage(msg: Anthropic.Beta.Messages.BetaMessage) {
  const u = msg.usage;
  console.log(
    `[usage] in=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} stop=${msg.stop_reason}`,
  );
}

/** 도구 호출 뒤 결과 없이 끝난 기록(max_tokens 잘림·중단)을 닫는다. 그대로 두면 이후 모든 요청이 400으로 실패한다 */
function closeDanglingToolUses(messages: Msg[]) {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || typeof last.content === "string") return;
  const uses = last.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlockParam => b.type === "tool_use");
  if (!uses.length) return;
  messages.push({
    role: "user",
    content: uses.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, content: "응답이 잘려 실행하지 않았다", is_error: true })),
  });
}
