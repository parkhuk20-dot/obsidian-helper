// 공통 API 헬퍼와 노트 작성·AI 도구 화면 기능
async function callApi(endpoint, payload) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요');
  return data;
}
function errorMessage(err) { if (err.name === 'TimeoutError' || err.name === 'AbortError') return '응답이 지연되고 있어요. 다시 시도해주세요'; if (err instanceof TypeError || err.name === 'SyntaxError') return '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'; return err.message || '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요'; }
function showLoading(el, on) { el.innerHTML = on ? '<div class="loading"><div class="spinner"></div>AI가 생각하는 중이에요…</div>' : ''; }
function showError(el, msg) { el.innerHTML = ''; const p = document.createElement('p'); p.className = 'error-msg'; p.textContent = msg; el.appendChild(p); }
async function copyText(text, btn) { try { await navigator.clipboard.writeText(text); const original = btn.textContent; btn.textContent = '복사됐어요!'; setTimeout(() => { btn.textContent = original; }, 1500); } catch { alert('복사에 실패했어요. 직접 선택해서 복사해주세요'); } }
function updateAnalyzeButton() {}

// 운영 자동화(보너스): 노트를 Notion 데이터베이스에 저장하고 Discord로 알린다.
// 두 연동 모두 서버 환경 변수가 없으면 조용히 건너뛴다 — 실패해도 노트 저장 자체엔 영향 없다.
async function syncNoteInBackground(title, content, keywords) {
  const syncStatus = document.getElementById('sync-status');
  const showSync = (text) => {
    if (!syncStatus) return;
    syncStatus.textContent = text;
    syncStatus.hidden = false;
    setTimeout(() => { syncStatus.hidden = true; }, 4000);
  };
  try {
    const integrations = getIntegrations();
    const payload = { title, content, keywords };
    if (integrations.discordWebhookUrl) payload.discord_webhook_url = integrations.discordWebhookUrl;
    if (integrations.notionToken) payload.notion_token = integrations.notionToken;
    if (integrations.notionDatabaseId) payload.notion_database_id = integrations.notionDatabaseId;
    const sync = await callApi('/api/sync', payload);
    if (sync.notion === 'sent') logEvent('sync_notion_sent');
    if (sync.discord === 'sent') logEvent('sync_discord_sent');
    if (sync.notion === 'sent' || sync.discord === 'sent') {
      const sent = [sync.notion === 'sent' && 'Notion', sync.discord === 'sent' && 'Discord'].filter(Boolean);
      showSync(`☁️ ${sent.join('·')}로 전송했어요`);
    } else if (sync.notion === 'error' || sync.discord === 'error') {
      showSync('☁️ 외부 연동 중 일부가 실패했어요 (노트 저장에는 영향 없어요)');
    }
    // 둘 다 skipped(미설정)면 아무 표시도 하지 않는다
  } catch {
    // sync 자체가 실패해도 노트 저장 흐름은 이미 끝났으므로 조용히 무시
  }
}

// 노트 작성: 저장할 때 AI가 키워드 3개를 뽑아 노트를 연결한다
if (document.getElementById('note-title')) {
  const title = document.getElementById('note-title');
  const content = document.getElementById('note-content');
  const message = document.getElementById('note-form-msg');
  const addBtn = document.getElementById('add-note-btn');

  content.addEventListener('input', () => { document.getElementById('note-char-count').textContent = content.value.length; });

  addBtn.addEventListener('click', async () => {
    const titleValue = title.value.trim();
    const contentValue = content.value.trim();
    // AI 호출 전에 기본 검증 (실패한 요청으로 API를 낭비하지 않도록)
    if (!titleValue || !contentValue) { message.textContent = '내용을 입력해주세요'; message.hidden = false; return; }
    if (getNotes().length >= NOTE_MAX_COUNT) { message.textContent = `노트는 최대 ${NOTE_MAX_COUNT}개까지 추가할 수 있어요`; message.hidden = false; return; }
    message.hidden = true;

    const originalLabel = addBtn.textContent;
    addBtn.disabled = true;
    addBtn.textContent = 'AI가 키워드 연결 중…';
    let keywords = [];
    let warning = '';
    try {
      const existing = [...new Set(getNotes().flatMap((note) => noteKeywords(note)))];
      const data = await callApi('/api/keywords', { title: titleValue, content: contentValue, existing_keywords: existing, ai: getAiSettings() });
      keywords = Array.isArray(data.keywords) ? data.keywords : [];
      recordAiUse('keyword_ai_success');
    } catch (err) {
      warning = `AI 키워드 연결에 실패해 키워드 없이 저장했어요. (${errorMessage(err)})`;
      logEvent('keyword_ai_fail');
    } finally {
      addBtn.textContent = originalLabel;
      addBtn.disabled = false;
    }

    const result = addNote(titleValue, contentValue, keywords);
    if (!result.ok) { message.textContent = result.error; message.hidden = false; return; }
    logEvent('note_saved');
    title.value = '';
    content.value = '';
    document.getElementById('note-char-count').textContent = '0';
    if (warning) { message.textContent = warning; message.hidden = false; } else { message.hidden = true; }
    renderNotes();
    updateActivityView();
    if (typeof renderEffectPanel === 'function') renderEffectPanel();

    // 운영 자동화(보너스): Notion 저장·Discord 알림은 백그라운드로 시도한다.
    // 이미 완료된 노트 저장을 막지 않도록 await하지 않고, 결과만 나중에 살짝 알려준다.
    syncNoteInBackground(titleValue, contentValue, keywords);
  });

  renderNotes();
}

// 정리기가 돌려준 마크다운(frontmatter + H1 제목 + 본문)에서 노트 저장에 필요한
// 제목·내용·키워드를 뽑아낸다. 노트 content는 500자 제한이 있어 넘으면 잘라낸다.
function parseOrganizedNote(markdown) {
  let text = markdown.trim();
  let tags = [];

  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const inlineTags = fm.match(/tags:\s*\[(.*)\]/);
    if (inlineTags) {
      tags = inlineTags[1].split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      tags = [...fm.matchAll(/^\s*-\s*(.+)$/gm)].map((m) => m[1].trim());
    }
    text = text.slice(fmMatch[0].length).trim();
  }

  const titleMatch = text.match(/^#\s+(.+)$/m);
  let title = '';
  if (titleMatch) {
    title = titleMatch[1].trim();
    text = (text.slice(0, titleMatch.index) + text.slice(titleMatch.index + titleMatch[0].length)).trim();
  } else {
    title = (text.split('\n').find((line) => line.trim()) || '정리된 노트').trim();
  }

  let content = text.trim();
  if (content.length > NOTE_MAX_CONTENT) content = content.slice(0, NOTE_MAX_CONTENT - 1) + '…';

  return { title: title.slice(0, 100), content, keywords: tags.slice(0, 3) };
}

// AI 도구: 노트 정리기 + Q&A 챗봇
if (document.getElementById('organize-input')) {
  const organizeInput = document.getElementById('organize-input'); const organizeBtn = document.getElementById('organize-btn'); const organizeStatus = document.getElementById('organize-status'); const organizeResultWrap = document.getElementById('organize-result-wrap'); const organizeResult = document.getElementById('organize-result');
  const organizeSaveBtn = document.getElementById('organize-save-btn'); const organizeSaveMsg = document.getElementById('organize-save-msg');
  organizeInput.addEventListener('input', () => { document.getElementById('organize-char-count').textContent = organizeInput.value.length; });
  organizeBtn.addEventListener('click', async () => { const note = organizeInput.value.trim(); if (!note) return showError(organizeStatus, '내용을 입력해주세요'); organizeBtn.disabled = true; organizeResultWrap.hidden = true; showLoading(organizeStatus, true); try { const data = await callApi('/api/organize', { note, ai: getAiSettings() }); showLoading(organizeStatus, false); organizeResult.textContent = data.result; organizeResultWrap.hidden = false; organizeSaveBtn.disabled = false; organizeSaveBtn.textContent = '그래프에 저장'; organizeSaveMsg.hidden = true; recordAiUse('organize_success'); updateActivityView(); } catch (err) { showError(organizeStatus, errorMessage(err)); } finally { organizeBtn.disabled = false; } });
  document.getElementById('organize-copy-btn').addEventListener('click', (e) => copyText(organizeResult.textContent, e.target));
  organizeSaveBtn.addEventListener('click', () => {
    const parsed = parseOrganizedNote(organizeResult.textContent);
    const result = addNote(parsed.title, parsed.content, parsed.keywords);
    organizeSaveMsg.hidden = false;
    if (!result.ok) {
      organizeSaveMsg.textContent = result.error;
      organizeSaveMsg.className = 'error-msg';
      return;
    }
    logEvent('note_saved');
    updateActivityView();
    if (typeof renderEffectPanel === 'function') renderEffectPanel();
    syncNoteInBackground(parsed.title, parsed.content, parsed.keywords);
    organizeSaveBtn.disabled = true;
    organizeSaveBtn.textContent = '그래프에 저장됨 ✓';
    organizeSaveMsg.className = 'muted';
    organizeSaveMsg.textContent = '"그래프 탐색" 페이지에서 확인할 수 있어요.';
  });
  const tabs = document.querySelectorAll('.tab-btn'); function openTab(id) { tabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === id)); document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === id)); } tabs.forEach((button) => button.addEventListener('click', () => openTab(button.dataset.tab))); if (location.hash === '#chat') openTab('tab-chat');
  const chatMessages = document.getElementById('chat-messages'); const chatInput = document.getElementById('chat-input'); const chatSendBtn = document.getElementById('chat-send-btn'); const chatStatus = document.getElementById('chat-status'); const chatHistory = [];
  function appendBubble(role, text) { const div = document.createElement('div'); div.className = `bubble ${role === 'user' ? 'me' : 'ai'}`; div.textContent = text; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; }
  async function sendChat() { const question = chatInput.value.trim(); if (!question) return showError(chatStatus, '내용을 입력해주세요'); chatStatus.innerHTML = ''; chatInput.value = ''; appendBubble('user', question); chatHistory.push({ role: 'user', content: question }); chatSendBtn.disabled = true; chatInput.disabled = true; showLoading(chatStatus, true); try { const data = await callApi('/api/chat', { messages: chatHistory.slice(-10), ai: getAiSettings() }); showLoading(chatStatus, false); chatHistory.push({ role: 'assistant', content: data.reply }); appendBubble('assistant', data.reply); recordAiUse('chat_success'); updateActivityView(); } catch (err) { showError(chatStatus, errorMessage(err)); } finally { chatSendBtn.disabled = false; chatInput.disabled = false; chatInput.focus(); } }
  chatSendBtn.addEventListener('click', sendChat); chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) sendChat(); });
}
