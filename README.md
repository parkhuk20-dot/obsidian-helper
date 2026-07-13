# 🌲 정리의 숲 (가칭)

흩어진 메모를 적으면 AI가 아이디어 사이의 연결을 찾아 그래프로 보여주는 **옵시디언 입문 도우미** 웹 서비스.

## 주요 기능

- **아이디어 그래프**: 노트를 추가하면 AI가 의미적으로 연결되는 노트 쌍과 이유, 추천 태그를 찾아 canvas 그래프와 연결 목록으로 보여줘요. 결과는 옵시디언용 마크다운(`[[내부링크]]` 포함)으로 복사할 수 있어요.
- **노트 정리기**: 두서없는 메모를 frontmatter·태그·내부링크가 포함된 옵시디언 노트로 정리해줘요.
- **Q&A 챗봇**: 옵시디언에 대한 질문에 답하는 전문가 챗봇.
- **가이드·FAQ**: Vault, 노트, 태그, 내부링크, 그래프 뷰 핵심 개념 안내.

## 기술 스택

- 프론트엔드: 순수 HTML/CSS/JavaScript (프레임워크·빌드 도구 없음)
- 백엔드: Vercel Serverless Functions (Python) + OpenAI API (`gpt-4o-mini`)
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

## 폴더 구조

```
obsidian-helper/
├── index.html          # 홈
├── workspace.html      # 아이디어 그래프
├── tools.html          # AI 노트 정리기 · Q&A 챗봇
├── guide.html          # 옵시디언 가이드 · FAQ
├── css/style.css       # 다크 테마 + 반응형
├── js/
│   ├── common.js       # 공통 메뉴, 테마, 브라우저 내 활동 통계
│   ├── main.js         # 탭, fetch 헬퍼, AI 기능 연결
│   ├── notes.js        # 노트 CRUD + localStorage
│   └── graph.js        # canvas 그래프 렌더링
├── api/
│   ├── connect.py      # 아이디어 연결 분석
│   ├── organize.py     # 노트 정리기
│   └── chat.py         # Q&A 챗봇
├── requirements.txt
└── vercel.json
```

## 보너스 기능

- 다크/라이트 테마 전환: 선택한 테마를 브라우저에 저장해 다음 방문에도 유지해요.
- 마이크로 인터랙션: 버튼·카드 hover, AI 로딩 표시, 복사 완료 피드백을 제공해요.
- 간단한 사용 통계: 방문 수, 저장한 노트 수, AI 사용 수를 이 브라우저의 localStorage에만 저장해 보여줘요. 외부 분석 도구로 전송하지 않아요.

## 서비스 기획서

서비스 목적, 타겟 사용자, 페이지 구성, AI 기능의 입력·출력·실패 처리 기준은 [SERVICE_PLAN.md](SERVICE_PLAN.md)에서 확인할 수 있어요.
