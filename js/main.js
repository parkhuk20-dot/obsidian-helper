// 네비게이션 · 탭 · 공통 fetch 헬퍼 · AI 기능 연결

// ===== 공통 fetch 헬퍼 =====
async function callApi(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요');
  return data;
}

function errorMessage(err) {
  if (err.name === 'TimeoutError') return '응답이 지연되고 있어요. 다시 시도해주세요';
  if (err instanceof TypeError || err.name === 'SyntaxError') {
    return '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';
  }
  return err.message || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';
}

function showLoading(el, on) {
  el.innerHTML = on
    ? '<div class="loading"><div class="spinner"></div>AI가 생각하는 중이에요…</div>'
    : '';
}

function showError(el, msg) {
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'error-msg';
  p.textContent = msg;
  el.appendChild(p);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = '복사됐어요!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch {
    alert('복사에 실패했어요. 직접 선택해서 복사해주세요');
  }
}

// ===== 네비게이션 (햄버거) =====
const hamburger = document.getElementById('hamburger');
const siteNav = document.getElementById('site-nav');
hamburger.addEventListener('click', () => {
  const open = siteNav.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', String(open));
});
siteNav.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => siteNav.classList.remove('open'))
);

// ===== 탭 전환 =====
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ===== 노트 입력 =====
const noteTitle = document.getElementById('note-title');
const noteContent = document.getElementById('note-content');
const noteCharCount = document.getElementById('note-char-count');
const noteFormMsg = document.getElementById('note-form-msg');

noteContent.addEventListener('input', () => {
  noteCharCount.textContent = noteContent.value.length;
});

document.getElementById('add-note-btn').addEventListener('click', () => {
  const result = addNote(noteTitle.value, noteContent.value);
  if (!result.ok) {
    noteFormMsg.textContent = result.error;
    noteFormMsg.hidden = false;
    return;
  }
  noteFormMsg.hidden = true;
  noteTitle.value = '';
  noteContent.value = '';
  noteCharCount.textContent = '0';
  renderNotes();
});

// ===== AI 연결 분석 =====
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeHint = document.getElementById('analyze-hint');
const analyzeStatus = document.getElementById('analyze-status');
const resultArea = document.getElementById('result-area');
let lastAnalysis = null; // { notes, links, tags }

function updateAnalyzeButton() {
  const count = getNotes().length;
  analyzeBtn.disabled = count < 2;
  analyzeHint.hidden = count >= 2;
}

analyzeBtn.addEventListener('click', async () => {
  const notes = getNotes();
  analyzeBtn.disabled = true;
  resultArea.hidden = true;
  showLoading(analyzeStatus, true);
  try {
    const data = await callApi('/api/connect', {
      notes: notes.map(({ id, title, content }) => ({ id, title, content })),
    });
    lastAnalysis = { notes, links: data.links, tags: data.tags || {} };
    showLoading(analyzeStatus, false);
    renderResult(lastAnalysis);
  } catch (err) {
    showError(analyzeStatus, errorMessage(err));
  } finally {
    updateAnalyzeButton();
  }
});

function renderResult({ notes, links, tags }) {
  const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
  const linksList = document.getElementById('links-list');
  linksList.innerHTML = '';

  if (!links.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'AI가 연결점을 찾지 못했어요. 노트를 조금 더 구체적으로 적어보세요.';
    linksList.appendChild(p);
  }

  for (const link of links) {
    const card = document.createElement('div');
    card.className = 'link-card';

    const pair = document.createElement('div');
    pair.className = 'pair';
    pair.textContent = `${byId[link.from].title} ↔ ${byId[link.to].title}`;

    const reason = document.createElement('div');
    reason.className = 'reason';
    reason.textContent = link.reason || '';

    card.append(pair, reason);
    linksList.appendChild(card);
  }

  // 추천 태그 요약
  const taggedIds = Object.keys(tags).filter((id) => byId[id] && tags[id].length);
  if (taggedIds.length) {
    const tagCard = document.createElement('div');
    tagCard.className = 'link-card';
    const title = document.createElement('div');
    title.className = 'pair';
    title.textContent = '추천 태그';
    tagCard.appendChild(title);
    for (const id of taggedIds) {
      const row = document.createElement('div');
      row.className = 'link-tags';
      row.textContent = `${byId[id].title}: ${tags[id].join(' ')}`;
      tagCard.appendChild(row);
    }
    linksList.appendChild(tagCard);
  }

  resultArea.hidden = false;
  renderGraph(notes, links);
}

// ===== 옵시디언용 마크다운 생성 · 복사 =====
function buildMarkdown({ notes, links, tags }) {
  const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
  const parts = [];
  for (const note of notes) {
    const noteTags = (tags[note.id] || []).join(' ');
    const related = links
      .filter((l) => l.from === note.id || l.to === note.id)
      .map((l) => {
        const other = byId[l.from === note.id ? l.to : l.from];
        return `- [[${other.title}]] — ${l.reason}`;
      });
    parts.push(
      `## ${note.title}\n` +
        (noteTags ? `태그: ${noteTags}\n` : '') +
        `\n${note.content}\n` +
        (related.length ? `\n연결된 노트:\n${related.join('\n')}\n` : '')
    );
  }
  return parts.join('\n---\n\n');
}

document.getElementById('copy-md-btn').addEventListener('click', (e) => {
  if (!lastAnalysis) return;
  copyText(buildMarkdown(lastAnalysis), e.target);
});

// ===== 노트 정리기 =====
const organizeInput = document.getElementById('organize-input');
const organizeCharCount = document.getElementById('organize-char-count');
const organizeBtn = document.getElementById('organize-btn');
const organizeStatus = document.getElementById('organize-status');
const organizeResultWrap = document.getElementById('organize-result-wrap');
const organizeResult = document.getElementById('organize-result');

organizeInput.addEventListener('input', () => {
  organizeCharCount.textContent = organizeInput.value.length;
});

organizeBtn.addEventListener('click', async () => {
  const note = organizeInput.value.trim();
  if (!note) {
    showError(organizeStatus, '내용을 입력해주세요');
    return;
  }
  organizeBtn.disabled = true;
  organizeResultWrap.hidden = true;
  showLoading(organizeStatus, true);
  try {
    const data = await callApi('/api/organize', { note });
    showLoading(organizeStatus, false);
    organizeResult.textContent = data.result;
    organizeResultWrap.hidden = false;
  } catch (err) {
    showError(organizeStatus, errorMessage(err));
  } finally {
    organizeBtn.disabled = false;
  }
});

document.getElementById('organize-copy-btn').addEventListener('click', (e) => {
  copyText(organizeResult.textContent, e.target);
});

// ===== Q&A 챗봇 =====
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatStatus = document.getElementById('chat-status');
const chatHistory = []; // {role, content} — 메모리로만 관리

function appendBubble(role, content) {
  const div = document.createElement('div');
  div.className = `bubble ${role === 'user' ? 'me' : 'ai'}`;
  div.textContent = content;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChat() {
  const question = chatInput.value.trim();
  if (!question) {
    showError(chatStatus, '내용을 입력해주세요');
    return;
  }
  chatStatus.innerHTML = '';
  chatInput.value = '';
  appendBubble('user', question);
  chatHistory.push({ role: 'user', content: question });

  chatSendBtn.disabled = true;
  chatInput.disabled = true;
  showLoading(chatStatus, true);
  try {
    const data = await callApi('/api/chat', { messages: chatHistory.slice(-10) });
    showLoading(chatStatus, false);
    chatHistory.push({ role: 'assistant', content: data.reply });
    appendBubble('assistant', data.reply);
  } catch (err) {
    showError(chatStatus, errorMessage(err));
  } finally {
    chatSendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) sendChat();
});

// ===== 초기화 =====
renderNotes();
