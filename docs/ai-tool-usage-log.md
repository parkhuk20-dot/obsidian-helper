# AI 코딩 도구 사용 과정 — 정리의 숲 (obsidian-helper)

이 서비스는 **Claude Code**(AI 코딩 도구, Anthropic)와의 대화로 기획부터 배포까지 진행했습니다.
아래는 실제 커밋 이력과 작업 세션을 바탕으로 정리한 개발 과정입니다.

## 1. 초기 구현 (2026-07-13)

서비스의 뼈대(홈/노트 작성/그래프 탐색/AI 도구/가이드 5개 페이지, 다크·라이트 테마, AI 공급자 선택 UI, 인터랙티브 그래프)를 만든 단계입니다.

| 시각 | 커밋 |
| --- | --- |
| 14:15 | `feat: add Obsidian AI helper web service` — 최초 서비스 골격 |
| 14:21 | `feat: split service into pages and add UX bonuses` — 페이지 분리 |
| 14:23 | `fix: refresh theme stylesheet on update` |
| 14:33 | `feat: add selectable AI providers and models` |
| 14:40 | `feat: add graph demo and refine light theme` |
| 14:42 | `feat: add 100-note clustered graph demo` |
| 14:50 | `feat: split notes and add interactive graph controls` |
| 18:21 | `feat: auto-link notes by AI keywords, rebuild graph as Obsidian-style force layout` |

## 2. 보너스 과제 구현 (2026-07-16 ~ 07-19)

과제 안내문의 두 보너스 카테고리(①운영 자동화·데이터 저장 고도화, ②UX·측정 고도화)를 요구사항에 맞춰 무엇을 구현했는지 먼저 점검한 뒤, 아래를 추가했습니다.

- **운영 자동화**: 노트 저장 시 Notion 데이터베이스 기록 + Discord 웹훅 알림(`api/sync.py`). 실패해도 노트 저장 자체는 항상 성공하도록 설계.
- **UX·측정 고도화**: 다크/라이트 테마, 마이크로 인터랙션(hover·로딩·복사 피드백), 그리고 단순 집계를 넘어 **퍼널 전환율 + 기준 시점 대비 변화**를 보여주는 "개선 효과 확인" 패널.
- 이후 사용자가 헤더 ⚙️에서 Notion/Discord 자격증명을 직접 입력할 수 있는 설정 모달을 추가(서버 환경변수 없이도 배포와 무관하게 바로 쓸 수 있도록).
- Discord 웹훅이 403으로 차단되는 문제를 발견 → 원인은 Python `urllib`의 기본 User-Agent를 Discord의 Cloudflare가 봇으로 간주해 차단하는 것이었고, 명시적 User-Agent 헤더를 추가해 해결.

## 3. 그래프 UX 반복 개선 (2026-07-16 ~ 07-21)

사용자가 실제 화면을 보며 짧은 주기로 피드백을 주고, 그때마다 원인을 찾아 고치는 방식으로 진행했습니다. 대표적인 예:

- **"그래프가 빈 화면으로 보인다"** → 원인 진단: 미리보기 패널이 백그라운드 상태일 때 `requestAnimationFrame`이 브라우저에 의해 완전히 정지되는 걸 발견 → 초기 렌더는 rAF 없이 동기적으로 물리 시뮬레이션을 미리 수렴시키는 `warmStart()`를 도입해 해결.
- **"마우스를 올리면 제목이 계속 보인다(원래는 호버 시에만 보여야 함)"** → 사용자가 원래 스펙과 다르다고 직접 지적 → `draw()`에서 호버/이웃 노드에만 라벨을 그리도록 되돌림.
- **"옆에 칸이 있는데도 노드가 잘린다"** → CSS Grid가 노트 상세 패널용 공간을 항상 예약해두고 있어서 실제로는 그래프가 카드 전체 폭을 못 쓰고 있었던 것 → 상세 패널이 열렸을 때만 2단 레이아웃이 되도록 `:has()` 선택자로 변경.
- **키워드가 너무 제각각이라 같은 주제 노트끼리도 안 이어진다** → AI 키워드 추출 프롬프트를 "1번째는 반드시 분야 카테고리, 기존 카테고리 우선 재사용"으로 재설계 + 예전에 저장된 노트를 새 기준으로 다시 정리하는 기능을 임시로 추가했다가, 이후 사용자 요청으로 UI 단순화 차원에서 제거.
- **검색 버튼이 노트 상세 패널이 열리면 그 안으로 밀려 들어간다** → `.interactive-graph` 카드 전체 기준으로 우측 상단에 고정해뒀던 게 원인 → 항상 그래프 캔버스 영역 기준 좌측 상단에 고정되도록 수정.
- **CSS 명시도 버그**: 편집 폼에 준 `display: flex`가 `[hidden]` 속성의 기본 `display: none`보다 우선순위가 높아, 노트를 선택하기만 해도 조회 화면과 편집 폼이 동시에 겹쳐 보이는 버그를 발견 → `#graph-detail-edit-form[hidden] { display: none; }`으로 명시해 해결.
- **헤더 아이콘이 화면이 넓어지면 중앙으로 밀린다** → `justify-content: space-between`으로 3개 요소를 배치하다 보니 가운데 요소가 폭에 비례해 떠밀리는 구조적 문제 → `margin-left: auto` 방식으로 재구성.

## 4. Vercel 배포 및 트러블슈팅 (2026-07-21)

가장 까다로웠던 단계입니다. 배포 전에는 로컬 커스텀 서버로만 검증해왔는데, 실제 Vercel에 배포하며 로컬에서는 안 보이던 문제가 2개 발견됐습니다.

1. **빌드 자체가 실패**: `"No python entrypoint found in default locations"`. 원인 진단: Vercel 프로젝트의 Framework Preset이 "Python"(단일 앱 진입점을 기대하는 프리셋)으로 자동 감지되어 있었음 → `vercel project update --framework other`로 "Other"로 변경해 해결.
2. **AI 기능이 배포 환경에서만 500 에러**: 로컬에서는 되던 `api/keywords.py` 등이 실제 배포에서 `ModuleNotFoundError: No module named 'ai_client'`로 실패. `vercel logs`로 실제 함수 로그를 받아 원인 확인 → Vercel의 Python 빌더가 `api/` 안의 공용 형제 파일(`ai_client.py`)을 함수마다 항상 함께 번들링해주지는 않는다는 걸 실측으로 확인 → 공용 코드를 4개 엔드포인트 파일에 각각 인라인으로 넣어 파일 간 의존성을 제거해 해결.

배포 후 실제 URL에서 노트 저장 → AI 키워드 추출 → Notion 저장·Discord 알림까지 실제 자격증명으로 `sent` 응답을 받는 것까지 확인했고, 모바일 뷰포트(375px)에서도 레이아웃이 깨지지 않는 것을 확인했습니다.

## 정리

AI 코딩 도구가 코드를 생성해줬지만, 매 단계마다:
- 실제로 화면을 띄워 동작을 확인하고,
- 에러 메시지·서버 로그를 직접 근거로 원인을 진단하고,
- (배포 환경처럼) 로컬과 다르게 동작하는 경우를 실측으로 구분해가며

수정 방향을 판단하는 과정을 거쳤습니다. 특히 4번 배포 트러블슈팅 단계는 "AI가 짜준 코드가 로컬에서는 되는데 왜 배포하면 안 되는가"를 실제 로그로 근거를 찾아 해결한 대표적인 사례입니다.
