// 섬 공방 클라이언트
const socket = (window.socket = io({ auth: { tokens: window.__wsTokens } }));
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const call = (event, payload) => new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res ?? { ok: true })));

// 내 섬 열쇠: { [id]: { token, title } } — 이 브라우저에만 저장
const keys = {
  all() { try { return JSON.parse(localStorage.getItem("workshop") || "{}"); } catch { return {}; } },
  drop(id) { const a = keys.all(); delete a[id]; try { localStorage.setItem("workshop", JSON.stringify(a)); } catch {} },
  set(id, v) { const a = keys.all(); a[id] = v; try { localStorage.setItem("workshop", JSON.stringify(a)); } catch {} },
};
let current = null; // { id, token }
let dirty = false;

$("#author").value = localStorage.getItem("nickname")?.replace(/"/g, "") ?? "";

async function refreshMine() {
  const tokens = Object.values(keys.all()).map((k) => k.token);
  const res = await call("workshop:mine", tokens);
  const list = res.ok ? res.islands : [];
  $("#mine").innerHTML = list.length
    ? list.map((i) => `<button class="ghost item" data-id="${i.id}">${esc(i.title)}
        <span class="small muted">${i.built ? "섬 완성" : "쓰는 중"}${i.published ? " · 공개" : ""}</span></button>`).join("")
    : `<p class="muted small">아직 없어요</p>`;
  document.querySelectorAll("#mine .item").forEach((b) => (b.onclick = () => open(b.dataset.id)));
}

socket.on("connect", refreshMine);
let islandList = [];
function fillIslands() {
  const sel = $("#solo-island");
  const keep = sel.value;
  sel.innerHTML = islandList
    .map((i) => `<option value="${i.id}">${esc(i.title)} · ${esc(i.genre.join(" · "))}${current?.id === i.id ? " (지금 쓰는 섬)" : ""}</option>`)
    .join("");
  sel.value = current && islandList.some((i) => i.id === current.id) ? current.id : keep || islandList[0]?.id || "";
}
socket.on("meta", (m) => {
  islandList = m.islands;
  fillIslands();
  $("#pregen").innerHTML = m.pregens.map((p, i) => `<option value="${i}">${esc(p.name)} 「${esc(p.title)}」</option>`).join("");
});
socket.on("workshop:progress", (msg) => ($("#progress").textContent = `⏳ ${msg}…`));

$("#new").onclick = async () => {
  const author = $("#author").value.trim();
  if (!author) return ($("#author").focus(), alert("닉네임을 입력해 주세요"));
  const res = await call("workshop:create", { author, title: $("#new-title").value });
  if (!res.ok) return alert(res.error);
  keys.set(res.id, { token: res.token, title: $("#new-title").value || "제목 없는 섬" });
  $("#new-title").value = "";
  await refreshMine();
  open(res.id);
};

async function open(id) {
  const k = keys.all()[id];
  if (!k) return;
  const res = await call("workshop:load", { id, token: k.token });
  if (!res.ok) {
    if (res.error.startsWith("MISSING:")) {
      keys.drop(id);
      refreshMine();
    }
    return alert(res.error.replace(/^MISSING:/, ""));
  }
  current = { id, token: k.token };
  $("#editor").classList.remove("hidden");
  $("#title").value = res.title;
  $("#draft").value = res.draft;
  $("#published").checked = res.published;
  $("#status").textContent = "";
  $("#error").textContent = "";
  $("#progress").textContent = "";
  showReview(res.review, null);
  fillIslands();
  dirty = false;
  $("#editor").scrollIntoView({ behavior: "smooth" });
}

async function save() {
  if (!current) return;
  const res = await call("workshop:save", { ...current, draft: $("#draft").value, title: $("#title").value });
  if (!res.ok) {
    if (res.error.startsWith("MISSING:")) {
      keys.drop(current.id);
      current = null;
      $("#editor").classList.add("hidden");
      refreshMine();
    }
    return ($("#error").textContent = res.error.replace(/^MISSING:/, ""));
  }
  dirty = false;
  $("#status").textContent = `저장됨 ${new Date(res.savedAt).toLocaleTimeString("ko-KR")}`;
  refreshMine();
}
$("#save").onclick = save;
$("#draft").addEventListener("input", () => {
  dirty = true;
  $("#status").textContent = "저장 안 됨";
});
setInterval(() => dirty && save(), 15000); // 15초마다 자동 저장
window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });

$("#build").onclick = async () => {
  await save();
  $("#error").textContent = "";
  $("#build").disabled = true;
  $("#progress").textContent = "⏳ Claude가 섬을 읽는 중… (1~3분)";
  const res = await call("workshop:build", current);
  $("#build").disabled = false;
  if (!res.ok) {
    $("#progress").textContent = "";
    return ($("#error").textContent = res.error);
  }
  $("#progress").textContent = "✓ 섬이 만들어졌어요";
  $("#title").value = res.preview.title;
  showReview(res.review, res.preview);
  refreshMine();
};

function showReview(review, preview) {
  $("#review").classList.toggle("hidden", !review);
  if (!review) return;
  $("#questions").innerHTML = review.questions.map((q) => `<li>${esc(q)}</li>`).join("") || "<li>없음</li>";
  $("#invented").innerHTML = review.invented.map((q) => `<li>${esc(q)}</li>`).join("") || "<li>없음</li>";
  $("#warnings").innerHTML = review.warnings.length ? `⚠️ ${review.warnings.map(esc).join(" · ")}` : "";
  $("#preview").innerHTML = preview
    ? `<b>${esc(preview.title)}</b> <span class="muted">${esc(preview.genre.join(" · "))}</span>
       <div>${esc(preview.tagline)}</div>
       <div class="small muted">소문: ${esc(preview.rumor)}</div>
       <div class="small">주민: ${preview.npcs.map(esc).join(", ")}</div>
       <div class="small">막: ${preview.acts.map(esc).join(" → ")}</div>`
    : `<span class="muted small">마지막으로 만든 결과가 있어요. 다시 만들면 새로 보여 줘요.</span>`;
}

$("#published").onchange = async () => {
  const res = await call("workshop:publish", { ...current, published: $("#published").checked });
  if (!res.ok) {
    $("#published").checked = false;
    alert(res.error);
  }
  refreshMine();
};

$("#solo").onclick = async () => {
  if (dirty) await save();
  const res = await call("workshop:solo", {
    islandId: $("#solo-island").value, nickname: $("#author").value.trim() || "작성자",
    rating: $("#solo-rating").value, adult: $("#solo-adult").checked, pregen: Number($("#pregen").value),
  });
  if (!res.ok) return alert(res.error);
  localStorage.setItem("session", JSON.stringify({ code: res.code, playerId: res.playerId }));
  location.href = "/?resume=1";
};
