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
