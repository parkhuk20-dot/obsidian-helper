// AI 기능 연결 — 공통 메뉴·테마·통계는 common.js에서 처리한다.
async function callApi(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요');
  return data;
}

function errorMessage(err) {
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return '응답이 지연되고 있어요. 다시 시도해주세요';
  if (err instanceof TypeError || err.name === 'SyntaxError') return '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';
  return err.message || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요';
}

function showLoading(el, on) { el.innerHTML = on ? '<div class="loading"><div class="spinner"></div>AI가 생각하는 중이에요…</div>' : ''; }
function showError(el, msg) { el.innerHTML = ''; const p = document.createElement('p'); p.className = 'error-msg'; p.textContent = msg; el.appendChild(p); }
async function copyText(text, btn) { try { await navigator.clipboard.writeText(text); const original = btn.textContent; btn.textContent = '복사됐어요!'; setTimeout(() => { btn.textContent = original; }, 1500); } catch { alert('복사에 실패했어요. 직접 선택해서 복사해주세요'); } }

// ===== 아이디어 그래프 =====
const analyzeBtn = document.getElementById('analyze-btn');
function updateAnalyzeButton() {
  if (!analyzeBtn || typeof getNotes !== 'function') return;
  const count = getNotes().length;
  analyzeBtn.disabled = count < 2;
  document.getElementById('analyze-hint').hidden = count >= 2;
}

if (document.getElementById('note-title')) {
  const noteTitle = document.getElementById('note-title');
  const noteContent = document.getElementById('note-content');
  const noteCharCount = document.getElementById('note-char-count');
  const noteFormMsg = document.getElementById('note-form-msg');
  const analyzeStatus = document.getElementById('analyze-status');
  const resultArea = document.getElementById('result-area');
  let lastAnalysis = null;

  noteContent.addEventListener('input', () => { noteCharCount.textContent = noteContent.value.length; });
  document.getElementById('add-note-btn').addEventListener('click', () => {
    const result = addNote(noteTitle.value, noteContent.value);
    if (!result.ok) { noteFormMsg.textContent = result.error; noteFormMsg.hidden = false; return; }
    noteFormMsg.hidden = true; noteTitle.value = ''; noteContent.value = ''; noteCharCount.textContent = '0'; renderNotes(); updateActivityView();
  });

  analyzeBtn.addEventListener('click', async () => {
    const notes = getNotes(); analyzeBtn.disabled = true; resultArea.hidden = true; showLoading(analyzeStatus, true);
    try {
      const data = await callApi('/api/connect', { notes: notes.map(({ id, title, content }) => ({ id, title, content })), ai: getAiSettings() });
      lastAnalysis = { notes, links: data.links, tags: data.tags || {} };
      showLoading(analyzeStatus, false); renderResult(lastAnalysis); recordAiUse(); updateActivityView();
    } catch (err) { showError(analyzeStatus, errorMessage(err)); }
    finally { updateAnalyzeButton(); }
  });

  document.getElementById('demo-graph-btn').addEventListener('click', () => {
    const demoNotes = [
      { id: 'demo-1', title: '아침 루틴 개선', content: '출근 전 20분 동안 오늘의 우선순위와 할 일을 정리하는 습관을 만들고 싶다.' },
      { id: 'demo-2', title: '집중 시간을 늘리는 방법', content: '25분 집중과 5분 휴식을 반복하고 알림을 끄면 중요한 작업에 더 오래 몰입할 수 있다.' },
      { id: 'demo-3', title: '주간 회고 노트', content: '매주 금요일에 잘한 일과 아쉬운 일을 기록하고 다음 주에 바꿀 한 가지를 정한다.' },
      { id: 'demo-4', title: '독서 메모 습관', content: '책에서 기억할 문장과 떠오른 생각을 짧은 노트로 남겨 다른 아이디어와 연결한다.' },
      { id: 'demo-5', title: '나만의 지식 관리', content: '작은 메모를 태그와 내부링크로 이어서 나중에 다시 찾을 수 있는 지식 지도를 만든다.' },
    ];
    const demoLinks = [
      { from: 'demo-1', to: 'demo-2', reason: '아침에 우선순위를 정하고 집중 시간을 확보하는 흐름으로 이어져요.' },
      { from: 'demo-1', to: 'demo-3', reason: '루틴의 실천 결과를 주간 회고로 점검할 수 있어요.' },
      { from: 'demo-2', to: 'demo-4', reason: '집중 시간은 독서와 메모 습관을 꾸준히 만드는 기반이 돼요.' },
      { from: 'demo-4', to: 'demo-5', reason: '독서 메모를 연결하면 개인 지식 관리 체계가 자라나요.' },
      { from: 'demo-3', to: 'demo-5', reason: '회고 기록은 내 지식 관리 방식도 지속적으로 개선하게 해줘요.' },
    ];
    const demoTags = { 'demo-1': ['#루틴', '#생산성'], 'demo-2': ['#집중', '#몰입'], 'demo-3': ['#회고', '#성장'], 'demo-4': ['#독서', '#메모'], 'demo-5': ['#PKM', '#지식관리'] };
    lastAnalysis = { notes: demoNotes, links: demoLinks, tags: demoTags };
    analyzeStatus.innerHTML = '<p class="muted">예시 데이터로 그래프를 표시했어요. AI 키를 설정한 뒤에는 내 노트로 분석해보세요.</p>';
    renderResult(lastAnalysis);
  });

  function renderResult({ notes, links, tags }) {
    const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
    const linksList = document.getElementById('links-list'); linksList.innerHTML = '';
    if (!links.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'AI가 연결점을 찾지 못했어요. 노트를 조금 더 구체적으로 적어보세요.'; linksList.appendChild(p); }
    for (const link of links) {
      const card = document.createElement('div'); card.className = 'link-card';
      const pair = document.createElement('div'); pair.className = 'pair'; pair.textContent = `${byId[link.from].title} ↔ ${byId[link.to].title}`;
      const reason = document.createElement('div'); reason.className = 'reason'; reason.textContent = link.reason || '';
      card.append(pair, reason); linksList.appendChild(card);
    }
    const taggedIds = Object.keys(tags).filter((id) => byId[id] && Array.isArray(tags[id]) && tags[id].length);
    if (taggedIds.length) {
      const tagCard = document.createElement('div'); tagCard.className = 'link-card'; const title = document.createElement('div'); title.className = 'pair'; title.textContent = '추천 태그'; tagCard.appendChild(title);
      taggedIds.forEach((id) => { const row = document.createElement('div'); row.className = 'link-tags'; row.textContent = `${byId[id].title}: ${tags[id].join(' ')}`; tagCard.appendChild(row); });
      linksList.appendChild(tagCard);
    }
    resultArea.hidden = false; renderGraph(notes, links);
  }

  function buildMarkdown({ notes, links, tags }) {
    const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
    return notes.map((note) => {
      const related = links.filter((l) => l.from === note.id || l.to === note.id).map((l) => `- [[${byId[l.from === note.id ? l.to : l.from].title}]] — ${l.reason}`);
      return `## ${note.title}\n${(tags[note.id] || []).length ? `태그: ${tags[note.id].join(' ')}\n` : ''}\n${note.content}\n${related.length ? `\n연결된 노트:\n${related.join('\n')}\n` : ''}`;
    }).join('\n---\n\n');
  }
  document.getElementById('copy-md-btn').addEventListener('click', (e) => { if (lastAnalysis) copyText(buildMarkdown(lastAnalysis), e.target); });
  renderNotes();
}

// ===== AI 도구 =====
if (document.getElementById('organize-input')) {
  const organizeInput = document.getElementById('organize-input');
  const organizeBtn = document.getElementById('organize-btn');
  const organizeStatus = document.getElementById('organize-status');
  const organizeResultWrap = document.getElementById('organize-result-wrap');
  const organizeResult = document.getElementById('organize-result');
  organizeInput.addEventListener('input', () => { document.getElementById('organize-char-count').textContent = organizeInput.value.length; });
  organizeBtn.addEventListener('click', async () => {
    const note = organizeInput.value.trim();
    if (!note) return showError(organizeStatus, '내용을 입력해주세요');
    organizeBtn.disabled = true; organizeResultWrap.hidden = true; showLoading(organizeStatus, true);
    try { const data = await callApi('/api/organize', { note, ai: getAiSettings() }); showLoading(organizeStatus, false); organizeResult.textContent = data.result; organizeResultWrap.hidden = false; recordAiUse(); updateActivityView(); }
    catch (err) { showError(organizeStatus, errorMessage(err)); }
    finally { organizeBtn.disabled = false; }
  });
  document.getElementById('organize-copy-btn').addEventListener('click', (e) => copyText(organizeResult.textContent, e.target));

  const tabs = document.querySelectorAll('.tab-btn');
  function openTab(id) { tabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === id)); document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === id)); }
  tabs.forEach((button) => button.addEventListener('click', () => openTab(button.dataset.tab)));
  if (location.hash === '#chat') openTab('tab-chat');

  const chatMessages = document.getElementById('chat-messages'); const chatInput = document.getElementById('chat-input'); const chatSendBtn = document.getElementById('chat-send-btn'); const chatStatus = document.getElementById('chat-status'); const chatHistory = [];
  function appendBubble(role, content) { const div = document.createElement('div'); div.className = `bubble ${role === 'user' ? 'me' : 'ai'}`; div.textContent = content; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; }
  async function sendChat() {
    const question = chatInput.value.trim(); if (!question) return showError(chatStatus, '내용을 입력해주세요');
    chatStatus.innerHTML = ''; chatInput.value = ''; appendBubble('user', question); chatHistory.push({ role: 'user', content: question }); chatSendBtn.disabled = true; chatInput.disabled = true; showLoading(chatStatus, true);
    try { const data = await callApi('/api/chat', { messages: chatHistory.slice(-10), ai: getAiSettings() }); showLoading(chatStatus, false); chatHistory.push({ role: 'assistant', content: data.reply }); appendBubble('assistant', data.reply); recordAiUse(); updateActivityView(); }
    catch (err) { showError(chatStatus, errorMessage(err)); }
    finally { chatSendBtn.disabled = false; chatInput.disabled = false; chatInput.focus(); }
  }
  chatSendBtn.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) sendChat(); });
}
