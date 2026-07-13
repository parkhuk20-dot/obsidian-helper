from http.server import BaseHTTPRequestHandler
import json
from ai_client import AiConfigurationError, generate

SERVER_ERROR = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'

SYSTEM_PROMPT = (
    '너는 노트 사이의 의미적 연결을 찾는 분석가다. '
    '사용자가 준 노트 목록을 분석해 의미적으로 연결되는 노트 쌍을 찾아라. '
    '각 연결에는 이유를 한국어 한 문장으로 붙여라. 억지 연결은 만들지 마라. '
    '또한 노트별로 추천 태그를 2~3개 제안하라 (예: "#생산성"). '
    '반드시 아래 JSON 형식으로만 응답하라:\n'
    '{"links": [{"from": "노트id", "to": "노트id", "reason": "연결 이유"}], '
    '"tags": {"노트id": ["#태그1", "#태그2"]}}'
)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        except Exception:
            return self._send(400, {'error': '잘못된 요청이에요'})

        notes = body.get('notes')
        ai = body.get('ai')
        if not isinstance(notes, list) or not 2 <= len(notes) <= 20:
            return self._send(400, {'error': '노트는 2개 이상 20개 이하로 보내주세요'})
        for note in notes:
            if not isinstance(note, dict) or not str(note.get('id', '')).strip() \
                    or not str(note.get('title', '')).strip():
                return self._send(400, {'error': '잘못된 노트 형식이에요'})
            if len(str(note.get('content', ''))) > 500:
                return self._send(400, {'error': '노트 내용은 500자 이하여야 해요'})

        notes_payload = json.dumps(
            [{'id': n['id'], 'title': n['title'], 'content': n.get('content', '')} for n in notes],
            ensure_ascii=False,
        )

        try:
            content = generate(ai, SYSTEM_PROMPT, [{'role': 'user', 'content': f'노트 목록:\n{notes_payload}'}], json_mode=True)
            data = json.loads(content)
            links = data['links']
            if not isinstance(links, list):
                raise ValueError('links is not a list')
        except AiConfigurationError as exc:
            return self._send(400, {'error': str(exc)})
        except Exception:
            return self._send(500, {'error': SERVER_ERROR})

        # from/to가 실제 노트 id인 연결만 남긴다
        ids = {n['id'] for n in notes}
        valid_links = [
            {'from': l['from'], 'to': l['to'], 'reason': str(l.get('reason', ''))}
            for l in links
            if isinstance(l, dict) and l.get('from') in ids and l.get('to') in ids
            and l['from'] != l['to']
        ]
        tags = data.get('tags')
        valid_tags = {
            note_id: [str(t) for t in tag_list]
            for note_id, tag_list in (tags.items() if isinstance(tags, dict) else [])
            if note_id in ids and isinstance(tag_list, list)
        }

        self._send(200, {'links': valid_links, 'tags': valid_tags})

    def _send(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
