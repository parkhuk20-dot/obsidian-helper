from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.parse

# Vercel의 Python 빌더가 형제 파일(api/ai_client.py)을 항상 함께 번들링해주지는
# 않아(배포 시 ModuleNotFoundError 발생) 공용 어댑터를 각 함수 파일에 그대로 둔다.
MODEL_CATALOG = {
    'openai': {'gpt-4o-mini', 'gpt-4.1-mini'},
    'anthropic': {'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'},
    'google': {'gemini-3.5-flash', 'gemini-3-pro'},
}


class AiConfigurationError(Exception):
    """사용자 선택 또는 환경 변수 설정이 올바르지 않을 때 발생한다."""


def _validate_ai(ai):
    if not isinstance(ai, dict):
        return 'openai', 'gpt-4o-mini'
    provider = ai.get('provider', 'openai')
    model = ai.get('model', 'gpt-4o-mini')
    if provider not in MODEL_CATALOG or model not in MODEL_CATALOG[provider]:
        raise AiConfigurationError('지원하지 않는 AI 모델 선택이에요')
    return provider, model


def generate(ai, system_prompt, messages, json_mode=False):
    """공급자별 응답을 문자열 하나로 통일해 반환한다."""
    provider, model = _validate_ai(ai)
    if provider == 'openai':
        from openai import OpenAI
        key = os.environ.get('OPENAI_API_KEY')
        if not key:
            raise AiConfigurationError('OPENAI_API_KEY 환경 변수를 설정해주세요')
        client = OpenAI(api_key=key, timeout=25)
        options = {'model': model, 'messages': [{'role': 'system', 'content': system_prompt}] + messages}
        if json_mode:
            options['response_format'] = {'type': 'json_object'}
        return client.chat.completions.create(**options).choices[0].message.content

    if provider == 'anthropic':
        from anthropic import Anthropic
        key = os.environ.get('ANTHROPIC_API_KEY')
        if not key:
            raise AiConfigurationError('ANTHROPIC_API_KEY 환경 변수를 설정해주세요')
        client = Anthropic(api_key=key, timeout=25.0)
        response = client.messages.create(
            model=model, max_tokens=1800, system=system_prompt, messages=messages,
        )
        return ''.join(block.text for block in response.content if getattr(block, 'type', '') == 'text')

    if provider == 'google':
        from google import genai
        from google.genai import types
        key = os.environ.get('GEMINI_API_KEY')
        if not key:
            raise AiConfigurationError('GEMINI_API_KEY 환경 변수를 설정해주세요')
        conversation = '\n\n'.join(f"[{msg['role']}] {msg['content']}" for msg in messages)
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type='application/json' if json_mode else 'text/plain',
            max_output_tokens=1800,
        )
        response = genai.Client(api_key=key).models.generate_content(
            model=model, contents=conversation, config=config,
        )
        return response.text

    raise AiConfigurationError('지원하지 않는 AI 공급자예요')


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


def _origin_allowed(origin):
    """이 사이트(또는 로컬 개발 서버)에서 온 요청인지 Origin/Referer로 확인한다.

    로그인 없이 누구나 호출 가능한 공개 엔드포인트라, 방어가 없으면 이 URL을
    아는 사람 누구나 서버에 등록된 AI API 키로 무제한 호출해 비용을 발생시킬
    수 있다. 헤더는 위조 가능해 완벽한 인증은 아니지만, 자동화된 스캔·무작위
    호출 시도는 대부분 걸러낸다.
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
