from http.server import BaseHTTPRequestHandler
import json
import os

from openai import OpenAI

SERVER_ERROR = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'

SYSTEM_PROMPT = (
    '너는 옵시디언(Obsidian) 전문가 도우미다. '
    '옵시디언의 기능, 사용법, 노트 작성 습관에 대해 한국어로 친절하고 간결하게 '
    '(3~6문장) 답하라. 초보자 눈높이에 맞춰 설명하라. '
    '옵시디언·노트 작성과 무관한 질문에는 정중히 사양하고 옵시디언 관련 질문을 권하라.'
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        except Exception:
            return self._send(400, {'error': '잘못된 요청이에요'})

        messages = body.get('messages')
        if not isinstance(messages, list) or not messages:
            return self._send(400, {'error': '내용을 입력해주세요'})
        for msg in messages:
            if not isinstance(msg, dict) or msg.get('role') not in ('user', 'assistant') \
                    or not isinstance(msg.get('content'), str):
                return self._send(400, {'error': '잘못된 요청이에요'})
        last = messages[-1]
        if not last['content'].strip():
            return self._send(400, {'error': '내용을 입력해주세요'})
        if len(last['content']) > 500:
            return self._send(400, {'error': '질문은 500자 이하로 입력해주세요'})

        history = messages[-10:]  # 토큰 방어: 최근 10개만 사용

        try:
            client = OpenAI(api_key=os.environ['OPENAI_API_KEY'], timeout=25)
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[{'role': 'system', 'content': SYSTEM_PROMPT}] + history,
            )
            reply = resp.choices[0].message.content
        except Exception:
            return self._send(500, {'error': SERVER_ERROR})

        self._send(200, {'reply': reply})

    def _send(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
