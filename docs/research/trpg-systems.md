# 기존 TRPG 규칙 조사 — 무엇을 가져올 것인가

> 조사일: 2026-09-23 · 대상: 서사 구조, 전투, 거래·상점·경제, 보상·성장, NPC 관계, 섬 소재
> 원칙: **규칙은 새로 만들지 않고, 평판 좋은 기존 TRPG에서 가져온다.** 오픈 라이선스(CC BY / CC BY-SA / OGL) 문서는 수치까지 가져오고, 저작권이 있는 글(블로그·책)은 기법(아이디어)만 우리 말로 정리한다.
> 판정 뼈대는 이미 정해져 있다: `shared/rules.ts`(D&D 5e/BG3식 d20 + 능력 수정치 + 숙련 vs DC, 이점/불리, 자연 20/1, 포인트 바이 27, 영감).

함께 만든 데이터 (서버가 바로 읽을 수 있는 형태, 설명은 모두 우리 말로 새로 씀):

| 파일 | 내용 |
|---|---|
| [`data/combat.json`](data/combat.json) | 우선권, 행동 경제, 공격·피해·치명타, 엄폐, AC 단계(기술 수준별 겉모습), 무기 분류별 피해 주사위(원시→미래), 상태 이상 15종, 사망 내성, 휴식, 전투 난이도 예산, 즉석 몬스터 수치, 구역 전투, 공포·정신 스트레스, NPC 능력치 블록 재활용표 |
| [`data/economy.json`](data/economy.json) | 세계 공통 코인과 섬별 화폐 이름, 생활비·숙박·식사·서비스, 기술 수준 간 가격 규칙, 제한 물품·암시장, 정보·뇌물 값, 흥정, 정착지 규모, 상점 유형, 기술 수준별 무기·방어구·장비 가격, 마법·이상 물건 희귀도, 제작 |
| [`data/narrative.json`](data/narrative.json) | 진행 시계, 위치(position)와 효과(effect), 악마의 거래, GM 의제·원칙·수(soft/hard), 전선(front), 장면 연출 기법, 3단서 규칙·핵심 단서·노드 구조, 준비 체크리스트, 5방 구조, 퀘스트 틀, 오라클, 맹세와 진행 트랙, 상황 측면·강요, 항해 정비 활동, 수배도 |

---

## 0. 한눈에 보는 결론

1. **전투·장비·상태 이상은 SRD 5.2(CC BY 4.0)를 그대로 쓴다.** 이미 고른 판정 뼈대와 같은 계열이라 충돌이 없다. 격자 대신 **Lazy GM's Resource Document(CC BY 4.0)의 구역 전투·마음의 극장** 방식을 얹어 LLM이 좌표 없이 서술할 수 있게 한다.
2. **서사는 Blades in the Dark의 진행 시계 + Dungeon World의 GM 수(soft/hard) + 3단서 규칙/GUMSHOE 핵심 단서** 조합으로 간다. 섬 팩의 `world.clock`, `events`, `secrets.hints`가 이미 이 틀과 거의 1:1로 맞는다.
3. **경제는 "1코인 = SRD 금화 1개"를 모든 세계의 공통 단위로 삼고**, 중세 이하 물가는 SRD, 산업·현대 물가는 d20 Modern SRD(OGL)의 구매 DC를 코인으로 바꿔 쓴다. 기술 수준이 다른 물건의 값은 d20 Future의 Progress Level 규칙(낮으면 싸고, 높으면 비싸거나 못 삼)을 따른다.
4. **LLM이 약한 부분은 서버 도구로 뺀다**: 무작위 질문(Ironsworn 오라클), 시계 칸, 가격 계산, 흥정 결과, 우선권, 사망 내성.
5. 흥정 규칙은 오픈 라이선스 자료에서 **정식 규칙을 찾지 못했다.** SRD 5.2의 "영향 주기(Influence)" 행동 틀 위에 할인 폭만 우리가 정했다(`economy.json`의 `haggling`, source: ours).

---

## 1. 조사한 자료와 라이선스 (직접 확인)

| 자료 | URL | 라이선스 (확인 방법) | 가져올 것 |
|---|---|---|---|
| **SRD 5.2** (Wizards of the Coast) | https://www.dndbeyond.com/srd | **CC BY 4.0** — PDF 1쪽 법적 고지 원문 확인 | 전투, 상태 이상, 휴식, 장비·가격, 생활비, 서비스, 마법 물건 희귀도·제작, 전투 난이도 예산, 몬스터·NPC 능력치, 공포·정신 스트레스, 함정 |
| **Blades in the Dark SRD** (John Harper) | https://bladesinthedark.com/ · 텍스트: https://github.com/amazingrando/blades-in-the-dark-srd-content | **CC BY 3.0** — bladesinthedark.com/licensing 확인. 도스크볼 설정·NPC·그림·지도는 제외 | 진행 시계, 위치·효과, 결과(consequence) 종류, 악마의 거래, 정비 활동, 자산 조달, 수배도 |
| **Dungeon World SRD** (Sage LaTorra, Adam Koebel) | https://github.com/Sagelt/Dungeon-World · https://www.dwsrd.org/gm/ | **CC BY 3.0** — 저장소 LICENSE 확인 | GM 의제, GM 원칙, GM 수 12종, 전선(front) |
| **Ironsworn SRD / Starforged Reference Guide** (Shawn Tomkin) | https://tomkinpress.com/pages/licensing · 데이터: https://github.com/rsek/dataforged | SRD·Reference Guide(이동·오라클·요약)는 **CC BY 4.0**, 책 전문은 CC BY-NC-SA 4.0 — Tomkin Press 라이선스 페이지 확인 | 오라클(확률 5단계), 진행 트랙·도전 등급, 맹세, 영감 표(행동/주제), 우주·던전 오라클 |
| **Fate Condensed SRD** (Evil Hat) | https://fate-srd.com/fate-condensed | **CC BY 3.0** — fate-srd.com 라이선스 페이지 확인 | 상황 측면(aspect), 강요(compel), 발동(invoke), 리프레시 개념 |
| **GUMSHOE SRD** (Pelgrane Press) | https://pelgranepress.com/gumshoe/files/GUMSHOE%20SRD%20CC%20version.pdf | **CC BY 3.0** — PDF 1쪽 원문 확인. 로고·개별 게임 상표 사용 불가 | 핵심 단서(core clue)는 판정 없이 준다, 떠다니는 핵심 단서 |
| **Lazy GM's Resource Document** (Michael E. Shea) | https://slyflourish.com/lazy_gm_resource_document.html · https://github.com/crit-tech/LGMRD | **CC BY 4.0** — 문서 표기 확인 | 8단계 준비, 강한 시작, 비밀과 단서 10개, 환상적인 장소, 퀘스트 틀 10종, 구역 전투, 무리 운용, 즉석 몬스터 수치, 난이도 다이얼, 보물 꾸러미, 황야 여행 역할 |
| **d20 Modern SRD (MSRD)** (Wizards of the Coast, 2002) | https://archive.org/details/d20modernsrd | **OGL 1.0a** — PDF 끝 OGL 전문과 15조 저작권 고지 확인 | 부(Wealth)·구매 DC, 제한 물품·암시장, 정보 수집·뇌물 가격, 현대 화기·방어구·생활비 |
| **d20 Future** (MSRD 수록) | https://en.wikipedia.org/wiki/D20_Future | OGL 1.0a — **원문 미확인, 2차 출처로만 확인** | Progress Level(PL 0~8), 기술 수준 간 가격 규칙, 레이저 무기 피해 |
| **Cairn 2e** (Yochai Gal) | https://cairnrpg.com/second-edition/ | **CC BY-SA 4.0** — 사이트 표기 확인 | 사기(morale) 판정 개념만 |
| **One Page Solo Engine** (Karl Hendricks) | https://inflatablestudios.itch.io/one-page-solo-engine | CC BY-SA 4.0 (배포처 표기) | 쓰지 않음 — Ironsworn 오라클로 충분 |
| **The Alexandrian** (Justin Alexander) | https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule · 노드 설계 모음: https://thealexandrian.net/wordpress/8122/roleplaying-games/node-based-scenario-design-collectors-edition | **저작권 있음** (오픈 라이선스 아님) | 3단서 규칙, 뒤집은 3단서 규칙, 노드 구조 — 아이디어만 |
| **5 Room Dungeon** (Johnn Four) | https://www.roleplayingtips.com/5-room-dungeons/ | **저작권 있음** | 5단계 장면 구조 — 아이디어만 |
| Black Flag Reference Document (Kobold Press) | https://koboldpress.com/black-flag-reference-document/ | CC BY 4.0 또는 ORC (발표문 확인) | 후보: NPC 태도, 공포(dread), 저주·질병 — 이번엔 채택하지 않음 |
| Trophy SRD (Jesse Ross) | https://trophyrpg.com/ | CC BY 4.0 (2차 출처) | 후보: 호러 섬 분위기 장치 — 이번엔 채택하지 않음 |

> Mythic GM Emulator, Worlds/Stars Without Number, Apocalypse World 본문, Into the Odd는 **오픈 라이선스가 아니어서** 수치·글을 가져오지 않았다. 무료 공개(free)와 오픈 라이선스(open)는 다르다.

---

## 2. 서사 구조

### 2.1 진행 시계 — Blades in the Dark (CC BY 3.0) ★ 채택

- **무엇을**: 원 모양 칸 시계. 크기는 4(복잡함) / 6(까다로움) / 8(벅참), 장기 과제는 그 이상. 종류는 위험·진행·경주·연결·줄다리기·세력·장기 과제. 효과가 제한적이면 1칸, 보통이면 2칸, 크면 3칸, 결과가 가벼우면 1칸·보통 2칸·심각하면 3칸을 진행한다.
- **우리 시스템과의 대응**: `island.world.clock`(3~12칸)이 곧 위험 시계다. `events[kind=clock]`은 칸마다 벌어지는 일, `events[kind=finale]`은 다 찼을 때다. **여기에 섬 안에서 GM이 새 시계를 만들 수 있게** 하면(`create_clock`, `tick_clock`) 탈출·해킹·설득 같은 긴 행동도 같은 틀로 처리된다.
- **d20 변환 (우리 값)**: Blades는 d6 풀이라 그대로는 못 쓴다. `rules.ts`의 `margin`(총합 − DC)으로 효과를 정한다.

  | d20 결과 | 효과 | 진행 칸 |
  |---|---|---|
  | 실패 | 없음 | 0 (대신 위험 시계가 찬다) |
  | 1~4 모자라지만 GM이 대가를 제안하고 선원이 수락 | 제한 | 1 |
  | 성공 | 보통 | 2 |
  | 10 이상 넘김 또는 자연 20 | 큼 | 3 |

  효과 요인은 Blades의 품질·규모·강도를 가져와 **품질을 "기술 수준 격차 + crossover 규칙"으로 바꿨다.** 중세 섬에 가져간 레이저가 `works`면 효과 한 단계 위, `fails`면 맨손 취급.
- **LLM에 맞는 이유**: 긴장이 "칸"이라는 숫자로 서버에 남으니 LLM이 잊거나 부풀리지 않는다. 선원은 남은 칸을 보고 선택한다.
- **주의점**: 시계를 너무 많이 만들면 화면과 프롬프트가 복잡해진다. 섬마다 동시에 열린 시계는 3개까지로 제한하자(우리 값).

### 2.2 위치(position)와 악마의 거래 — Blades (CC BY 3.0) ★ 채택

- **무엇을**: 판정 전에 "실패하면 얼마나 나빠지는가"를 안정 / 위험(기본) / 절박 세 단계로 정한다. 결과 종류는 효과 감소, 복잡한 일(시계), 기회 상실, 처지 악화, 피해 다섯 가지. **악마의 거래**는 대가를 먼저 받아들이면 판정에 보너스를 주는 장치로, 우리 체계에서는 **이점**으로 바꾼다.
- **대응**: `roll` 도구에 `position` 인자를 추가. 결과 종류마다 쓸 도구를 `narrative.json`의 `consequence_types`에 적었다. 절박한 판정에 뛰어든 선원에게는 영감 1(원작은 경험치).
- **LLM에 맞는 이유**: "실패 = 아무 일도 없음"이라는 LLM의 흔한 약점을 막는다. 실패도 이야기를 앞으로 민다.
- **주의점**: 위치는 DC와 다른 축이다. DC는 "얼마나 어려운가", 위치는 "틀리면 얼마나 아픈가". 프롬프트에서 둘을 섞지 않게 설명해야 한다.

### 2.3 GM 의제·원칙·수 — Dungeon World SRD (CC BY 3.0) ★ 채택

- **무엇을**: 의제 3개(세계를 생생하게, 모험으로 채우기, 결말을 정하지 않고 알아보려고 진행), 원칙 12개, GM 수 12종(적·장소 고유의 수, 반갑지 않은 진실, 위협의 조짐, 피해, 자원 소모, 행동 역이용, 갈라놓기, 원형에 맞는 기회, 약점 노출, 기회 제안, 곤란한 처지, 조건 알리고 묻기). **soft 수**는 경고만 하고 반응할 틈을 주고, **hard 수**는 결과를 바로 적용한다.
- **대응**: hard 수마다 서버 도구를 붙였다(`narrative.json`의 `gm_moves.list[].hard_tool`). 여기에 우리 고유 수 3개(시계 진행, NPC 호감도 반응, 비밀 행동 탄로)를 더했다.
- **전선(front)**: 위협·충동·불길한 징조·다가오는 파국·걸린 질문·등장인물. 섬 팩 필드에 그대로 대응한다(징조 = 시계 이벤트, 파국 = finale, 걸린 질문 = story.theme).
- **주의점**: Apocalypse World 본문은 오픈 라이선스가 아니다. 반드시 **Dungeon World SRD 쪽**을 출처로 삼는다.

### 2.4 3단서 규칙·노드 설계 — The Alexandrian (저작권, 기법만) ★ 채택

- **무엇을**: 알아내야 할 결론마다 단서를 최소 3개, 서로 다른 경로에 둔다. 뒤집으면 "다른 노드로 가는 단서 3개가 있으면 적어도 하나는 따라간다". 구조는 고리(loop), 깔때기(funnel), 층층 케이크(layer cake), 그리고 선원을 찾아오는 능동 노드.
- **대응**: `secrets[].hints`와 `npcs[].knows`가 단서 그래프다. **검증기 경고 제안**: 힌트가 3개 미만인 비밀, 힌트를 아는 NPC·장소가 2곳 미만인 비밀. 능동 노드는 `events[kind=random|clock]`.
- **주의점**: 블로그 글 자체는 저작권이 있다. 문장을 옮기지 말고 우리 말로 요약한 것만 쓴다(이 문서와 JSON이 그렇게 되어 있다).

### 2.5 핵심 단서 — GUMSHOE SRD (CC BY 3.0) ★ 채택

- **무엇을**: 다음 장면으로 가는 데 꼭 필요한 단서는 알맞은 방법으로 찾으면 **판정 없이** 준다. 판정은 추가 정보·시간·대가를 가른다. 특정 장소에 묶지 않은 "떠다니는 핵심 단서"도 쓴다.
- **LLM에 맞는 이유**: 주사위 한 번 실패로 섬 이야기가 막히는 사고를 원천 차단한다. 60~90분 안에 섬 하나를 끝내야 하는 우리 목표와 맞는다.
- **주의점**: "GUMSHOE" 상표는 허락되지만 제휴·보증을 암시하면 안 되고, 로고와 개별 게임 이름(Trail of Cthulhu 등)은 쓸 수 없다.

### 2.6 준비 체크리스트·강한 시작·퀘스트 틀 — Lazy GM's Resource Document (CC BY 4.0) ★ 채택

- **무엇을**: 8단계 준비(선원 확인 → 강한 시작 → 가능한 장면 3~5개 → 비밀과 단서 10개 → 환상적인 장소 3~5곳과 곳마다 특징 3개 → 중요 NPC → 적 → 보상). 최소 세트는 강한 시작·비밀과 단서·장소. 퀘스트 틀 10종(우두머리 제거, 찾기, 구출, 부하 제거, 파괴, 훔치기, 일소, 열쇠 모으기, 방어, 의식 저지).
- **대응**: 각 단계가 섬 팩의 어느 필드인지 `narrative.json`의 `prep_checklist_lgmrd`에 적었다. `islands/_template/draft.md` 질문지와 `island:build` 검증 경고에 그대로 쓸 수 있다. 섬 팩에 없는 것은 "적(encounters)" 하나뿐이다.
- **주의점**: 문서의 5e 전용 부분(주문 이름 등)은 판타지 섬에만 맞는다.

### 2.7 5방 구조 — Johnn Four (저작권, 기법만) 참고

입구와 문지기 → 퍼즐·대화 도전 → 함정·좌절 → 절정 → 보상과 반전. `story.acts`(3~5막)와 `trials`를 짤 때 참고용 틀로 질문지에 넣는다.

### 2.8 오라클·맹세 — Ironsworn / Starforged (CC BY 4.0) ★ 채택

- **오라클**: 예/아니오 질문에 확률 5단계(거의 확실 / 그럴 법함 / 반반 / 그럴 것 같지 않음 / 희박)를 정하고 d100을 굴린다. 두 자리 숫자가 같으면 반전. → **서버 도구 `ask_oracle(question, odds)`**. 섬 팩에 답이 없는 사소한 사실("이 술집에 뒷문이 있나?")을 LLM이 선원 편으로만 정하는 쏠림을 막는다.
- **맹세와 진행 트랙**: 10칸 × 4틱. 도전 등급(성가심 3칸 / 위험함 2칸 / 만만찮음 1칸 / 극한 2틱 / 서사급 1틱)에 따라 진전마다 채우고, 마지막에 채운 칸 수를 d10 두 개와 비교한다. 이루면 등급만큼 경험치(1~5). → **캠페인 맹세**(선원 각자 서사급 하나, 섬마다 진전 1틱)와 **섬 맹세**(hook에 휘말릴 때)로 섬들을 한 이야기로 묶는다.
- **주의점**: CC BY 4.0은 **SRD와 Starforged Reference Guide**에만 해당한다. 책 전문과 Sundered Isles 오라클은 비상업 조건(CC BY-NC-SA)이다. dataforged의 그림 파일도 비상업이다. 표 데이터(JSON)는 CC BY 4.0이라 런타임에 불러 쓰기 좋다.

### 2.9 상황 측면과 강요 — Fate Condensed (CC BY 3.0) 부분 채택

- **무엇을**: 장면에 붙은 짧은 사실("기름 번진 바닥")을 측면으로 등록하고, 활용하면 이점. **강요**는 캐릭터의 약점·사연을 근거로 GM이 곤란한 전개를 제안하고, 받아들이면 영감을 얻고 거절하려면 영감을 내는 거래다.
- **LLM·멀티버스에 맞는 이유**: 세계마다 다른 "여기서만 참인 사실"을 짧은 문장으로 다루기 좋다. 우리 영감(파티 공용 최대 4) 경제를 돌리는 주된 수입원이 된다.
- **주의점**: Fate의 주사위(4dF)와 사다리는 가져오지 않는다. 개념만 쓴다.

### 2.10 항해 정비 활동 — Blades(구성) + LGMRD(항해 역할) ★ 채택

섬과 섬 사이(VOYAGE)는 Blades의 정비(downtime) 구조를 쓴다. 선원마다 활동 2개(회복·수련·조달·장기 과제·기항지 유흥·잠적), 더 하려면 코인. 항해 자체는 LGMRD 황야 여행의 역할 나누기를 바다에 옮겨 항해사·망꾼·보급관이 DC 12 판정을 한다. d20 총합 → 시계 칸 변환은 `narrative.json`의 `downtime_voyage`.

---

## 3. 전투

### 3.1 SRD 5.2 전투 규칙 (CC BY 4.0) ★ 그대로 채택

판정 뼈대가 이미 5e 계열이므로 전투도 SRD 5.2를 **수치 그대로** 쓴다. `shared/data/combat.json`에 담은 것:

- **라운드와 행동**: 6초. 턴마다 이동 + 행동 1 + (특성이 있으면) 추가 행동 1, 반응은 라운드에 1. 물건 하나는 공짜로 만진다. 행동 12종(공격·질주·이탈·회피·돕기·숨기·영향 주기·이능 사용·대비·살피기·궁리·조작). 우리 기술 이름에 맞춰 "살피기(통찰·의학·감지·생존)", "궁리(신비학·학식·조사·자연·기술 공학)"로 옮겼다.
- **우선권**: 민첩 판정. 기습당하면 불리. 같은 적 무리는 한 번만 굴린다.
- **공격·피해**: d20 + 수정치 + 숙련 ≥ AC. 치명타는 피해 주사위를 두 번. 저항은 절반, 취약은 두 배(적용 순서 고정). 원거리는 근접전에서 불리.
- **엄폐**: 반 +2 / 3/4 +5 / 완전은 노릴 수 없음. AC와 민첩 내성에 모두 적용.
- **상태 이상 15종**: 실명·매혹·청각 상실·탈진(6단계, 단계마다 d20 −2)·공포·붙잡힘·행동 불능·투명·마비·석화·중독·넘어짐·구속·기절·의식 불명. 서버가 id로 저장하고 이점/불리를 자동 계산한다.
- **HP 0**: 일반 적은 즉사, 선원은 의식 불명 + 사망 내성(d20 10 이상 성공, 3성공 안정/3실패 사망, 1은 실패 2, 20은 HP 1). 남은 피해가 최대 HP 이상이면 즉사. 기절시키기와 응급 처치(의학 DC 10).
- **휴식**: 짧은 휴식 1시간(히트 다이스), 긴 휴식 8시간(전부 회복, 탈진 −1, 16시간 간격). 우리 대응: 짧은 휴식 = 섬 안 장면 전환 1회, 긴 휴식 = 섬의 밤 또는 항해.
- **무기 숙련 특성 8종**(베어 넘기기·스치기·연격·밀치기·기세 꺾기·발 묶기·넘어뜨리기·파고들기): 원형의 특성으로 열어 줄 수 있다.
- **전투 난이도**: 선원당 XP 예산(쉬움/보통/어려움, 레벨 1~12), CR별 XP, CR별 숙련 보너스. 선원 1명당 적이 2명을 넘으면 약한 적을 섞으라는 조언.
- **공포·정신 스트레스**(SRD 게임플레이 도구): 공포 지혜 내성 DC 10/15/20, 정신 피해 1d6/3d6/9d6, 장·단기 후유증. **고어 호러(flesh-abbey)와 암흑 판타지 섬에 바로 쓴다.** 섬의 `content.lines/veils`가 먼저다.

**동시 제출 라운드와의 결합 (우리 값)**: 선원은 라운드마다 {이동, 행동, 추가 행동, 대비 조건}을 한 번에 제출하고, 서버가 우선권 순서대로 처리해 GM이 한 번에 서술한다. 제출하지 않은 선원은 회피로 본다.

### 3.2 격자 없는 전투 — LGMRD (CC BY 4.0) ★ 채택

- **구역 전투**: 약 25ft 구역. 한 턴에 같은 구역이나 옆 구역으로, 질주하면 두 구역. 사거리 25ft 이상은 옆 구역까지, 50ft 이상은 두 구역 이상. 범위 효과는 크기별 "몇 명이 휘말리나"로 정한다.
- **마음의 극장**: GM이 상황을 묘사 → 선원이 의도를 말함 → GM은 그 의도를 이루도록 돕고 판정한다.
- **무리 운용**: 무리 피해를 합산해 한 마리 HP를 넘을 때마다 한 마리 제거. 무리의 공격은 1/4이 명중한 것으로 본다.
- **즉석 몬스터 수치**: AC·DC = 12 + CR/2, 공격 보너스 = 3 + CR/2, HP = 20 × CR, 피해 = 7 × CR. 난이도 다이얼 4개(HP, 적의 수, 피해, 공격 횟수).
- **LLM에 맞는 이유**: LLM은 좌표 추적에 약하다. 구역 몇 개와 "누가 어느 구역에"만 서버가 들고 있으면 된다. 섬 팩에 적 능력치가 없어도 CR 하나로 서버가 수치를 만든다.

### 3.3 기술 수준을 넘나드는 무기·방어구 (SRD 5.2 + MSRD + d20 Future) ★ 채택

- **원시·중세**: SRD 무기·방어구표 그대로. 원시 섬은 값 절반.
- **산업(화약)**: SRD의 전장식 권총 1d10, 머스킷 1d12. 탄약식 리볼버·레버액션 소총·산탄총은 MSRD 값(2d6 / 2d10 / 2d8).
- **현대**: MSRD 화기 — 권총 2d6(소구경 2d4, 매그넘 2d8), 기관단총 2d6, 돌격소총 2d8, 사냥·저격 2d10, 대물 2d12, 산탄총 2d8, 테이저(전격 1d4 + 마비 내성). **자동 사격**(10×10ft 영역, 민첩 내성 DC 15)도 MSRD에서 가져와 5e 내성으로 바꿨다.
- **미래**: d20 Future의 레이저 권총 2d8, 레이저 소총 3d8(2차 출처로 확인). 나머지는 SRD 무기를 겉모습만 바꿨다.
- **방어구**: MSRD의 방어 보너스 +b를 5e AC 약 10+b로 환산해 7단계 AC 표로 묶었다. 같은 AC 단계가 세계마다 가죽 갑옷·가죽 재킷·보호 슈트로 보인다(`shared/data/combat.json`의 `ac_tiers[].looks`).

### 3.4 사기 판정 — Cairn 2e (CC BY-SA 4.0) 개념만 채택

적은 첫 사상자가 날 때와 절반이 쓰러졌을 때 사기 판정을 하고, 실패하면 도망·항복·협상한다. 우리 환산은 지혜 내성 DC 10. LLM이 모든 전투를 전멸전으로 끌고 가는 경향을 막고, 대화와 호감도로 이어지게 한다. **글은 가져오지 않았으므로** BY-SA의 동일 조건 의무는 생기지 않는다.

### 3.5 전투 쪽 주의점

- SRD 5.2의 클래스·주문은 판타지 전제다. 우리는 원형(archetype)과 서명 능력을 쓰므로 **주문 목록은 가져오지 않는다.** 이능은 "주문 레벨 = 서비스 등급"처럼 효과 크기 기준으로만 쓴다.
- 원작대로면 선원도 죽는다. 친구끼리 하는 캠페인이라 **사망은 섬지기·호스트가 합의할 때만**, 기본은 큰 대가로 바꾸는 우리 규칙을 제안한다(`shared/data/combat.json`의 `zero_hp.odyssey_rule`).

---

## 4. 거래·상점·경제

### 4.1 공통 화폐 — SRD 5.2 금화를 기준 단위로 ★ 채택

- **1코인 = SRD 금화 1개.** 은화 = 0.1, 동화 = 0.01. 서버는 0.01코인 단위 정수로 저장하고, 화면에는 섬 화폐 이름으로 보여 준다.
- 섬별 이름 예: 월하궁 **냥·전·푼**(1냥 = 10전 = 100푼이라 그대로 맞음), 운검봉 은자·문, 더스트윈드 2달러, 비의 항구 5달러, 영원타워 8만 원, 제로 하버 100크레딧, 녹슨 방주 배급권.
- 섬을 떠날 때 남은 돈은 같은 가치로 다음 섬 화폐가 된다(우리 설정: 배가 환전해 준다). 보석·예술품·교역품은 어디서나 **제값**에 팔리므로(SRD) 섬을 넘나드는 안전 자산이 된다.

### 4.2 생활비·숙박·식사·서비스 — SRD 5.2 ★ 채택

- **생활 수준 7단계**(비참 0 / 누추 0.1 / 궁핍 0.2 / 보통 1 / 편안 2 / 부유 4 / 귀족 10코인/일). 이 단계는 어느 시대에나 통하는 가장 좋은 공통 척도다.
- 여관 숙박, 식사, 술, 고용인(숙련 2코인/일, 비숙련 0.2), 전령, 뱃삯, 선박 수리.
- **"주문 시전 서비스" 표를 세계 중립 "전문 서비스 등급"으로** 바꿨다(0~9등급, 30~100,000코인, 마을/소도시/도시에서만 가능한 등급 구분). 판타지에선 주문, 현대에선 수술·해킹·법률, 미래에선 신체 개조.

### 4.3 산업·현대 물가 — d20 Modern SRD (OGL 1.0a) ★ 채택 (환산식은 우리 값)

- MSRD는 돈 대신 **구매 DC**로 물가를 적는다. SRD 숙박·식사 가격과 MSRD 숙박·식사 DC를 맞춰 **환산식 `코인 = 2^((DC − 9) / 2)`**를 정했다(DC 9 = 1코인, DC +2마다 2배). 싼 모텔(DC 7) = 0.5코인 = SRD 보통 여관, 고급 호텔(DC 11) = 2코인 = SRD 부유한 여관으로 맞는다.
- 가져온 표: 현대 화기·방어구, 생활(주거·오락·식사·교통·숙박), **제한 물품 4단계**(허가 필요 / 제한 / 군용 / 불법 — 허가 비용, 암시장 가격, 걸리는 날), 암시장 찾기 DC, **정보 수집 4단계**(소문 / 특정 질문 / 제한 정보 / 기밀 — 판정 DC와 비용), **뇌물**(대상별 비용, 받아들이면 사회 판정 +2, 모욕으로 받아들이면 태도 한 단계 하락), 장물 판매가.
- **부(Wealth) 체계 자체는 채택하지 않는다.** 섬마다 체계가 달라지면 서버 장부가 둘이 된다. 수치만 코인으로 옮긴다.

### 4.4 기술 수준 간 가격 — d20 Future Progress Level ★ 채택

- 우리 `technology` 5단계를 PL에 대응: 원시 PL0~1, 중세 PL2, 산업 PL3~4, 현대 PL5, 미래 PL6~8.
- 섬보다 **낮은** 기술 물건은 한 단계마다 값 ×0.5(PL당 DC −2와 같음), **한 단계 높은** 물건은 ×5(다음 PL은 DC +5)로 도시·암시장에서만, **두 단계 이상 높은** 물건은 살 수 없고 유물로만 나온다(이 마지막 줄은 우리 값).
- 산 물건이 실제로 작동하는지는 섬의 `crossover` 규칙이 정한다. 가격 규칙과 작동 규칙이 따로 있어 조합이 명확하다.

### 4.5 판매·흥정

- **판매가**(SRD): 장비 50%, 보석·예술품·교역품 100%, 마법 물건은 희귀도 값(소모품은 절반). 장물은 암시장에서만, 추가로 약 1/3(MSRD DC −3).
- **흥정 (우리 값, SRD 영향 주기 위에)**: 상인이 "망설이는" 요청일 때만 판정한다(기꺼우면 판정 없이 수락, 불쾌하면 판정 없이 거절 — SRD). DC는 15와 상인 지능 중 큰 값. 설득·기만·위협·공연 중 방법에 맞게, 먼저 통찰(DC 13)로 최저가를 읽으면 이점. 호감도 단계의 이점/불리는 `affinity.ts`의 `socialAdvantage`를 그대로. 결과는 대성공 25% 할인 ~ 대실패 거래 거부, 같은 방식 재시도는 24시간 뒤(SRD). 판매가 상한 65%.
- **호감도 가격 배율 (우리 값)**: 불신 ×1.25, 중립 ×1, 호의 ×0.9, 신뢰 ×0.8, 유대 ×0.75, 적대는 팔지 않음. `affinity.ts`의 "불신: 값을 올린다" 기본 행동을 숫자로 만든 것이다.

### 4.6 상점과 재고

- **정착지 규모**(SRD의 "흔한 마법 물건은 소도시, 고급·희귀는 도시, 그 이상은 경이로운 곳에서만" + 서비스 등급별 가능 지역) → 외딴 거점 / 마을 / 소도시 / 도시 / 경이로운 곳 5단계. 금액 상한은 우리 값.
- **상점 유형 8종**: 잡화, 무기·방어구, 치료소, 기이한 물건점, 장물아비·암시장, 여관·주점, 탈것·운송, 정보상. 유형마다 기술 수준별 겉모습(대장간 ↔ 총포상 ↔ 무장 인쇄소).
- 재고는 섬 방문 때 서버가 "상점 유형 × 정착지 규모"로 생성하고 고정한다(새로고침 금지, 우리 값).
- **가게에 없는 물건 조달**은 Blades의 자산 조달(Acquire Asset)을 d20으로 바꿔 쓴다. 결과가 좋을수록 품질이 오르고, 코인으로 한 단계 올릴 수 있으며, 제한·불법품이면 수배도 +2.

### 4.7 제작 — SRD 5.2 ★ 채택

일반 물건: 재료 = 정가 50%, 기간 = 정가 ÷ 10일. 치료 물약: 재료 25, 1일. 마법 물건: 희귀도별 5~250일, 50~100,000코인(소모품 절반). 섬 방문은 며칠 단위라 제작은 항해 중 장기 과제 시계로 처리한다.

### 4.8 경제 쪽 주의점

- SRD 물가는 판타지 기준이라 화기가 비싸다(권총 250). 산업 섬에서 현지 권총은 MSRD 값(약 8코인)을 쓴다. 두 값을 섞지 말고 "섬의 기술 수준에서 흔한가"로 고른다.
- MSRD의 미국식 가격감을 한국 섬(영원타워)에 쓸 때는 총기를 한 단계 더 제한으로 보자(우리 값).
- 흥정은 한 섬에서 반복되면 지루하다. 같은 상인과는 방문당 한 번만 흥정 판정하도록 서버가 막는 편이 좋다.

---

## 5. 보상·성장

| 항목 | 가져올 규칙 | 출처 | 우리 쪽 대응 |
|---|---|---|---|
| 레벨업 방식 | **이정표 레벨업**(이야기의 중요한 지점에서 레벨 부여) | LGMRD (CC BY 4.0) | 섬의 `exit`를 확정하면 +1레벨. 섬 10개 × 1레벨 → 1레벨로 시작해 11레벨에서 피날레, `MAX_LEVEL` 12와 맞음 |
| 경험치(대안) | 캐릭터 발전 XP표, CR별 XP | SRD 5.2 | 전투가 많은 섬을 원하면 서버가 CR XP를 자동 합산 (선택) |
| 맹세 경험치 | 등급별 1~5 XP | Ironsworn (CC BY 4.0) | 캠페인 맹세·섬 맹세 달성 시. 레벨업 대신 **영감 +1 / 축복 강화**로 환산 (우리 값) |
| 영웅적 영감 | 하나만 가질 수 있고, 주사위 하나를 다시 굴림 | SRD 5.2 | 우리는 파티 공용 최대 4(`MAX_INSPIRATION`). 수입원: 배경 영감 조건, 강요 수락(Fate), 절박 판정(Blades) |
| 돈 보상 | 레벨당 보물 꾸러미 4개: 1~4레벨 3d6×10, 5~10레벨 3d8×100, 11~16레벨 2d6×1,000 | LGMRD (CC BY 4.0) | 섬 1개 ≈ 1레벨이므로 섬마다 꾸러미 4개를 비밀·시련·결말에 나눠 둠 |
| 마법·이상 물건 속도 | 시작 레벨별 지급량: 2~4레벨 흔함 1, 5~10레벨 흔함 1·고급 1, 11~16레벨 흔함 2·고급 3·희귀 1 | SRD 5.2 | 섬 결말의 `treasures`는 "유물(값 없음)", 그 밖의 보상은 이 속도를 넘지 않게 섬 검증기에서 경고 |
| 희귀도 가치 | 흔함 100 / 고급 400 / 희귀 4,000 / 매우 희귀 40,000 / 전설 200,000 | SRD 5.2 | `Kind`(평범·기술·마법·이상) 모두 같은 희귀도 값 |

---

## 6. NPC·관계 — 우리 호감도와 비교

우리 체계(`shared/affinity.ts`): NPC마다 선원·다른 NPC에 대해 −100~100, 6단계(적대 / 불신 / 중립 / 호의 / 신뢰 / 유대), 단계별 행동, 사회 판정 이점/불리, 목격된 일은 30%만큼 소문으로 번짐, 기억 5개.

| 자료 | 관계 표현 | 우리보다 나은 점 | 우리가 이미 나은 점 | 도입 제안 |
|---|---|---|---|---|
| **SRD 5.2 태도 + 영향 주기** (CC BY 4.0) | 우호 / 무관심 / 적대 3단계. 요청은 기꺼움 / 망설임 / 불쾌 중 하나로 GM이 먼저 판정하고, **망설임일 때만** DC max(15, 지능)로 판정. 실패하면 같은 방식은 24시간 뒤 | "판정할 필요가 있는가"를 먼저 거르는 관문. 같은 부탁을 계속 조르는 것을 막는 쿨다운 | 수치가 세밀하고, 소문·기억이 있다 | ★ **관문과 쿨다운을 채택.** 우호(호의) 단계부터 이점을 주는 SRD와 달리 우리는 신뢰부터 이점이다 — 우리 값을 유지하되 "호의 단계에서는 기꺼움 판정이 쉽게 나온다"로 보완 |
| **Blades 세력 지위** (CC BY 3.0) | 세력마다 −3(전쟁) ~ +3(동맹) | 사람이 아닌 **조직**(문파, 기업, 갱)과의 관계 | NPC 개인 단위 관계와 NPC 간 소문 | 섬에 세력이 있으면 세력 = 대표 NPC들의 평균 호감도로 계산해 보여 주기 (우리 값, 선택) |
| **Ironsworn 유대·연결** (CC BY 4.0) | 관계 자체가 진행 트랙. 유대를 맺으려면 여러 번의 진전이 쌓여야 함 | 한 장면에서 호감도가 확 뛰는 것을 막는다 | 음수(적대)도 다룬다 | ★ **장면당 변화량 상한 ±20**(배신·목숨을 구함 같은 사건만 예외), **유대 단계 진입은 서로 다른 장면 3개 이상의 기억**이 있을 때만 (우리 값, Ironsworn 발상) |
| **Fate 관계 측면** (CC BY 3.0) | "○○에게 빚이 있다" 같은 문장 | 관계가 강요·영감 경제로 이어진다 | 수치 판정 | 기억(memories) 한 줄을 강요 근거로 쓸 수 있게 GM 규칙에 명시 |
| **Dungeon World 유대** (CC BY 3.0) | 선원끼리의 관계 문장, 풀리면 경험치 | 파티 내부 관계 | 비밀 행동·배신 시스템 | 선원 간 관계는 이미 비밀 행동이 담당하므로 도입하지 않음 |
| **MSRD 평판** (OGL) | 유명도 보너스로 알아보는지 판정 | 섬을 넘나드는 "명성·악명" | — | 후보: 항해일지에 악명 값을 두고 다음 섬 NPC의 초기 호감도에 ±10 (선택) |

**변화량 가이드 (우리 값, 판정과 일관되게)**: 작은 호의·무례 ±5, 부탁을 들어줌·약속을 어김 ±10, 목숨을 구함·배신 ±20~40, 뇌물은 0(거래일 뿐, 모욕이면 −15). 영향 주기 대성공 +5, 대실패 −10.

---

## 7. 섬 소재로 쓸 수 있는 설정 자료

| 섬 (장르) | 쓸 만한 오픈 자료 | 쓰는 법 |
|---|---|---|
| 모든 섬 | **SRD 5.2 몬스터·NPC 능력치**(CC BY 4.0), **LGMRD 무작위 표**(NPC·마을 사건·기념물·함정·물건, CC BY 4.0) | NPC 블록 22종은 `shared/data/combat.json`의 `npc_statblocks_reskin`에 세계별 이름을 붙여 둠 (경비병 = 보안요원 = 포졸 = 경비 드론) |
| 성육신 수도원 (고어 호러) | SRD 언데드·괴물(좀비, 구울, 와이트, 레이스, 망령, 미라, 살점 골렘, 쥐 떼, 헛소리 입(gibbering mouther)), SRD 공포·정신 스트레스, **Ironsworn Delve 장소 주제·영역 오라클**(CC BY 4.0) | 공포 DC 10/15/20을 위기 시계 칸과 연동. `lines/veils`가 항상 먼저 |
| 이름을 태우는 등대섬 (암흑 판타지) | SRD 전부, 마녀(green/sea/night hag), 윌오위스프, 그림자 | 3단서 고리 구조와 잘 맞음 |
| 봉봉 공화국 (동화) | SRD 요정·동물(드라이어드, 스프라이트, 사티로스, 유니콘, 페가수스, 트렌트, 각성한 나무, 늑대인간), **그림 형제 동화(퍼블릭 도메인)** | 원작 동화의 줄거리·인물은 자유롭게 변형 가능. 현대 번역본·삽화는 저작권 확인 |
| 운검봉 (무협) | SRD 인간형 블록(검투사 = 무림 고수, 자객, 대마법사 = 장문인), 오니·라크샤사를 요괴로, **수호전·서유기 등 고전(퍼블릭 도메인)** | 김용 등 현대 무협은 저작권 있음 — 인물·초식 이름을 쓰지 말 것 |
| 월하궁 (조선풍 궁중 로맨스) | SRD 귀족·첩자·경비대장(포도대장)·유령(원귀)·도플갱어(둔갑), **조선의 제도·역사적 사실(저작권 대상 아님)**, 전래 설화(원전은 퍼블릭 도메인) | 현대 한국어 번역본·드라마 설정은 저작권 있음. 사실과 원전만 쓴다 |
| 더스트윈드 협곡 (서부) | SRD 산적·두목(보안관)·척후·독사·대형 전갈·독수리·말, **MSRD 리볼버·소총·산탄총** | 수배도(heat) 선택 규칙과 잘 맞음 |
| 비의 항구 (1940년대 누아르) | **GUMSHOE 핵심 단서**, **Blades 세력·수배도·자산 조달**, SRD 첩자·깡패·조직 보스·암살자 | 탐문은 MSRD 정보 수집 4단계로 값 매김. Blades의 도스크볼 설정은 쓰지 말 것 |
| 제로 하버 (사이버펑크) | **Starforged 오라클**(정착지·세력·캐릭터 이름, CC BY 4.0), MSRD 제한 물품·암시장, SRD 생명 없는 갑옷·방패 수호자(로봇 재활용) | 의체·해킹은 "전문 서비스 등급"으로 값 매김 |
| 녹슨 방주 (포스트 아포칼립스 우주) | **Starforged 오라클**(행성·함선·폐선·생물), SRD 녹 괴물(rust monster), 슬라임류(나노 오물), 위상 거미 | 배급권 화폐, 탄약·산소를 자원 소모(GM 수)로 |
| 영원타워 (현대 오피스) | SRD 평민·귀족(임원)·첩자·흉내쟁이(사무기기), MSRD 생활·교통 가격 | 부조리 코미디는 강요(Fate)와 잘 맞음 |

---

## 8. 추천 도입안

### 8.1 도입 표

| # | 무엇을 | 어디서 | 라이선스 | 우리 시스템·도구 대응 | 우선순위 |
|---|---|---|---|---|---|
| 1 | 전투 전체(행동·공격·피해·엄폐·상태 이상·사망 내성·휴식) | SRD 5.2 | CC BY 4.0 | `shared/data/combat.json` · 새 도구 `start_combat`(서버가 우선권), `attack`, `apply_damage`, `apply_condition`; 사망 내성은 서버 자동 | M1 필수 |
| 2 | 구역 전투·마음의 극장·무리·즉석 몬스터 수치·난이도 다이얼 | LGMRD | CC BY 4.0 | `shared/data/combat.json`의 `zones_lgmrd`, `improvised_monster_lgmrd` · 방 상태에 `zones[]`, 적은 CR만 적어도 서버가 수치 생성 | M1 필수 |
| 3 | 전투 난이도 XP 예산, CR별 XP | SRD 5.2 | CC BY 4.0 | 섬 검증기가 `encounters`(추가 제안 필드) 난이도를 계산해 경고 | M2 |
| 4 | 진행 시계(크기·종류·효과별 칸) | Blades SRD | CC BY 3.0 | `advance_clock`을 `create_clock` / `tick_clock(clock_id, ticks, reason)`으로 일반화. `world.clock`은 id `crisis` | M1 필수 |
| 5 | 위치·결과 종류·악마의 거래 | Blades SRD | CC BY 3.0 | `roll`에 `position` 인자, 결과에 `effect`와 제안 칸 수 반환 (margin 기반, 우리 변환) | M1 |
| 6 | GM 의제·원칙·수(soft/hard)·전선 | Dungeon World SRD | CC BY 3.0 | GM system 프롬프트(캐시 ① 구간)에 `narrative.json`의 id·한 줄 요약만 넣음 | M1 필수 |
| 7 | 3단서 규칙·노드 구조 | The Alexandrian | 저작권(기법만) | 섬 검증기 경고: 힌트 3개 미만, 단서 경로 2곳 미만 | M0 보강 |
| 8 | 핵심 단서는 판정 없이 | GUMSHOE SRD | CC BY 3.0 | GM 규칙 한 줄 + `secrets[]`에 `core: true` 필드 제안 | M1 |
| 9 | 8단계 준비·강한 시작·퀘스트 틀 | LGMRD | CC BY 4.0 | `draft.md` 질문지와 `island:build` 검토 항목 | M0 보강 |
| 10 | 오라클(확률 5단계, d100, 반전) | Ironsworn / Starforged | CC BY 4.0 | 새 도구 `ask_oracle(question, odds)` | M1 |
| 11 | 맹세·진행 트랙·등급 | Ironsworn | CC BY 4.0 | 캠페인 맹세(서사급), 섬 맹세 · 새 도구 `mark_vow` | M4 |
| 12 | 상황 측면·강요 | Fate Condensed | CC BY 3.0 | 새 도구 `set_scene_aspect`, `compel(player_id, reason)` → 수락 시 영감 +1 | M2 |
| 13 | 공통 코인·생활비·숙박·서비스·희귀도·제작·판매가 | SRD 5.2 | CC BY 4.0 | `economy.json` · 캐릭터에 `coin`(정수, 0.01 단위) · 새 도구 `buy`, `sell`, `pay` | M2 |
| 14 | 현대 물가·제한 물품·암시장·정보·뇌물 | d20 Modern SRD | OGL 1.0a | `economy.json`(구매 DC → 코인 환산은 우리 값) · 새 도구 `gather_info(level)` | M2 |
| 15 | 기술 수준 간 가격 | d20 Future (PL) | OGL 1.0a (원문 재확인 필요) | 가격 계산 시 섬 `technology`와 물건 tech 차이로 배율 | M2 |
| 16 | 흥정 | SRD 영향 주기 + 우리 값 | CC BY 4.0 + ours | 새 도구 `haggle(npc_id, skill)` — 서버가 판정·배율·호감도 변화까지 계산 | M2 |
| 17 | 자산 조달·정비 활동 | Blades SRD | CC BY 3.0 | VOYAGE 단계 UI · `narrative.json`의 `downtime_voyage` | M4 |
| 18 | 항해 역할(항해사·망꾼·보급관) | LGMRD | CC BY 4.0 | VOYAGE 항해 사건 판정 | M4 |
| 19 | 이정표 레벨업·보물 꾸러미 | LGMRD | CC BY 4.0 | `end_island` 때 +1레벨, 섬 검증기가 보상량 경고 | M4 |
| 20 | 영향 주기 관문(기꺼움/망설임/불쾌)과 24시간 쿨다운 | SRD 5.2 | CC BY 4.0 | `set_attitude`를 호감도 도구로 바꿀 때 `influence(npc_id, request, skill)` 추가 | M2 |
| 21 | 사기 판정 | Cairn 2e | CC BY-SA 4.0 (개념만) | 전투 중 서버가 첫 사상자·절반 시점에 자동 판정 | M2 |
| 22 | 공포·정신 스트레스 | SRD 5.2 | CC BY 4.0 | 호러 섬용. `apply_condition(frightened)` + 정신 피해 | M2 |

### 8.2 GM 프롬프트에 넣는 방법

- `narrative.json`, `shared/data/combat.json`의 **id와 한 줄 요약만** 고정 system 프롬프트(캐시 ①)에 넣는다. 수치 계산은 서버가 하므로 LLM에게 표 전체를 줄 필요가 없다.
- 섬마다 바뀌는 것(화폐 이름, 상점 목록, 섬 시계)은 섬 팩 구간(캐시 ②)에 넣는다.
- GM 규칙 초안에 추가할 줄 (예시):
  - "판정 전에 position(안정·위험·절박)을 정하고 roll에 넘긴다. 실패도 반드시 무언가를 바꾼다."
  - "다음 장면으로 가는 핵심 단서는 판정 없이 준다. 판정은 추가 정보와 대가를 가른다."
  - "섬 팩에 답이 없는 예/아니오 사실은 ask_oracle로 정한다. 선원에게 유리한 쪽으로 임의로 정하지 않는다."
  - "선원들이 너를 쳐다보면 soft 수, 판정에 실패하면 hard 수를 둔다. 수의 이름은 말하지 않는다."
  - "가격·할인·잔액은 서버 도구 결과만 말한다. 직접 계산하지 않는다."

---

## 9. 라이선스 주의사항

1. **SRD 5.2**: 정해진 출처 문장 외에 Wizards를 따로 언급하지 말라고 요구한다. "5E 호환(compatible with fifth edition)" 표기는 허용된다. `rules.ts` 주석의 "BG3/D&D" 언급은 내부 설명으로는 괜찮지만, 게임 화면·홍보에서 D&D·BG3 상표를 쓰거나 보증을 암시하면 안 된다. BG3의 글·데이터는 SRD가 아니므로 가져오지 않는다.
2. **CC BY 3.0 / 4.0 공통**: 번역·요약·수치 조정도 2차적 저작물이므로 **출처 표기와 "변경했음" 표시**가 필요하다(아래 표기 문장 뒤에 변경 사항 한 줄을 붙인다).
3. **Blades SRD**: 도스크볼(둠월) 설정, NPC, 그림, 지도는 제외다. 제품 제목에 "Blades in the Dark"를 쓸 수 없다. "Forged in the Dark" 로고는 표기 조건을 지키면 쓸 수 있다.
4. **Fate**: 공식 로고는 별도 허락이 필요하고, Evil Hat의 명예를 해치는 용도로 쓸 수 없다.
5. **Ironsworn**: 상업적 사용이 가능한 CC BY 4.0은 **SRD·Delve·Starforged Reference Guide(와 Sundered Isles의 이동 텍스트)**뿐이다. 책 전문, Sundered Isles 오라클, dataforged 래스터 그림은 비상업 조건이다. 친구끼리의 비상업 프로젝트라도 나중을 위해 BY 4.0 범위 안에서만 쓰자.
6. **Dungeon World**: GM 수 개념의 뿌리인 Apocalypse World 본문은 오픈 라이선스가 아니다. 출처는 DW SRD로 한정한다.
7. **GUMSHOE**: 상표는 쓸 수 있으나 제휴·보증을 암시할 수 없고, 로고와 개별 게임 이름(Esoterrorists, Trail of Cthulhu 등)은 쓸 수 없다.
8. **d20 Modern / d20 Future (OGL 1.0a)**: OGL 콘텐츠를 배포하려면 **OGL 1.0a 전문과 15조 저작권 고지를 함께 배포**해야 하고, OGL은 CC와 조건이 다르다. 우리는 글을 옮기지 않고 수치(게임 규칙 사실)만 우리 구조로 재작성했지만, 안전하게 가려면 크레딧에 OGL 전문을 넣자. d20 Future 값(PL 가격 규칙, 레이저 피해)은 2차 출처로만 확인했으므로 MSRD 2004판 원문으로 재확인해야 한다. 2023년 논란 뒤 WotC는 OGL 1.0a를 철회하지 않겠다고 밝혔지만, 새로 쓰는 부분은 가능하면 CC BY 자료(SRD 5.2)를 우선한다.
9. **CC BY-SA (Cairn, One Page Solo Engine, Wikipedia)**: 글을 가져와 고치면 결과물도 BY-SA로 공개해야 한다. 이번에는 **개념만** 썼으므로 이 의무가 없다. 앞으로 표나 문장을 옮길 때는 별도 파일로 분리하고 BY-SA로 표시한다.
10. **저작권 블로그·책 (The Alexandrian, 5 Room Dungeon, Sly Flourish 블로그 글 등)**: 기법은 자유롭게 쓰되, 문장·예시를 옮기지 않는다. Sly Flourish의 글 중 **LGMRD에 들어 있는 부분만** CC BY 4.0이다.
11. **퍼블릭 도메인 원전**: 그림 형제, 수호전·서유기, 조선 설화 원전, 러브크래프트 초기작 등은 자유지만, **현대 번역본·각색·삽화는 별도 저작권**이다. 작가 사후 보호 기간은 나라마다 달라서 20세기 작가(누아르 소설 등)는 개별 확인이 필요하다.
12. **참고**: `docs/DESIGN.md`는 아직 2d6 판정과 태도 −3~+3을 설명하고 있어 `rules.ts`·`affinity.ts`와 다르다. 이 조사 결과를 반영할 때 같이 고쳐야 한다(이번 작업에서는 수정하지 않음).

---

## 10. 출처 표기 (크레딧에 넣을 문장)

각 라이선스가 요구하는 문장이다. 게임 크레딧 화면과 저장소 `CREDITS`에 넣고, 뒤에 **변경 사항**을 붙인다.

> **SRD 5.2** — This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

> **Blades in the Dark** — This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).

> **Fate Condensed** — This work is based on Fate Condensed (found at https://www.faterpg.com/), a product of Evil Hat Productions, LLC, developed, authored, and edited by PK Sullivan, Lara Turner, Fred Hicks, Richard Bellingham, Robert Hanz, and Sophie Lagacé, and licensed for our use under the Creative Commons Attribution 3.0 Unported license.

> **Ironsworn / Starforged** — This work is based on Ironsworn and Ironsworn: Starforged, created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).

> **GUMSHOE** — This work is based on the GUMSHOE SRD (found at http://www.pelgranepress.com/?p=12466), a product of Pelgrane Press, developed, written, and edited by Robin D. Laws with additional material by Kenneth Hite, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).

> **Lazy GM's Resource Document** — This work includes material taken from the Lazy GM's Resource Document by Michael E. Shea of SlyFlourish.com, available under a Creative Commons Attribution 4.0 International License.

> **Dungeon World** — Dungeon World by Sage LaTorra and Adam Koebel is licensed under a Creative Commons Attribution 3.0 Unported License (http://creativecommons.org/licenses/by/3.0/). This work adapts material from the Dungeon World SRD.

> **d20 Modern SRD (OGL 1.0a, 15조 고지)** — Open Game License v 1.0a Copyright 2000, Wizards of the Coast, Inc. Modern System Reference Document Copyright 2002, Wizards of the Coast, Inc.; Authors Bill Slavicsek, Jeff Grubb, Rich Redman, Charles Ryan, based on material by Jonathan Tweet, Monte Cook, Skip Williams, Richard Baker, Peter Adkison, Bruce R. Cordell, John Tynes, Andy Collins, and JD Wiker. (d20 Future 부분을 쓰면 MSRD 2004판의 15조 고지로 바꾼다. OGL 1.0a 전문을 함께 배포한다.)

> **Cairn 2e (개념 참고)** — Cairn by Yochai Gal, licensed under CC BY-SA 4.0 (https://cairnrpg.com/). 이번에는 글을 가져오지 않았지만 참고 출처로 적는다.

> **변경 사항** — 위 자료의 규칙을 한국어로 요약·재구성하고, 여러 세계(기술 수준)에서 쓰도록 이름과 일부 수치를 조정했다. `source: "ours"`로 표시한 값은 원문에 없는 The Odyssey의 설계값이다.
