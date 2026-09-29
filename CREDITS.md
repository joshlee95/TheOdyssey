# CREDITS

The Odyssey는 아래 공개 자료의 규칙·기법·코드를 가져와 한국어로 재구성했습니다. 규칙 문장은 옮기지 않고 우리 말로 새로 썼으며, 수치는 `shared/data/*.json`에 출처와 함께 담았습니다(`source: "ours"`는 원문에 없는 우리 설계값).

## 글쓰기 스킬 (vendor/, 원본 그대로 포함 — 각 폴더의 LICENSE 참조)

| 폴더 | 원본 | 라이선스 | 가져온 것 |
|---|---|---|---|
| `vendor/creative-writing-skills` | https://github.com/haowjy/creative-writing-skills (0d5bf7f) | Apache-2.0 | AI 글쓰기 실패 유형(감정 이름 붙이기, 긴장 조기 해소, 목소리 평준화 등), 심리적 거리·리듬·감각 원칙, 장면 구성 |
| `vendor/fiction` | https://github.com/howells/fiction (2e7d4e1) | MIT (README 표기) | 작명 전략, 인물·대사·비평 에이전트 참고 |
| `vendor/im-not-ai` | https://github.com/epoko77-ai/im-not-ai (92b2936) | MIT | 한국어 AI 티 분류(번역투·AI 관용구·연결어미 쉼표·줄표 등)와 처방 |
| `vendor/koreanizer` | https://github.com/sangeuiseo/koreanizer (a626978) | MIT | 소설 모드 원칙(번역투·챗봇 잔여만 걷고 목소리는 보존), 35개 패턴 |
| `vendor/yoonmoon` | https://github.com/amondnet/yoonmoon (c888531) | MIT | 한국어 윤문 분류 참고 |
| `vendor/humanize-korean` | https://github.com/nathankim0/humanize-korean (b51aa59) | MIT | 한국어 윤문 원칙 참고 |

이 스킬들은 `.claude/skills/`에 연결되어 있어 Claude Code에서 섬 작성·윤문에 바로 쓸 수 있습니다. 런타임에는 `docs/style/gm-style-prompt.md`(GM 문체 지침)와 `docs/style/ai-tells-ko.json`(AI 티 검사 목록)으로 녹여 썼습니다.

## TRPG 규칙

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

자세한 조사 내용과 라이선스 주의사항은 [docs/research/trpg-systems.md](docs/research/trpg-systems.md).

> ⚠️ d20 Modern SRD(OGL 1.0a) 수치를 쓰므로, 외부에 배포할 때는 OGL 1.0a 전문을 함께 넣어야 합니다(아직 미포함 — 친구끼리 비공개로 쓰는 동안은 영향 없음).
