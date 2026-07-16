# 🌲 정리의 숲 (가칭)

흩어진 메모를 적으면 AI가 아이디어 사이의 연결을 찾아 그래프로 보여주는 **옵시디언 입문 도우미** 웹 서비스.

## 주요 기능

- **아이디어 그래프**: 노트를 추가하면 AI가 의미적으로 연결되는 노트 쌍과 이유, 추천 태그를 찾아 canvas 그래프와 연결 목록으로 보여줘요. 결과는 옵시디언용 마크다운(`[[내부링크]]` 포함)으로 복사할 수 있어요.
- **노트 정리기**: 두서없는 메모를 frontmatter·태그·내부링크가 포함된 옵시디언 노트로 정리해줘요.
- **Q&A 챗봇**: 옵시디언에 대한 질문에 답하는 전문가 챗봇.
- **가이드·FAQ**: Vault, 노트, 태그, 내부링크, 그래프 뷰 핵심 개념 안내.

## 기술 스택

- 프론트엔드: 순수 HTML/CSS/JavaScript (프레임워크·빌드 도구 없음)
- 백엔드: Vercel Serverless Functions (Python) + OpenAI·Claude·Gemini API
- 저장: 노트는 브라우저 localStorage에만 저장 (서버 저장 없음)

## 로컬 실행

```bash
npm i -g vercel        # 최초 1회
vercel env pull        # .env.local 생성 (OPENAI_API_KEY)
vercel dev
```

## 배포 (Vercel)

1. GitHub 저장소를 Vercel에 연결
2. **Settings → Environment Variables**에 `OPENAI_API_KEY` 등록
3. 배포 후 배포 URL에서 연결 분석·정리기·챗봇 동작 확인

> ⚠️ API 키는 환경 변수로만 관리해요. `.env*` 파일은 절대 커밋하지 마세요 (`.gitignore`에 포함됨).

### AI 공급자별 환경 변수

웹 화면에서 공급자와 모델을 선택할 수 있어요. 실제 호출에는 선택한 공급자의 키만 필요합니다.

| 공급자 | 환경 변수 | 선택 가능 모델 |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | GPT-4o mini, GPT-4.1 mini |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Haiku 4.5, Sonnet 4.6, Opus 4.8 |
| Google | `GEMINI_API_KEY` | Gemini 3.5 Flash, Gemini 3 Pro |

Vercel에서는 **Settings → Environment Variables**에 필요한 키를 등록한 뒤 재배포하세요.

### 운영 자동화 연동 (선택)

노트를 저장하면 백그라운드로 Notion 데이터베이스에 기록하고 Discord로 알림을 보내요. 두 환경 변수 모두 선택 사항이며, 없으면 조용히 건너뛰어요(노트 저장 자체는 항상 정상 동작).

| 환경 변수 | 용도 | 준비 방법 |
| --- | --- | --- |
| `NOTION_TOKEN` | Notion API 인증 | Notion → Settings → Connections에서 **internal integration** 생성 후 토큰 발급, 대상 데이터베이스에 그 연결을 공유 |
| `NOTION_DATABASE_ID` | 저장할 데이터베이스 | 데이터베이스에 **제목**(Title 타입)과 **키워드**(Text 타입) 속성이 있어야 함. 데이터베이스 URL의 32자리 ID 부분 |
| `DISCORD_WEBHOOK_URL` | Discord 알림 | Discord 채널 설정 → 연동 → 웹후크 → 새 웹후크 만들기 → URL 복사 |

## 개선 효과 확인 (보너스)

홈 화면의 "개선 효과 확인" 섹션에서 단순 누적 수치를 넘어 두 가지를 함께 보여줘요.

- **사용 퍼널**: 방문 → 노트 작성 → AI 키워드 연결 성공 → 그래프 분석 실행의 단계별 전환율.
- **기준 시점 비교**: "지금을 기준점으로 기록" 버튼을 누르면 그 시점을 저장해두고, 이후 노트/AI 성공/그래프 분석이 얼마나 늘었는지 비교해 보여줘요. 예를 들어 AI 프롬프트를 바꾼 뒤 기준점을 새로 찍으면, 그 변경이 실제로 성공률에 영향을 줬는지 확인할 수 있어요.

내부적으로는 `forest_events`(타임스탬프가 있는 이벤트 로그)와 `forest_snapshot`(기준 시점)을 localStorage에 저장해서 계산해요 — 여기도 외부로는 전송되지 않아요.

## 폴더 구조

```
obsidian-helper/
├── index.html          # 홈
├── notes.html          # 노트 작성
├── workspace.html      # 인터랙티브 그래프 탐색
├── tools.html          # AI 노트 정리기 · Q&A 챗봇
├── guide.html          # 옵시디언 가이드 · FAQ
├── css/style.css       # 다크 테마 + 반응형
├── js/
│   ├── common.js       # 공통 메뉴, 테마, 활동 통계, 이벤트 로그·퍼널·기준시점 비교
│   ├── main.js         # 노트 작성, 탭, fetch 헬퍼, AI 기능 연결, 백그라운드 동기화
│   ├── notes.js        # 노트 CRUD + localStorage
│   ├── graph.js        # 드래그·호버·클릭 가능한 canvas 그래프
│   └── graph-page.js   # 그래프 분석·예시 데이터 연결
├── api/
│   ├── ai_client.py    # OpenAI·Anthropic·Google 공용 어댑터
│   ├── connect.py      # 아이디어 연결 분석
│   ├── organize.py     # 노트 정리기
│   ├── chat.py         # Q&A 챗봇
│   ├── keywords.py     # 노트 저장 시 키워드 3개 추출
│   └── sync.py         # 노트를 Notion에 저장·Discord로 알림 (선택)
├── requirements.txt
└── vercel.json
```

## 보너스 기능

- 다크/라이트 테마 전환: 선택한 테마를 브라우저에 저장해 다음 방문에도 유지해요.
- 마이크로 인터랙션: 버튼·카드 hover, AI 로딩 표시, 복사 완료 피드백을 제공해요.
- 간단한 사용 통계: 방문 수, 저장한 노트 수, AI 사용 수를 이 브라우저의 localStorage에만 저장해 보여줘요. 외부 분석 도구로 전송하지 않아요.
- **운영 자동화**: 노트 저장 시 Notion 데이터베이스에 기록하고 Discord로 알려요 (선택, 위 [운영 자동화 연동](#운영-자동화-연동-선택) 참고).
- **개선 효과 확인**: 단순 집계를 넘어 퍼널 전환율과 기준 시점 대비 변화를 보여줘요 (위 [개선 효과 확인](#개선-효과-확인-보너스) 참고).

## 서비스 기획서

서비스 목적, 타겟 사용자, 페이지 구성, AI 기능의 입력·출력·실패 처리 기준은 [SERVICE_PLAN.md](SERVICE_PLAN.md)에서 확인할 수 있어요.
