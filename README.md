# The Odyssey

친구들이 한 배의 선원이 되어, 서로 다른 세계(멀티버스)로 이루어진 섬들을 항해하는 AI TRPG.
Claude가 게임 마스터를 맡고, 서버가 주사위·호감도·비밀 행동·서사 진행을 관리합니다. 설계는 [docs/DESIGN.md](docs/DESIGN.md).

## 실행

Node 22.9 이상이 필요합니다(`.nvmrc` 참고).

```bash
npm install
cp .env.example .env # 선택 — API 키는 게임 화면의 ⚙️ 설정에서 넣어도 됩니다
npm run dev          # http://localhost:3000
```

- **API 키가 없으면 모의 GM**으로 돌아갑니다(흐름 확인용, 비용 없음).
- **Claude GM**을 쓰려면 서버를 켤 때 콘솔에 찍히는 **⚙️ 설정 링크**(`http://localhost:3000/#admin=…`)를 서버 컴퓨터의 브라우저로 한 번 열고, **⚙️ 설정**에서 Anthropic API 키를 넣으세요. 저장할 때 키를 확인하고, 서버를 다시 켜지 않아도 바로 Claude GM으로 바뀝니다.
  - 설정은 서버를 켠 컴퓨터에서, 설정 링크로 연 브라우저만 바꿀 수 있어요. ngrok 같은 터널을 쓰면 친구들 접속도 localhost로 보이기 때문에 링크의 관리자 토큰으로 한 번 더 확인합니다. 설정 링크는 남에게 보내지 마세요.
  - 키와 관리자 토큰은 서버 컴퓨터의 `data/settings.json`(git 제외)에만 저장돼요.
  - 설정 화면에서 GM 모델(Opus 5.5 · Fable 5.1 · Sonnet 5.5)과 생각의 깊이(effort)도 고를 수 있어요. 예전에 Opus 5 · Sonnet 5로 저장해 둔 설정은 같은 계열 최신 모델로 자동으로 바뀝니다.
  - `.env`의 `ANTHROPIC_API_KEY`도 계속 쓸 수 있고, 설정 화면에 넣은 값이 우선합니다.
- 친구들과 같은 와이파이에 있으면 `http://<내 IP>:3000`으로 접속합니다. 밖에 있는 친구와 하려면 Tailscale이나 ngrok 같은 터널을 쓰세요. 터널이 주소를 바꿔 전달해서 접속이 막히면 `.env`의 `ALLOWED_ORIGINS`에 터널 주소를 넣으세요.
- 진행 중인 방은 `data/rooms.json`에 30초마다, 그리고 서버를 끌 때(Ctrl+C) 저장돼서 다시 켜도 이어 할 수 있어요. 아무도 없는 방은 6시간 뒤 정리됩니다.
- 선택 환경 변수는 `.env.example`에 정리돼 있어요: `GM_MODEL`(기본 `claude-opus-5-5`), `GM_EFFORT`(`low`/`medium`/`high`, 기본 `high`), `PORT`, `GM=mock`(키가 있어도 모의 GM 사용), `MAX_ROOMS`, `ALLOWED_ORIGINS`
- 비용 보호: 방 만들기·섬 상륙·라운드·섬 만들기는 접속자별·서버 전체로 호출 횟수가 제한돼요(`server/guard.ts`).

## 플레이 방법

1. 한 명이 **방 만들기**(등급 선택) → 6자리 방 코드를 친구들에게 알려 줍니다. 성인 등급 방은 전원이 성인 확인을 해야 들어올 수 있어요.
2. 각자 **캐릭터**를 고르거나(미리 만든 5명) 직접 만듭니다. 원형 · 출신 특성 · 배경만 고르면 능력치와 기술은 규칙에 맞게 자동으로 채워져요.
3. 방장이 **섬**을 고르면 상륙 장면이 시작됩니다.
4. 라운드마다 각자 **행동 / 대사 / 관망**을 제출합니다. 모두 제출하면 GM이 한꺼번에 서술해요(방장이 **라운드 진행**으로 먼저 넘길 수도 있어요).
   - `(괄호)` 안은 **비밀 행동**입니다. 다른 선원에게는 `(미심쩍은 행동을 했다)`로만 보이고, 들키면 GM이 진실을 폭로합니다.
   - 🌟 **영감**이 있으면 이번 판정에 이점을 받을 수 있어요.
   - ✋ **X카드**: 불편한 장면을 이유 없이 넘깁니다.
5. 오른쪽 탭에서 파티 상태, 내 캐릭터, NPC와의 **관계**, 배에 실은 **유물**과 항해일지를 볼 수 있어요.

## 테스트

```bash
npm run check                  # 타입 검사 + 단위 테스트 + 섬 팩 검증 (CI와 같음)
npm test                       # 규칙 · 호감도 · 비밀 행동 · 시야 필터 단위 테스트
npm run validate               # 모든 섬 팩 검증
npm run smoke                  # 모의 GM으로 섬 하나 자동 플레이
npm run smoke -- --claude mist-lantern 3   # Claude GM으로 3라운드 (API 비용 발생)
```

## 내 섬 만들기

```bash
cp -r islands/_template islands/my-island    # 폴더 이름 = 섬 id
# islands/my-island/draft.md 질문지 작성
npm run island:build -- my-island            # draft.md → island.yaml + review.md (Claude 사용)
npm run validate -- my-island                # 직접 고친 뒤 다시 검사
```

`review.md`에 AI가 채워 넣은 부분과 확인이 필요한 질문이 정리됩니다. 섬 파일에는 비밀이 들어 있으니 다른 친구에게 보여 주지 마세요. 템플릿과 예시를 뺀 섬은 git에 올라가지 않습니다.

## 보안 — API 키는 절대 올라가지 않게

- API 키는 `data/settings.json`(⚙️ 설정) 또는 `.env`에만 두세요. 두 곳 모두 `.gitignore`로 제외돼 있어요.
- `npm install`을 하면 커밋 전 검사 훅(`.githooks/pre-commit`)이 켜져서, 키처럼 생긴 문자열이나 비밀 파일이 들어간 커밋을 막습니다.
- GitHub 쪽에도 시크릿 스캔과 푸시 차단이 켜져 있어요.
- 푸시와 PR마다 GitHub Actions(`.github/workflows/ci.yml`)가 `npm run check`와 같은 검사를 돌립니다.
