// Portions Copyright (c) 2026 heojunfo
// ⚙️ 설정 창 — 게임·섬 공방이 같이 쓴다. window.socket이 있어야 한다.
(() => {
  const box = document.createElement("div");
  box.className = "overlay hidden";
  box.id = "settings";
  box.innerHTML = `
    <div class="overlay-card settings-card">
      <h2>⚙️ 설정</h2>
      <p id="st-status" class="small"></p>
      <label>Anthropic API 키
        <input id="st-key" type="password" autocomplete="off" placeholder="sk-ant-..." />
      </label>
      <p class="muted small">키는 서버를 켠 컴퓨터의 <code>data/settings.json</code>에만 저장되고 화면에는 다시 보이지 않아요. 키는
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic 콘솔</a>에서 만들 수 있어요.</p>
      <label>GM 모델 <select id="st-model"></select></label>
      <label>생각의 깊이 (effort)
        <select id="st-effort">
          <option value="high">high — 서술이 가장 좋음 (기본)</option>
          <option value="medium">medium — 조금 더 빠름</option>
          <option value="low">low — 빠르고 저렴</option>
        </select>
      </label>
      <p id="st-error" class="error"></p>
      <div class="composer-row">
        <button id="st-save">저장</button>
        <button id="st-clear" class="ghost">키 지우기</button>
        <span class="spacer"></span>
        <button id="st-close" class="ghost">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const q = (s) => box.querySelector(s);
  const ask = (ev, payload) => new Promise((r) => window.socket.emit(ev, payload, (res) => r(res ?? { ok: true })));
  // 서버 콘솔에 찍히는 설정 링크(#admin=...)로 열면 관리자 토큰을 이 브라우저에 저장해 둔다
  const hash = location.hash.match(/admin=([0-9a-f]+)/);
  if (hash) {
    try { localStorage.setItem("adminToken", hash[1]); } catch {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  const adminToken = () => { try { return localStorage.getItem("adminToken") ?? ""; } catch { return ""; } };

  function show(v) {
    q("#st-model").innerHTML = v.models.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    q("#st-model").value = v.model;
    q("#st-effort").value = v.effort;
    q("#st-status").innerHTML = v.hasKey
      ? `✅ 키 연결됨 <code>${v.masked}</code>${v.source === "env" ? " (.env)" : ""} · 지금 GM: <b>${v.gm}</b>`
      : `⚠️ 키가 없어서 <b>모의 GM</b>으로 동작 중이에요. 키를 넣으면 Claude가 GM을 맡아요.`;
    const lock = !v.canEdit;
    for (const el of box.querySelectorAll("input, select, #st-save, #st-clear")) el.disabled = lock;
    if (lock) q("#st-error").textContent = "설정은 서버를 켠 컴퓨터에서, 서버 콘솔에 표시된 ⚙️ 설정 링크로 열어야 바꿀 수 있어요.";
  }

  window.openSettings = async () => {
    q("#st-error").textContent = "";
    q("#st-key").value = "";
    box.classList.remove("hidden");
    const v = await ask("settings:get", adminToken());
    if (v.ok) show(v);
  };
  q("#st-close").onclick = () => box.classList.add("hidden");
  q("#st-save").onclick = async () => {
    q("#st-error").textContent = "";
    q("#st-save").disabled = true;
    q("#st-status").textContent = "확인하는 중…";
    const res = await ask("settings:set", { adminToken: adminToken(), apiKey: q("#st-key").value, model: q("#st-model").value, effort: q("#st-effort").value });
    q("#st-save").disabled = false;
    q("#st-key").value = "";
    if (!res.ok) {
      q("#st-error").textContent = res.error;
      const v = await ask("settings:get", adminToken());
      if (v.ok) show(v);
      return;
    }
    show(res);
    q("#st-status").innerHTML += " · 저장했어요";
  };
  q("#st-clear").onclick = async () => {
    const res = await ask("settings:set", { adminToken: adminToken(), clearKey: true });
    if (!res.ok) return void (q("#st-error").textContent = res.error);
    show(res);
  };
})();
