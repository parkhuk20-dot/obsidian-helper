from http.server import BaseHTTPRequestHandler
import json
from ai_client import AiConfigurationError, generate

SERVER_ERROR = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'

SYSTEM_PROMPT = (
    '너는 옵시디언(Obsidian) 노트 정리 전문가다. '
    '사용자가 준 두서없는 메모를 옵시디언 노트로 정리하라. 반드시 포함할 것:\n'
    '1. frontmatter (--- 로 감싸고 tags에 태그 3~5개)\n'
    '2. 제목 (H1, # 한 개)\n'
    '3. 소제목과 목록으로 구조화한 본문\n'
    '4. 본문 속 핵심 개념에 [[내부링크]] 후보 표시\n'
    '설명 없이 정리된 마크다운만 반환하라. 모든 내용은 한국어로.'
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        except Exception:
            return self._send(400, {'error': '잘못된 요청이에요'})

        note = body.get('note')
        ai = body.get('ai')
        if not isinstance(note, str) or not note.strip():
            return self._send(400, {'error': '내용을 입력해주세요'})
        if len(note) > 5000:
            return self._send(400, {'error': '메모는 5,000자 이하로 입력해주세요'})

        try:
            result = generate(ai, SYSTEM_PROMPT, [{'role': 'user', 'content': note}]).strip()
        except AiConfigurationError as exc:
            return self._send(400, {'error': str(exc)})
        except Exception:
            return self._send(500, {'error': SERVER_ERROR})

        # 모델이 전체를 ```markdown 코드펜스로 감싸면 벗긴다
        # (감싼 채로 옵시디언에 붙여넣으면 frontmatter가 인식되지 않음)
        if result.startswith('```') and result.endswith('```'):
            result = result.split('\n', 1)[-1].rsplit('```', 1)[0].strip()

        self._send(200, {'result': result})

    def _send(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
