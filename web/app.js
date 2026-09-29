// The Odyssey 웹 클라이언트 — 서버가 보내는 state/log를 그리기만 한다.
const socket = (window.socket = io({ auth: { tokens: window.__wsTokens ?? [] } }));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let meta = null;
let state = null;
const logMap = new Map();
let live = "";

const call = (event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res ?? { ok: true })));

// ── 로비 ────────────────────────────────────────────────────────
$("#nickname").value = store.get("nickname") ?? "";
const last = store.get("session");
if (last) $("#resume").classList.remove("hidden");

async function enter(res) {
  if (!res.ok) return void ($("#lobby-error").textContent = res.error);
  store.set("session", { code: res.code, playerId: res.playerId });
  store.set("nickname", $("#nickname").value.trim());
  $("#lobby").classList.add("hidden");
  $("#game").classList.remove("hidden");
}
$("#create").onclick = async () =>
  enter(await call("room:create", { nickname: $("#nickname").value, rating: $("#rating").value, adult: $("#adult").checked }));
$("#join").onclick = async () =>
  enter(await call("room:join", { code: $("#code").value.trim().toUpperCase(), nickname: $("#nickname").value, adult: $("#adult").checked }));
$("#resume").onclick = async () => enter(await call("room:resume", store.get("session")));
// 섬 공방의 '혼자 해 보기'에서 넘어오면 바로 이어서 들어간다
if (new URLSearchParams(location.search).has("resume") && last) {
  history.replaceState(null, "", "/");
  socket.once("connect", () => $("#resume").click());
}

// ── 섬 선택 모드 (혼자) ─────────────────────────────────────────
let pickedIsland = null;
$("#solo-mode").onclick = () => {
  $("#lobby").classList.add("hidden");
  $("#picker").classList.remove("hidden");
  pickedIsland = null;
  renderPicker();
};
$("#picker-back").onclick = () => {
  if (pickedIsland) return ((pickedIsland = null), renderPicker());
  $("#picker").classList.add("hidden");
  $("#lobby").classList.remove("hidden");
};
function renderPicker() {
  if (!meta) return;
  const RATE = { all: "전체", teen: "15세", mature: "성인" };
  $("#picker-title").textContent = pickedIsland ? "누구로 상륙할까요?" : "어느 섬으로 갈까요?";
  $("#picker-islands").classList.toggle("hidden", !!pickedIsland);
  $("#picker-chars").classList.toggle("hidden", !pickedIsland);
  $("#picker-islands").innerHTML = meta.islands.map((i) => `<button class="island-card" data-id="${i.id}">
      <b>${esc(i.title)}</b> <span class="badge">${RATE[i.rating]}</span>
      <div class="small muted">${esc(i.genre.join(" · "))}</div>
      <div class="small">${esc(i.tagline)}</div>
      <div class="small muted rumor">소문: ${esc(i.rumor)}</div>
      <div class="small muted">by ${esc(i.author)}</div></button>`).join("");
  document.querySelectorAll("#picker-islands .island-card").forEach((b) => (b.onclick = () => {
    pickedIsland = meta.islands.find((i) => i.id === b.dataset.id);
    const order = ["all", "teen", "mature"];
    if (order.indexOf($("#picker-rating").value) > order.indexOf(pickedIsland.rating)) $("#picker-rating").value = pickedIsland.rating;
    renderPicker();
  }));
  if (!pickedIsland) return;
  $("#picker-chosen").textContent = `🏝️ ${pickedIsland.title} — ${pickedIsland.tagline}`;
  $("#picker-pregens").innerHTML = meta.pregens.map((p, i) => `<button class="pregen" data-i="${i}">
      <b>${esc(p.name)}</b> 「${esc(p.title)}」<div class="small">${esc(p.origin)}</div>
      <div class="small muted">${esc(meta.archetypes[p.archetype].name)} · ${esc(meta.traits[p.origin_trait].name)} · ${esc(meta.backgrounds[p.background].name)}</div></button>`).join("");
  document.querySelectorAll("#picker-pregens .pregen").forEach((b) => (b.onclick = async () => {
    const rating = $("#picker-rating").value;
    const res = await call("workshop:solo", {
      islandId: pickedIsland.id, pregen: Number(b.dataset.i), rating,
      nickname: $("#nickname").value.trim() || "선원", adult: $("#adult").checked,
    });
    if (!res.ok) return void ($("#picker-error").textContent = res.error);
    const joined = await call("room:resume", { code: res.code, playerId: res.playerId });
    $("#picker").classList.add("hidden");
    enter(joined);
  }));
}

socket.on("meta", (m) => {
  meta = m;
  if (!$("#picker").classList.contains("hidden")) renderPicker();
  $("#gm-name").textContent = `GM: ${m.gm}`;
  $("#gm-name-2").textContent = `GM: ${m.gm}`;
});
socket.on("gm:changed", (name) => {
  if (meta) meta.gm = name;
  $("#gm-name").textContent = `GM: ${name}`;
  $("#gm-name-2").textContent = `GM: ${name}`;
});
socket.on("connect", async () => {
  const s = store.get("session");
  if (state && s) await call("room:resume", s);
});

// ── 상태 수신 ──────────────────────────────────────────────────
socket.on("state", (s) => {
  const first = !state;
  state = s;
  logMap.clear();
  for (const e of s.log) logMap.set(e.id, e);
  render();
  if (first) scrollLog();
});
socket.on("log", (e) => {
  logMap.set(e.id, e);
  if (e.type === "narration") setLive("");
  renderLog();
});
socket.on("gm:delta", (d) => setLive(live + d));
socket.on("gm:status", (s) => {
  $("#thinking").classList.toggle("hidden", s !== "thinking");
  if (s === "idle") setLive("");
});

function setLive(text) {
  live = text;
  $("#live").classList.toggle("hidden", !live);
  $("#live").innerHTML = formatNarration(live);
  scrollLog();
}

// ── 그리기 ─────────────────────────────────────────────────────
const RATING = { all: "전체", teen: "15세", mature: "성인" };
const me = () => state.players.find((p) => p.id === state.you);
const isHost = () => state.hostId === state.you;

function render() {
  $("#room-code").textContent = `방 ${state.code}`;
  $("#room-rating").textContent = RATING[state.effectiveRating];
  const i = state.island;
  $("#island-info").innerHTML = i
    ? `<strong>${esc(i.title)}</strong> <span class="muted">${esc(i.genre.join(" · "))}</span>
       <span class="pill">🎭 ${i.act}/${i.acts}막 ${esc(i.actName)}</span>
       <span class="pill">⏳ ${esc(i.clockName)} ${clockBar(i.clock, i.segments)}</span>
       <span class="pill">📍 ${esc(i.location)}</span>
       ${i.clocks.map((c) => `<span class="pill">⏱️ ${esc(c.name)} ${clockBar(c.filled, c.segments)}</span>`).join("")}
       ${i.aspects.map((a) => `<span class="pill aspect">📌 ${esc(a)}</span>`).join("")}`
    : `<span class="muted">아직 섬에 상륙하지 않았어요</span>`;
  document.querySelectorAll(".host-only").forEach((el) => el.classList.toggle("hidden", !isHost()));
  renderComposer();
  renderSide();
  renderLog();
  renderOverlay();
}

const clockBar = (n, total) => "●".repeat(n) + "○".repeat(Math.max(0, total - n));

function renderComposer() {
  const open = state.phase === "round_open" && me()?.character;
  $("#composer").classList.toggle("disabled", !open);
  $("#submit").disabled = !open;
  $("#resolve").disabled = state.phase !== "round_open";
  $("#retract").classList.toggle("hidden", !state.myPending);
  $("#submit").textContent = state.myPending ? "다시 제출" : "제출";
  $("#use-insp").disabled = state.inspiration <= 0;
  $("#use-insp").parentElement.title = `파티 영감 ${state.inspiration}`;
}

function formatNarration(text) {
  return esc(text)
    .split(/\n{2,}/)
    .map((para) =>
      `<p>${para
        .split("\n")
        .map((line) => line.replace(/^([^:"\s][^:"]{0,20}): (&quot;.*)$/, '<span class="npc">$1</span> $2'))
        .join("<br>")}</p>`,
    )
    .join("");
}

function rollText(e) {
  if (e.secret) return `🎲 <b>${esc(e.name)}</b> — 비밀 판정`;
  const r = e.result;
  const dice = r.dice.length > 1 ? `[${r.dice.join(", ")}]→${r.kept}` : `${r.kept}`;
  const bonus = r.bonus >= 0 ? `+${r.bonus}` : `${r.bonus}`;
  const crit = r.critical === "success" ? " 🌟대성공" : r.critical === "fail" ? " 💀대실패" : "";
  const adv = r.advantage === "advantage" ? " (이점)" : r.advantage === "disadvantage" ? " (불리)" : "";
  const lucky = r.luckyReroll ? " 🍀" : "";
  return `🎲 <b>${esc(e.name)}</b> — ${esc(e.label)} 판정${adv}: ${dice}${bonus} = <b>${r.total}</b> vs DC ${r.dc} · ` +
    `<span class="${r.success ? "ok" : "bad"}">${r.success ? "성공" : "실패"}${crit}</span>${lucky}`;
}

function renderEntry(e) {
  switch (e.type) {
    case "narration": return `<div class="entry narration">${formatNarration(e.text)}</div>`;
    case "action": {
      const secrets = (e.secrets ?? [])
        .map((s) => `<div class="secret st-${s.status}">🔒 ${esc(s.text)} ${s.status === "hidden" ? "" : "<span class='tag'>공개됨</span>"}
          ${s.status === "hidden" && e.playerId === state.you ? `<button class="tiny confess" data-id="${s.id}">비밀 공개</button>` : ""}</div>`)
        .join("");
      const kind = e.kind === "say" ? "💬" : e.kind === "pass" ? "👀" : "▶";
      return `<div class="entry action"><b>${esc(e.name)}</b> ${kind} ${esc(e.publicText)}${secrets}</div>`;
    }
    case "roll": return `<div class="entry roll">${rollText(e)}</div>`;
    case "system": return `<div class="entry system">${esc(e.text)}</div>`;
    case "whisper": return `<div class="entry whisper">🤫 <b>귓속말</b> ${esc(e.text)}</div>`;
    case "reveal": return `<div class="entry reveal">🔓 ${esc(e.note)}</div>`;
    case "affinity": {
      const face = e.delta > 0 ? "👍" : e.delta < 0 ? "👎" : "·";
      const tier = e.tierChange ? ` — 관계: ${esc(e.tierChange[0])} → <b>${esc(e.tierChange[1])}</b>` : "";
      return `<div class="entry affinity">${face} ${esc(e.npcName)}${tier}</div>`;
    }
    case "chat": return `<div class="entry chat">[OOC] <b>${esc(e.name)}</b>: ${esc(e.text)}</div>`;
    default: return "";
  }
}

function scrollLog() {
  const el = $("#log");
  el.scrollTop = el.scrollHeight;
}

function renderLog() {
  const el = $("#log");
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  el.innerHTML = [...logMap.values()].sort((a, b) => a.id - b.id).map(renderEntry).join("");
  el.querySelectorAll(".confess").forEach((b) => (b.onclick = () => call("hidden:confess", b.dataset.id)));
  if (atBottom) scrollLog();
}

function renderSide() {
  const combat = state.island?.combat;
  $("#tab-party").innerHTML =
    (combat
      ? `<div class="card combat"><b>⚔️ 전투 ${combat.round}라운드</b>
          <div class="small">${combat.order.map((o) => `<span class="${o.down ? "down" : ""}">${esc(o.name)}</span>`).join(" → ")}</div>
          ${combat.enemies.map((e) => `<div class="small ${e.defeated ? "down" : ""}">${esc(e.name)}
            <div class="hp enemy"><div style="width:${(100 * e.hp) / Math.max(1, e.maxHp)}%"></div><span>${e.hp}/${e.maxHp}</span></div>
            ${e.conditions.length ? esc(e.conditions.join(", ")) : ""}</div>`).join("")}</div>`
      : "") +
    `<p class="muted small">파티 영감 🌟 ${state.inspiration}/4</p>` +
    state.players
      .map((p) => {
        const c = p.character;
        const status = state.phase === "round_open" && c ? (p.submitted ? "✅ 제출함" : "⌛ 생각 중") : "";
        return `<div class="card ${p.connected ? "" : "offline"}">
          <div><b>${esc(c ? c.name : p.nickname)}</b> ${c ? `<span class="muted">「${esc(c.title)}」</span>` : ""}
            ${p.id === state.hostId ? '<span class="badge">방장</span>' : ""} <span class="small">${status}</span></div>
          ${c ? `<div class="small muted">${esc(p.nickname)} · ${esc(meta?.archetypes[c.archetype]?.name ?? "")} · Lv ${p.level} · 🪙 ${esc(p.coins)}</div>
          <div class="hp"><div style="width:${(100 * p.hp) / Math.max(1, p.maxHp)}%"></div><span>HP ${p.hp}/${p.maxHp}</span></div>
          ${p.conditions.length ? `<div class="small">상태: ${esc(p.conditions.join(", "))}</div>` : ""}
          ${p.deathSaves ? `<div class="small bad">🕯️ 사망 내성 ✔${p.deathSaves.successes} ✖${p.deathSaves.failures}${p.deathSaves.stable ? " · 안정" : ""}</div>` : ""}
          ${p.blessings.length ? `<div class="small">✨ ${p.blessings.map((b) => esc(b.name)).join(", ")}</div>` : ""}` : '<div class="small muted">캐릭터 준비 중</div>'}
        </div>`;
      })
      .join("");

  const m = me();
  const sheet = m?.sheet;
  const acNote = sheet ? `AC ${10 + Math.floor((sheet.scores.dex - 10) / 2)}+방어구` : "";
  $("#tab-me").innerHTML = sheet
    ? `<div class="card"><b>${esc(m.character.name)}</b> 「${esc(m.character.title)}」<div class="small">${esc(m.character.origin)}</div>
        <div class="small muted">${esc(m.character.concept)}</div></div>
       <div class="card small">${Object.entries(sheet.scores).map(([a, v]) => `<span class="stat">${ABIL[a]} <b>${v}</b> (${mod(v)})</span>`).join(" ")}
        <div>레벨 ${sheet.level} · 숙련 보너스 +${sheet.proficiency} · 최대 HP ${sheet.maxHp} · ${acNote} · 🪙 ${esc(m.coins)}</div>
        <div>숙련: ${sheet.proficientSkills.map((s) => SKILL[s] + (sheet.expertise.includes(s) ? "★" : "")).join(", ")}</div>
        <div>내성: ${sheet.saveProficiencies.map((a) => ABIL[a]).join(", ")}</div></div>
       <div class="card small"><b>소지품</b><br>${m.items.map((i) => `${esc(i.name)} <span class="muted">[${KIND[i.kind]}]</span>`).join("<br>") || "없음"}</div>
       <div class="card small"><b>축복</b><br>${m.blessings.map((b) => `✨ ${esc(b.name)} — ${esc(b.effect)}`).join("<br>") || "없음"}</div>
       <div class="card small"><b>내 비밀 행동</b><br>${state.myHidden.map((h) => `🔒 ${esc(h.secret)} <span class="tag">${HSTATUS[h.status]}</span>`).join("<br>") || "없음"}</div>`
    : `<p class="muted">캐릭터가 없어요</p>`;

  $("#tab-rel").innerHTML = state.relationships.length
    ? state.relationships.map((r) => `<div class="card"><b>${esc(r.npc)}</b> <span class="badge tier">${esc(r.tier)}</span>
        <div class="small muted">${r.memories.map(esc).join("<br>")}</div></div>`).join("")
    : `<p class="muted small">아직 가까워지거나 멀어진 NPC가 없어요</p>`;

  $("#tab-ship").innerHTML =
    `<div class="card small"><b>배에 실은 유물</b><br>${state.shipHold.map((t) => `🏺 ${esc(t.name)} — ${esc(t.power)}`).join("<br>") || "없음"}</div>
     <div class="card small"><b>항해일지</b><br>${state.shipLog.map(esc).join("<br><br>") || "아직 비어 있어요"}</div>
     ${isHost() && (state.phase === "island_ended" || state.phase === "round_open") ? `<button id="pick-island" class="ghost">다른 섬으로 항해</button>` : ""}`;
  const pick = $("#pick-island");
  if (pick) pick.onclick = () => ((forceIslandPicker = true), renderOverlay());
}

const ABIL = { str: "근력", dex: "민첩", con: "건강", int: "지능", wis: "지혜", cha: "매력" };
const SKILL = {
  athletics: "운동", acrobatics: "곡예", sleight_of_hand: "손재주", stealth: "은신", occult: "신비학", lore: "학식",
  investigation: "조사", technology: "기술 공학", nature: "자연", empathy: "교감", insight: "통찰", medicine: "의학",
  perception: "감지", survival: "생존", deception: "기만", intimidation: "위협", performance: "공연", persuasion: "설득",
};
const KIND = { mundane: "평범", tech: "기술", magic: "마법", anomaly: "이상" };
const HSTATUS = { hidden: "숨김", exposed: "탄로", confessed: "자백", epilogue: "공개" };
const mod = (v) => { const m = Math.floor((v - 10) / 2); return m >= 0 ? `+${m}` : `${m}`; };

document.querySelectorAll(".tabs button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("hidden", t.id !== `tab-${b.dataset.tab}`));
  };
});

// ── 캐릭터 만들기 · 섬 고르기 ──────────────────────────────────
let forceIslandPicker = false;

function renderOverlay() {
  const o = $("#overlay");
  const body = $("#overlay-body");
  if (!state || !meta) return;
  if (!me()?.character) {
    o.classList.remove("hidden");
    if (body.dataset.view === "char") return;
    body.dataset.view = "char";
    body.innerHTML = characterForm();
    wireCharacterForm();
    return;
  }
  const needIsland = isHost() && (state.phase === "lobby" || state.phase === "island_ended" || forceIslandPicker);
  if (needIsland) {
    o.classList.remove("hidden");
    if (body.dataset.view === "island") return;
    body.dataset.view = "island";
    body.innerHTML = `<h2>어느 섬으로 갈까요?</h2>
      <p class="muted small">방 등급(${RATING[state.rating]})보다 높은 섬은 방 등급에 맞춰 순화됩니다.</p>
      <div class="grid">${meta.islands.map((i) => `<button class="island-card" data-id="${i.id}">
        <b>${esc(i.title)}</b> <span class="badge">${RATING[i.rating]}</span>
        <div class="small muted">${esc(i.genre.join(" · "))}</div>
        <div class="small">${esc(i.tagline)}</div>
        <div class="small muted rumor">소문: ${esc(i.rumor)}</div></button>`).join("")}</div>
      ${forceIslandPicker ? `<button id="cancel-island" class="ghost">닫기</button>` : ""}
      <p class="muted small">다른 선원들이 캐릭터를 다 만든 뒤 고르는 게 좋아요.</p>`;
    body.querySelectorAll(".island-card").forEach((b) => (b.onclick = async () => {
      const res = await call("island:start", b.dataset.id);
      if (!res.ok) return alert(res.error);
      forceIslandPicker = false;
      o.classList.add("hidden");
      body.dataset.view = "";
    }));
    const cancel = $("#cancel-island");
    if (cancel) cancel.onclick = () => ((forceIslandPicker = false), o.classList.add("hidden"), (body.dataset.view = ""));
    return;
  }
  o.classList.add("hidden");
  body.dataset.view = "";
}

function options(obj, fmt) {
  return Object.entries(obj).map(([id, v]) => `<option value="${id}">${esc(fmt(v))}</option>`).join("");
}

function characterForm() {
  return `<h2>캐릭터</h2>
    <h3>미리 만든 캐릭터</h3>
    <div class="grid">${meta.pregens.map((p, i) => `<button class="pregen" data-i="${i}">
      <b>${esc(p.name)}</b> 「${esc(p.title)}」<div class="small">${esc(p.origin)}</div>
      <div class="small muted">${esc(meta.archetypes[p.archetype].name)} · ${esc(meta.traits[p.origin_trait].name)} · ${esc(meta.backgrounds[p.background].name)}</div></button>`).join("")}</div>
    <h3>직접 만들기</h3>
    <form id="quick" class="quick">
      <label>이름 <input name="name" required maxlength="20" /></label>
      <label>호칭 <input name="title" required maxlength="30" placeholder="예: 퇴사한 해커, 엘프 궁수" /></label>
      <label class="wide">출신 세계와 사연 <input name="origin" required maxlength="120" placeholder="예: 2020년대 서울. 퇴근길에 이상한 배에 올랐다" /></label>
      <label class="wide">한 줄 컨셉 <input name="concept" required maxlength="80" /></label>
      <label>원형 <select name="archetype">${options(meta.archetypes, (a) => `${a.name} (${a.like})`)}</select></label>
      <label>출신 특성 <select name="origin_trait">${options(meta.traits, (t) => `${t.name} — ${t.description}`)}</select></label>
      <label>배경 <select name="background">${options(meta.backgrounds, (b) => `${b.name}`)}</select></label>
      <p class="small muted wide" id="arch-desc"></p>
      <button class="wide">이 캐릭터로 시작</button>
    </form>`;
}

function wireCharacterForm() {
  document.querySelectorAll(".pregen").forEach((b) => (b.onclick = async () => {
    const res = await call("character:pregen", Number(b.dataset.i));
    if (!res.ok) alert(res.error);
  }));
  const form = $("#quick");
  const desc = () => {
    const a = meta.archetypes[form.archetype.value];
    const bg = meta.backgrounds[form.background.value];
    $("#arch-desc").textContent = `${a.name}: ${a.signature} · 배경 ${bg.name}: 기술 ${bg.skills.map((s) => SKILL[s]).join(", ")} / 영감 — ${bg.inspiration}`;
  };
  form.archetype.onchange = form.background.onchange = desc;
  desc();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const res = await call("character:quick", data);
    if (!res.ok) alert(res.error);
  };
}

// ── 행동 ───────────────────────────────────────────────────────
let previewTimer = null;
$("#action").addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const text = $("#action").value;
    if (!/[()（）]/.test(text)) return void ($("#preview").innerHTML = "");
    const r = await call("action:preview", text);
    $("#preview").innerHTML = r.ok && r.secrets.length
      ? `<span class="muted">다른 선원에게는:</span> ${esc(r.publicText)}<br>${r.secrets.map((s) => `🔒 <span class="secret-inline">${esc(s)}</span>`).join(" ")}`
      : "";
  }, 200);
});

$("#submit").onclick = async () => {
  const kind = document.querySelector('input[name="kind"]:checked').value;
  const text = $("#action").value.trim();
  if (kind !== "pass" && !text) return;
  const res = await call("action:submit", { kind, text, useInspiration: $("#use-insp").checked });
  if (!res.ok) return alert(res.error);
  $("#action").value = "";
  $("#preview").innerHTML = "";
  $("#use-insp").checked = false;
};
$("#action").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("#submit").click();
});
$("#retract").onclick = () => call("action:retract");
$("#resolve").onclick = async () => {
  const res = await call("round:resolve");
  if (!res.ok) alert(res.error);
};
$("#xcard").onclick = () => call("xcard");
$("#chat-form").onsubmit = (e) => {
  e.preventDefault();
  const t = $("#chat").value.trim();
  if (t) call("chat", t);
  $("#chat").value = "";
};
