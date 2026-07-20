from http.server import BaseHTTPRequestHandler
import json
from ai_client import AiConfigurationError, generate

SERVER_ERROR = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'

SYSTEM_PROMPT = (
    '너는 노트에서 핵심 키워드를 뽑아 노트끼리 연결해 주는 도우미다. '
    '한국어 키워드를 정확히 3개 뽑되, 역할이 서로 다르다.\n'
    '1번째(카테고리): 이 노트가 속하는 넓은 분야·주제. 예: 요리, 생산성, 독서, 운동, 여행, 재테크, 커리어, 창작, 관계, 외국어. '
    '이미 사용 중인 키워드 목록에 의미가 통하는 카테고리가 있으면 절대 새로 만들지 말고 그 단어를 그대로 재사용하라. '
    '목록에 맞는 게 없을 때만 새 카테고리를 만들어라.\n'
    '2~3번째(세부 키워드): 이 노트만의 구체적인 내용을 나타내는 1~3어절 명사구. '
    '이것도 이미 사용 중인 키워드와 의미가 통하면 새로 만들지 말고 재사용하라.\n'
    '반드시 아래 JSON 형식으로만 응답하라:\n'
    '{"keywords": ["카테고리", "세부키워드1", "세부키워드2"]}'
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        except Exception:
            return self._send(400, {'error': '잘못된 요청이에요'})

        title = body.get('title')
        content = body.get('content')
        ai = body.get('ai')
        if not isinstance(title, str) or not title.strip():
            return self._send(400, {'error': '제목을 입력해주세요'})
        if not isinstance(content, str):
            content = ''
        if len(content) > 500:
            return self._send(400, {'error': '노트 내용은 500자 이하여야 해요'})

        existing = body.get('existing_keywords')
        existing = [str(k).strip() for k in existing if str(k).strip()][:60] \
            if isinstance(existing, list) else []

        user_lines = [f'제목: {title.strip()}', f'내용: {content.strip()}']
        if existing:
            user_lines.append('이미 사용 중인 키워드: ' + ', '.join(existing))

        try:
            raw = generate(ai, SYSTEM_PROMPT, [{'role': 'user', 'content': '\n'.join(user_lines)}], json_mode=True)
            data = json.loads(raw)
            keywords = data['keywords']
            if not isinstance(keywords, list):
                raise ValueError('keywords is not a list')
        except AiConfigurationError as exc:
            return self._send(400, {'error': str(exc)})
        except Exception:
            return self._send(500, {'error': SERVER_ERROR})

        # 정규화: '#' 제거·공백 정리·중복 제거·최대 3개
        cleaned = []
        seen = set()
        for keyword in keywords:
            text = str(keyword).strip().lstrip('#').strip()
            key = text.lower()
            if text and key not in seen:
                seen.add(key)
                cleaned.append(text)
            if len(cleaned) >= 3:
                break

        self._send(200, {'keywords': cleaned})

    def _send(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
