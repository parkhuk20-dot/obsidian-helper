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

function demoData(large = false) {
  if (!large) return { notes: [{ id: 'demo-1', title: '아침 루틴 개선', content: '출근 전 20분 동안 오늘의 우선순위와 할 일을 정리하는 습관을 만들고 싶다.' }, { id: 'demo-2', title: '집중 시간을 늘리는 방법', content: '25분 집중과 5분 휴식을 반복하고 알림을 끄면 중요한 작업에 더 오래 몰입할 수 있다.' }, { id: 'demo-3', title: '주간 회고 노트', content: '매주 금요일에 잘한 일과 아쉬운 일을 기록하고 다음 주에 바꿀 한 가지를 정한다.' }, { id: 'demo-4', title: '독서 메모 습관', content: '책에서 기억할 문장과 떠오른 생각을 짧은 노트로 남겨 다른 아이디어와 연결한다.' }, { id: 'demo-5', title: '나만의 지식 관리', content: '작은 메모를 태그와 내부링크로 이어서 나중에 다시 찾을 수 있는 지식 지도를 만든다.' }], links: [{ from: 'demo-1', to: 'demo-2', reason: '루틴과 집중을 함께 개선할 수 있어요.' }, { from: 'demo-1', to: 'demo-3', reason: '실천 결과를 회고로 점검해요.' }, { from: 'demo-2', to: 'demo-4', reason: '집중 시간은 독서 습관의 기반이에요.' }, { from: 'demo-4', to: 'demo-5', reason: '메모 연결이 지식 관리로 이어져요.' }], tags: {} };
  const topics = ['생산성', '독서', '운동', '여행', '요리', '외국어', '재테크', '커리어', '창작', '관계']; const notes = []; const links = [];
  topics.forEach((topic, group) => { let previous; for (let i = 1; i <= 10; i += 1) { const id = `large-${group}-${i}`; notes.push({ id, title: `${topic} · 메모 ${i}`, content: `${topic}에 관한 ${i}번째 생각입니다. 떠오른 아이디어와 다음 행동을 기록합니다.` }); if (previous) links.push({ from: previous, to: id, reason: `${topic} 안에서 이어지는 생각이에요.` }); previous = id; } if (group) links.push({ from: `large-${group - 1}-1`, to: `large-${group}-1`, reason: '서로 다른 주제의 확장 아이디어예요.' }); });
  return { notes, links, tags: {} };
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

document.getElementById('demo-graph-btn').addEventListener('click', () => { analyzeStatus.innerHTML = '<p class="muted">예시 데이터입니다. 노드를 끌거나 클릭해보세요.</p>'; renderResult(demoData()); });
document.getElementById('demo-large-graph-btn').addEventListener('click', () => { analyzeStatus.innerHTML = '<p class="muted">10개 주제, 100개 예시 메모를 force-directed로 배치했어요.</p>'; renderResult(demoData(true)); });

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
