"""노트 저장을 외부 도구로 확장하는 보너스 엔드포인트.

사용자 입력(노트) → AI 처리(키워드 추출, main.js에서 이미 완료) → 이 엔드포인트에서
저장(Notion 데이터베이스)·알림(Discord 웹훅)으로 흐름을 넓힌다.

두 연동 모두 선택 사항이다. 관련 환경 변수가 없으면 그 항목만 조용히 건너뛰고,
하나가 실패해도 다른 하나는 계속 시도한다 — 이 엔드포인트의 성패가 노트 저장 자체를
막아서는 안 되므로 항상 200으로 응답하고 결과만 항목별로 알려준다.
"""
from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.error
import urllib.parse
import urllib.request

NOTION_VERSION = '2022-06-28'
NOTE_MAX_CONTENT = 500
DISCORD_WEBHOOK_HOSTS = {'discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'}


def _post_json(url, payload, headers):
    body = json.dumps(payload).encode('utf-8')
    # urllib의 기본 User-Agent(Python-urllib/x.y)는 Discord의 Cloudflare가 봇으로 간주해
    # 403(error code 1010)으로 차단한다. 명시적인 UA를 보내야 웹훅이 통과된다.
    headers = {**headers, 'User-Agent': 'obsidian-helper-sync/1.0'}
    req = urllib.request.Request(url, data=body, headers=headers, method='POST')
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, resp.read()


def _sync_notion(title, content, keywords, token=None, database_id=None):
    token = token or os.environ.get('NOTION_TOKEN')
    database_id = database_id or os.environ.get('NOTION_DATABASE_ID')
    if not token or not database_id:
        return 'skipped'

    payload = {
        'parent': {'database_id': database_id},
        'properties': {
            '제목': {'title': [{'text': {'content': title[:200]}}]},
            '키워드': {'rich_text': [{'text': {'content': ', '.join(keywords)}}]},
            '내용': {'rich_text': [{'text': {'content': content[:2000]}}] if content else []},
        },
        'children': [
            {
                'object': 'block',
                'type': 'paragraph',
                'paragraph': {'rich_text': [{'text': {'content': content}}] if content else []},
            },
        ],
    }
    headers = {
        'Authorization': f'Bearer {token}',
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
    }
    try:
        _post_json('https://api.notion.com/v1/pages', payload, headers)
        return 'sent'
    except Exception:
        return 'error'


def _sync_discord(title, content, keywords, webhook_url=None):
    webhook_url = webhook_url or os.environ.get('DISCORD_WEBHOOK_URL')
    if not webhook_url:
        return 'skipped'

    # 사용자가 직접 입력한 URL이 서버 쪽 urlopen으로 그대로 전달되므로,
    # 실제 Discord 웹훅 호스트인지 확인해 임의의 URL로 요청을 대신 보내는 SSRF를 막는다.
    parsed = urllib.parse.urlparse(webhook_url)
    if parsed.scheme != 'https' or parsed.hostname not in DISCORD_WEBHOOK_HOSTS:
        return 'error'

    preview = content if len(content) <= 200 else content[:200] + '…'
    tag_line = ' '.join(f'#{kw}' for kw in keywords) if keywords else '(키워드 없음)'
    message = f'🌲 새 노트가 저장됐어요\n**{title}**\n{preview}\n{tag_line}'
    try:
        _post_json(webhook_url, {'content': message}, {'Content-Type': 'application/json'})
        return 'sent'
    except Exception:
        return 'error'


def _origin_allowed(origin):
    """이 사이트(또는 로컬 개발 서버)에서 온 요청인지 Origin/Referer로 확인한다.

    /api/sync는 로그인 없이 누구나 호출 가능한 공개 엔드포인트라, 방어가 없으면
    이 URL을 아는 사람 누구나 서버에 등록된 실제 Notion·Discord로 임의의 글을
    써 넣을 수 있다. 헤더는 위조 가능해 완벽한 인증은 아니지만, 자동화된 스캔·
    무작위 호출 시도는 대부분 걸러낸다.
    """
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


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        origin = self.headers.get('Origin') or self.headers.get('Referer') or ''
        if not _origin_allowed(origin):
            return self._send(403, {'error': '허용되지 않은 요청이에요'})

        try:
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        except Exception:
            return self._send(400, {'error': '잘못된 요청이에요'})

        title = body.get('title')
        content = body.get('content')
        if not isinstance(title, str) or not title.strip():
            return self._send(400, {'error': '제목을 입력해주세요'})
        if not isinstance(content, str):
            content = ''
        if len(content) > NOTE_MAX_CONTENT:
            return self._send(400, {'error': f'노트 내용은 {NOTE_MAX_CONTENT}자 이하여야 해요'})

        keywords = body.get('keywords')
        keywords = [str(k).strip() for k in keywords if str(k).strip()][:3] \
            if isinstance(keywords, list) else []

        def _clean(key):
            value = body.get(key)
            return value.strip() if isinstance(value, str) and value.strip() else None

        result = {
            'notion': _sync_notion(
                title.strip(), content.strip(), keywords,
                token=_clean('notion_token'), database_id=_clean('notion_database_id'),
            ),
            'discord': _sync_discord(
                title.strip(), content.strip(), keywords,
                webhook_url=_clean('discord_webhook_url'),
            ),
        }
        self._send(200, result)

    def _send(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
