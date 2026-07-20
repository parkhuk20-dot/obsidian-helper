// 그래프 탐색 페이지: 저장된 노트를 키워드로 자동 연결해 그래프로 보여준다.
// "내 노트 AI 분석"은 의미 기반 연결(이유 포함)을 더해 다시 그린다.
let lastAnalysis = null;
const analyzeBtn = document.getElementById('analyze-btn');
const analyzeStatus = document.getElementById('analyze-status');
const resultArea = document.getElementById('result-area');

function updateGraphButton() {
  const count = getNotes().length;
  analyzeBtn.disabled = count < 2;
  document.getElementById('analyze-hint').hidden = count >= 1;
}

function renderResult(data) {
  lastAnalysis = data;
  resultArea.hidden = false;
  renderGraph(data.notes, data.links);
}

// 페이지 진입 시: 저장된 노트를 키워드 연결로 즉시 그린다
function renderSavedGraph() {
  const notes = getNotes();
  if (!notes.length) return;
  const links = linksFromKeywords(notes);
  const connected = new Set();
  links.forEach((l) => { connected.add(l.from); connected.add(l.to); });
  analyzeStatus.innerHTML = links.length
    ? `<p class="muted">저장한 노트를 키워드로 연결했어요. 노드에 마우스를 올리면 제목이, 클릭하면 내용이 보여요. 끌면 연결된 노트가 함께 움직여요.</p>`
    : `<p class="muted">아직 공유하는 키워드가 없어 노드가 흩어져 있어요. 노트를 더 추가하거나 "내 노트 AI 분석"으로 의미 연결을 찾아보세요.</p>`;
  renderResult({ notes, links, tags: {} });
}

analyzeBtn.addEventListener('click', async () => {
  const notes = getNotes();
  analyzeBtn.disabled = true;
  showLoading(analyzeStatus, true);
  try {
    const data = await callApi('/api/connect', { notes: notes.map(({ id, title, content }) => ({ id, title, content })), ai: getAiSettings() });
    showLoading(analyzeStatus, false);
    // 키워드 연결과 의미 연결을 합쳐서 그린다
    const merged = [...linksFromKeywords(notes), ...(data.links || [])];
    renderResult({ notes, links: merged, tags: data.tags || {} });
    recordAiUse('graph_analyze');
  } catch (err) {
    showError(analyzeStatus, errorMessage(err));
  } finally {
    updateGraphButton();
  }
});

// 검색: 돋보기를 누르면 입력창이 열리고, 입력하는 대로 제목·내용이 일치하는 노드만 그래프에서 밝아진다
const graphSearchToggle = document.getElementById('graph-search-toggle');
const graphSearchInput = document.getElementById('graph-search-input');
graphSearchToggle?.addEventListener('click', () => {
  const opening = graphSearchInput.hidden;
  graphSearchInput.hidden = !opening;
  if (opening) {
    graphSearchInput.focus();
  } else {
    graphSearchInput.value = '';
    window.clearGraphSearch?.();
  }
});
graphSearchInput?.addEventListener('input', () => window.applyGraphSearch?.(graphSearchInput.value));
graphSearchInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  graphSearchInput.value = '';
  graphSearchInput.hidden = true;
  window.clearGraphSearch?.();
});

// SELECTED NOTE 편집: 제목·내용·키워드를 고쳐 저장하고, 그래프를 새 키워드 기준으로 다시 그린다
const detailEditBtn = document.getElementById('graph-detail-edit-btn');
const detailView = document.getElementById('graph-detail-view');
const detailEditForm = document.getElementById('graph-detail-edit-form');
const detailEditTitle = document.getElementById('detail-edit-title');
const detailEditContent = document.getElementById('detail-edit-content');
const detailEditKeywords = document.getElementById('detail-edit-keywords');
const detailEditMsg = document.getElementById('detail-edit-msg');

function closeDetailEditForm() {
  detailEditForm.hidden = true;
  detailView.hidden = false;
  detailEditMsg.hidden = true;
}

detailEditBtn?.addEventListener('click', () => {
  const id = window.getSelectedGraphNoteId?.();
  const note = getNotes().find((n) => n.id === id);
  if (!note) return;
  detailEditTitle.value = note.title;
  detailEditContent.value = note.content;
  detailEditKeywords.value = noteKeywords(note).join(', ');
  detailEditMsg.hidden = true;
  detailView.hidden = true;
  detailEditForm.hidden = false;
  detailEditTitle.focus();
});

document.getElementById('detail-edit-cancel')?.addEventListener('click', closeDetailEditForm);

document.getElementById('detail-edit-save')?.addEventListener('click', () => {
  const id = window.getSelectedGraphNoteId?.();
  if (!id) return;
  const keywords = detailEditKeywords.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const result = updateNote(id, {
    title: detailEditTitle.value, content: detailEditContent.value, keywords,
  });
  if (!result.ok) {
    detailEditMsg.textContent = result.error;
    detailEditMsg.hidden = false;
    return;
  }
  // 그래프 재구성 전에 지금 열려 있는 패널도 새 내용으로 즉시 반영한다
  const updated = getNotes().find((n) => n.id === id);
  document.getElementById('graph-detail-title').textContent = updated.title;
  document.getElementById('graph-detail-content').textContent = updated.content;
  renderKeywordChips(document.getElementById('graph-detail-keywords'), noteKeywords(updated));
  closeDetailEditForm();
  renderSavedGraph();
});

document.getElementById('copy-md-btn').addEventListener('click', (event) => {
  if (!lastAnalysis) return;
  const { notes, links } = lastAnalysis;
  const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
  const md = notes.map((note) => {
    const kws = typeof noteKeywords === 'function' ? noteKeywords(note) : [];
    const related = (links || [])
      .filter((l) => l.from === note.id || l.to === note.id)
      .map((l) => { const other = byId[l.from === note.id ? l.to : l.from]; return other ? `- [[${other.title}]]${l.reason ? ' — ' + l.reason : ''}` : ''; })
      .filter(Boolean);
    return `## ${note.title}\n`
      + (kws.length ? `태그: ${kws.map((k) => '#' + k).join(' ')}\n` : '')
      + `\n${note.content}\n`
      + (related.length ? `\n연결된 노트:\n${related.join('\n')}\n` : '');
  }).join('\n---\n\n');
  copyText(md, event.target);
});

updateGraphButton();
// 스크립트가 body 끝에서 실행되므로 레이아웃은 준비돼 있다. 즉시 그리고,
// 폰트·이미지 로딩으로 폭이 나중에 확정되는 경우를 대비해 load 시 한 번 더 그린다.
renderSavedGraph();
window.addEventListener('load', renderSavedGraph);
