# The Odyssey — 설계 문서 v0.3

친구들이 한 배의 선원이 되어, 서로 다른 세계(멀티버스)로 이루어진 섬들을 차례로 방문하는 멀티플레이 TRPG.
Claude가 GM을 맡고, 서버가 주사위·호감도·비밀 행동·전투·거래·서사 진행을 관리한다.
규칙은 새로 만들지 않고 공개 라이선스 TRPG 자료에서 가져왔다([CREDITS.md](../CREDITS.md), 조사 원문 [research/trpg-systems.md](research/trpg-systems.md)).

## 1. 핵심 결정

| 영역 | 결정 | 출처 |
|---|---|---|
| 판정 | d20 + 능력 수정치 + 숙련 ≥ DC, 이점/불리, 자연 20·1, 포인트 바이 27 | SRD 5.2 (BG3와 같은 뼈대) |
| 캐릭터 | 능력치 6·기술 18은 세계 중립으로. 종족·클래스 대신 **원형 9 · 출신 특성 7 · 배경 13(+직접 만들기)**, 출신 세계와 호칭은 자유 서술 | SRD 5.2를 멀티버스용으로 조정 |
| 섬의 세계 | 섬마다 `world.reality`(장르·시대·마법/기술 수준·말투·외부인 시선·crossover 규칙) | 우리 설계 |
| 서사 | 막(act)·고난(trial)·축복(blessing)·진행 시계·position·GM 수·핵심 단서 | Blades · Dungeon World · GUMSHOE · LGMRD |
| 전투 | 우선권·공격·피해·치명타·상태 이상·사망 내성, 격자 없는 구역 전투, 즉석 적 수치, 사기 판정 | SRD 5.2 · LGMRD · Cairn(개념) |
| 거래 | 1코인 = SRD 금화 1개 공통 단위, 섬별 화폐 이름, 기술 수준 간 가격, 호감도 가격, 흥정 | SRD 5.2 · d20 Modern · d20 Future |
| NPC | 선원 한 명 한 명·다른 NPC에 대한 호감도 −100~100, 6단계 행동, 소문 전파 | 우리 설계 (SRD 영향 주기와 호환) |
| 비밀 행동 | 행동의 `(괄호)`는 행동자와 GM만. 들키면 GM이 폭로 | 우리 설계 |
| 문체 | 한국 웹소설 수준 서술 지침 + AI 티 자동 검사·윤문 | creative-writing-skills · fiction · im-not-ai · koreanizer |
| 성장 | 섬 하나를 마칠 때마다 1레벨 (이정표 성장) | LGMRD |
| 등급 | 전체 / 15세 / 성인. 방 등급과 섬 등급 중 낮은 쪽 적용 | 우리 설계 |

## 2. 섬 추가하기

```
draft.md 질문지 작성 → npm run island:build (Claude가 island.yaml 생성·검증, 최대 3회 재시도) → review.md 확인 → validate · lint:prose
```

- 질문지: `islands/_template/draft.md` (세계 · 이야기 4막 · NPC 호감도 행동 · 고난 · 축복 · 결말 · 유물)
- 스키마: [`shared/island.ts`](../shared/island.ts). 검증기는 참조 무결성과 플레이 경고(아무도 모르는 비밀, 한 막에 몰린 고난, 관계없는 NPC 등)를 본다.
- 문장: [`docs/style/naming-and-prose-for-islands.md`](style/naming-and-prose-for-islands.md) 지침, `npm run lint:prose`로 AI 티 검사.
- 공개 범위: `meta`·`public`만 선원에게 보인다. 나머지는 GM(과 섬지기)만. 친구들의 섬은 git에 올리지 않는다.
- 테스트용 섬 10개: 등대섬 · 오피스 · 사이버펑크 · 서부 · 고어 호러 · 궁중 사극 · 포스트아포칼립스 · 동화 · 누아르 · 무협.

## 3. 멀티버스

- 섬의 `reality`가 서술의 결을 정한다. NPC는 자기 세계 지식만 알고, 선원은 각자의 출신 세계 눈으로 본다.
- 다른 세계의 능력·물건은 `crossover`(works / weakened / transformed / fails)를 따른다. 물건의 `kind`(mundane/tech/magic/anomaly)가 어느 규칙을 받을지 정한다. GM은 판정을 `record_ruling`으로 기록해 일관성을 지킨다.
- 원형의 대표 능력은 세계마다 모습이 바뀐다(이능자: 판타지에선 마법, 현대에선 초능력, SF에선 이식 장치).
- 돈은 배가 환전해 준다. 화폐 이름만 섬마다 다르다(냥·달러·크레딧·배급권…).
- 유물(treasures)의 효과는 어느 섬에서든 통하게 쓴다.

## 4. 판정과 서사

- **position**(Blades): 판정 전에 GM이 안정·위험·절박을 정한다. 실패의 대가가 달라지고, 절박에 뛰어들면 영감을 받는다.
- **진행 시계**(Blades): 섬의 위기 시계(`crisis`) + 장면·세력 시계(`create_clock`, 4/6/8/10/12칸). 위기 시계가 차면 clock·finale 이벤트.
- **막 구조**: `story.acts`의 goal·beats·turn을 향해 몰고 가고, 전환점에서 `advance_act`. 고난은 해당 막에서 반드시 마주치고, 실패해도 대가를 치르고 나아간다. 결말은 선원의 선택이 정한다.
- **핵심 단서**(GUMSHOE): 다음 장면으로 가는 단서는 판정 없이 준다. 결론 하나에 단서 셋(3단서 규칙).
- **GM 수**(Dungeon World): 쳐다보면 soft, 실패하면 hard. 수의 이름은 말하지 않는다.
- **오라클**(Ironsworn): 섬 팩에 답이 없는 예/아니오 사실은 서버가 d100으로.
- **장면의 사실**(Fate): `set_scene_aspect`로 등록, 영리하게 쓰면 이점.
- **영감**: 파티 공용 최대 4, 상륙 때 최소 2로 채운다. 배경 목표에 맞게 행동하거나 절박한 판정에 뛰어들면 +1. 써서 판정에 이점.

## 5. 호감도

- NPC마다 선원별·NPC별 값(−100~100). 단계: 적대 · 불신 · 중립 · 호의(20) · 신뢰(60) · 유대(90).
- NPC의 `likes`/`dislikes`에 닿으면 `change_affinity`. 단계별 `behaviors`로 행동이 바뀌고, 사회 판정에 이점/불리가 자동으로 붙는다.
- 목격된 일은 관계(relations ±20 이상)를 따라 30%씩 소문으로 번진다. 친한 NPC는 같은 방향, 적대하는 NPC는 반대 방향.
- NPC는 `knows[].share_at` 단계 이상의 선원에게만 비밀을 털어놓는다. 상인은 호감도에 따라 값을 바꾼다(적대면 안 판다).
- `romance: true`인 성인 NPC만 유대 단계에서 연애로 발전할 수 있다. 미성년 NPC는 어떤 경우에도 성적 맥락 금지.

## 6. 비밀 행동 — (괄호)

- 괄호 안은 행동자와 GM(과 섬지기)만 안다. 다른 선원에게는 `(미심쩍은 행동을 했다)`. 닫는 괄호를 빼먹으면 끝까지 비밀로 처리한다.
- 비밀 판정은 다른 선원에게 "🎲 비밀 판정"으로만 보인다. 같은 자리의 선원은 수동 감지·통찰로 자동으로 눈치챌 수 있다.
- 실패하면 `expose_hidden_action` → NPC 반응 서술 → 라운드 끝에 🔓 시스템 설명. 조사에 성공한 선원에게만 `share_hidden_action`. 스스로 공개 가능.
- 새 비밀 행동이 있는 라운드는 서술을 스트리밍하지 않고 누출 검사를 거쳐 보낸다.

## 7. 전투 (SRD 5.2 + LGMRD)

- `start_combat`: 적은 SRD 인간형 블록(포졸·산적·자객… 세계에 맞게 이름만 바꿈)이나 CR로. 서버가 우선권(기습당한 쪽 불리)을 굴린다.
- `attack`: 명중(AC)·치명타(주사위 2배)·피해·HP 감소를 서버가 처리. 선원 AC = 10 + 민첩 + 방어구.
- `apply_damage`(내성 절반), `apply_condition`(SRD 상태 이상 15종), `end_combat`(승리·도주·항복·협상).
- 적의 첫 사상자와 절반이 쓰러질 때 사기 판정(Cairn 개념). 무너지면 도망·항복·협상.
- 쓰러진 선원은 라운드마다 사망 내성. 3번 실패해도 죽이지 않고 큰 대가로 바꾼다(우리 규칙).

## 8. 거래

- 선원은 100코인으로 시작. 서버는 0.01코인 단위 정수로 저장.
- 섬마다 물가표(생활비·숙박·식사·정보·뇌물·특수 서비스·그 기술 수준의 장비 목록)가 GM 프롬프트에 들어간다.
- `buy`: 정가 × 기술 수준(낮으면 ×0.5씩, 한 단계 높으면 ×5, 두 단계 이상은 불가) × 상인 호감도 × 흥정 결과.
- `sell`: 장비 50%(흥정해도 최대 65%), 보석·교역품 100%. `pay`: 숙박·뇌물·서비스·선원끼리 송금.
- `haggle`: DC max(15, 눈썰미 DC+2). 결과 6단계, 위협은 성공해도 호감 −10, 자연 1이면 거래 거부.

## 9. GM 파이프라인

```
system ① 핵심 규칙 + GM 기술 + 전투·거래 규칙 + 문체 지침      (모든 섬 공통, 1시간 캐시)
system ② 등급 규칙 + 섬 팩 전체 + 물가표 + 선원 명단 + 항해일지  (섬마다 고정, 1시간 캐시)
messages   라운드마다 <state>(막·시계·위치·호감도·전투·돈·비밀 행동) + <actions> 추가 (append-only)
```

1. Claude가 도구를 부르며 서술을 스트리밍한다(`claude-opus-5-5`, adaptive thinking, effort 기본 high, 거절 시 서버 측 fallback `"default"` — 거절 사유에 맞는 모델로 API가 넘김).
2. 새 비밀 행동이 있던 라운드: 누출 검사(effort low) → 새었으면 그 부분만 고친다.
3. **AI 티 검사**: `ai-tells-ko.json` 41개 패턴으로 센 뒤 기준을 넘으면 걸린 곳만 윤문(koreanizer 소설 모드 원칙). 고친 쪽이 더 나을 때만 바꾼다.
4. 탄로 설명·결말 알림은 서술 뒤에 표시한다. 섬을 떠나면 항해일지 요약 + 레벨업.

GM 도구 30종: `roll` `tick_clock` `create_clock` `ask_oracle` `set_scene_aspect` `start_combat` `attack` `apply_damage` `apply_condition` `end_combat` `haggle` `buy` `sell` `pay` `advance_act` `move_party` `discover_location` `reveal_island_secret` `change_affinity` `start_event` `resolve_trial` `grant_blessing` `give_treasure` `grant_inspiration` `update_character` `whisper` `expose_hidden_action` `share_hidden_action` `record_ruling` `end_island` (정의: [`server/gm/tools.ts`](../server/gm/tools.ts)). 입력은 Zod로 검증하고, 틀리면 오류를 돌려줘 GM이 스스로 고치게 한다.

## 10. 문체

- 지침: [`docs/style/gm-style-prompt.md`](style/gm-style-prompt.md) — 과거형 3인칭, 장면 한가운데서 시작, 구체 명사, 감정 이름 붙이지 않기, 흔한 몸짓 금지, 문단 1~3문장, 대사의 서브텍스트와 인물별 말투, 긴장을 서둘러 풀지 않기, 상투적인 결말 질문 금지. 목표 수준의 예문 포함.
- 섬 작성 지침: [`docs/style/naming-and-prose-for-islands.md`](style/naming-and-prose-for-islands.md) — 괄호 한자 병기·줄표 부제·과장 수식 금지, 그 세계 사람들이 부르는 이름.
- 출처 스킬은 `vendor/`에 원본째 두고 `.claude/skills/`로 연결했다. Claude Code에서 섬을 쓰거나 고칠 때 바로 불러 쓸 수 있다.

## 11. 멀티플레이

- 방 코드 + 닉네임(계정 없음). 성인 방은 입장 때 성인 확인.
- 라운드마다 행동/대사/관망 제출 → 전원 제출 또는 방장이 진행 → GM 서술. X카드로 장면 전환.
- 서버가 유일한 진실의 원천이고, 선원마다 보이는 로그를 걸러서 보낸다(비밀 행동, 귓속말, 호감도 변화).
- 기술: Node 22 + Socket.IO 서버, 빌드 없는 웹 클라이언트, Zod 스키마 공유. 저장은 아직 메모리(서버를 끄면 방이 사라진다).

## 12. 남은 일

- 방 저장/불러오기(SQLite), 섬지기(작성자 공동 GM) 패널, 웹에서 섬 업로드
- 항해(VOYAGE) 단계: 다음 섬 투표, 항해 사건, 정비 활동(Blades downtime)
- Fate 강요(compel) 수락/거절 UI, 맹세·진행 트랙(Ironsworn)
- OGL 1.0a 전문 동봉, d20 Future 수치 원문 재확인
