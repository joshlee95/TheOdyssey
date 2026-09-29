// 모의 GM — API 없이 게임 흐름(판정, 비밀 행동, 호감도, 막, 결말)을 시험하기 위한 결정적 GM.
import type { Game, GM, RoundInput } from "../game";

export class MockGM implements GM {
  readonly name = "모의 GM (API 미사용)";

  async runRound(game: Game, input: RoundInput, hooks: { onText: (d: string) => void }): Promise<string> {
    const v = game.visit!;
    const island = v.island;
    const out: string[] = [];
    const say = (s: string) => {
      out.push(s);
      hooks.onText(s + "\n\n");
    };

    if (input.opening) {
      say(`(모의 GM) ${island.public.first_sight}`);
      say(island.public.arrival);
      say(island.story.hook);
      const arrival = island.events.find((e) => e.kind === "arrival");
      if (arrival) {
        const r = game.runTool("start_event", { event_id: arrival.id });
        if (r.ok) say((r.result as { scene: string }).scene);
      }
      return out.join("\n\n");
    }

    const npc = island.npcs.find((n) => n.location === v.location) ?? island.npcs[0];
    for (const a of input.actions) {
      const name = a.player.character!.name;
      if (a.kind === "pass") {
        say(`${name}은(는) 한 걸음 물러나 상황을 지켜본다.`);
        continue;
      }
      for (const h of a.hidden) {
        const r = game.runTool("roll", {
          player_id: a.player.id, check_type: "skill", check: "sleight_of_hand", against_npc: npc.id,
          hidden_action_id: h.id, reason: "비밀 행동",
        });
        if (r.ok && !(r.result as { success: boolean }).success) {
          game.runTool("expose_hidden_action", { hidden_action_id: h.id, note: `${name}이(가) ${h.secret} — ${npc.name}에게 들켰습니다.` });
          game.runTool("change_affinity", { npc_id: npc.id, target: a.player.id, delta: -15, reason: "속임수를 들켰다", witnessed: true });
          say(`${npc.name}: "뭐야, 지금 무슨 짓을 한 거지?"`);
        } else {
          game.runTool("whisper", { player_id: a.player.id, text: `아무도 눈치채지 못했다: ${h.secret}` });
        }
      }
      if (!a.hidden.length) {
        const r = game.runTool("roll", { player_id: a.player.id, check_type: "skill", check: "persuasion", against_npc: npc.id, dc: 13, reason: "행동" });
        const ok = r.ok && (r.result as { success: boolean }).success;
        game.runTool("change_affinity", { npc_id: npc.id, target: a.player.id, delta: ok ? 8 : -4, reason: a.publicText.slice(0, 40), witnessed: true });
        say(`${name}: ${a.publicText} — ${ok ? `${npc.name}이(가) 고개를 끄덕인다.` : `${npc.name}은(는) 미심쩍은 눈으로 본다.`}`);
      }
    }

    game.runTool("tick_clock", { clock_id: "crisis", ticks: 1, reason: "시간이 흐른다" });
    if (v.round >= 2 && v.act < island.story.acts.length) game.runTool("advance_act", { act: v.act + 1, reason: "모의 진행" });
    if (v.act === island.story.acts.length && v.round >= 4) {
      game.runTool("end_island", { exit_id: island.exits[0].id });
      say(island.exits[0].epilogue);
    }
    return out.join("\n\n");
  }

  async summarize(game: Game): Promise<string> {
    return `(모의) ${game.visit!.island.meta.title}에서 ${game.visit!.round}라운드를 보내고 떠났다.`;
  }
}
