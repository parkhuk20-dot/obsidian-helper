from http.server import BaseHTTPRequestHandler
import json
import os

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
