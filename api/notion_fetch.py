"""설정 모달의 "Notion에서 데이터 불러오기" 버튼을 눌렀을 때만 호출되는 엔드포인트.

노트 저장 시 자동으로 Notion에 기록하는 흐름(api/sync.py)의 반대 방향이다.
사용자가 직접 입력한 Notion Integration Token·Database ID로 그 데이터베이스를
조회해, 이 앱이 이해하는 노트 형태({id, title, content, keywords})로 변환해
돌려준다. 프론트는 이 응답으로 이 브라우저의 노트를 통째로 덮어써서,
Notion을 "진짜 보관소"로 쓸 수 있게 한다.
"""
from http.server import BaseHTTPRequestHandler
import json
import urllib.error
import urllib.parse
import urllib.request

NOTION_VERSION = '2022-06-28'
NOTE_MAX_CONTENT = 500
NOTE_MAX_COUNT = 20
SERVER_ERROR = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'


def _origin_allowed(origin):
    """다른 엔드포인트와 동일한 방식 — 이 사이트(또는 로컬 개발 서버)에서 온 요청인지 확인한다."""
    if not origin:
        return False
    try:
        host = urllib.parse.urlparse(origin).hostname or ''
    except Exception:
        return False
    if host in ('localhost', '127.0.0.1'):
        return True
    return host == 'obsidian-helper.vercel.app' or (
        host.startswith('obsidian-helper') and host.endswith('.vercel.app')
    )


def _extract_text(prop):
    """Notion의 title/rich_text 속성에서 순수 텍스트만 뽑아낸다."""
    if not isinstance(prop, dict):
        return ''
    parts = prop.get('title') or prop.get('rich_text') or []
    if not isinstance(parts, list):
        return ''
    return ''.join(p.get('plain_text', '') for p in parts if isinstance(p, dict)).strip()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        origin = self.headers.get('Origin') or self.headers.get('Referer') or ''
        if not _origin_allowed(origin):
            return self._send(403, {'error': '허용되지 않은 요청이에요'})

        try:
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        except Exception:
            return self._send(400, {'error': '잘못된 요청이에요'})

        token = body.get('notion_token')
        database_id = body.get('notion_database_id')
        if not isinstance(token, str) or not token.strip() \
                or not isinstance(database_id, str) or not database_id.strip():
            return self._send(400, {'error': 'Notion Integration Token과 Database ID를 먼저 입력해주세요'})
        token = token.strip()
        database_id = database_id.strip()

        payload = {
            'page_size': NOTE_MAX_COUNT,
            'sorts': [{'timestamp': 'created_time', 'direction': 'descending'}],
        }
        headers = {
            'Authorization': f'Bearer {token}',
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
        }
        req = urllib.request.Request(
            f'https://api.notion.com/v1/databases/{database_id}/query',
            data=json.dumps(payload).encode('utf-8'), headers=headers, method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                return self._send(400, {'error': 'Notion 토큰이 올바르지 않거나 이 데이터베이스에 연결 권한이 없어요'})
            if exc.code == 404:
                return self._send(400, {'error': '데이터베이스를 찾을 수 없어요. ID를 확인하거나 Integration을 데이터베이스에 연결해주세요'})
            return self._send(500, {'error': SERVER_ERROR})
        except Exception:
            return self._send(500, {'error': SERVER_ERROR})

        notes = []
        for page in data.get('results', []):
            props = page.get('properties', {})
            title = _extract_text(props.get('제목', {}))
            if not title:
                continue
            content = _extract_text(props.get('내용', {}))[:NOTE_MAX_CONTENT]
            keywords_raw = _extract_text(props.get('키워드', {}))
            keywords = [k.strip() for k in keywords_raw.split(',') if k.strip()][:3]
            notes.append({
                'id': page.get('id', ''),
                'title': title[:100],
                'content': content,
                'keywords': keywords,
                'createdAt': page.get('created_time', ''),
            })

        self._send(200, {'notes': notes})

    def _send(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
