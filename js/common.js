// 공통 메뉴 · 테마 · 이 브라우저 안에서만 저장되는 간단한 활동 통계
const ACTIVITY_KEY = 'forest_activity';
const AI_SETTINGS_KEY = 'forest_ai_settings';
const EVENTS_KEY = 'forest_events';       // 타임스탬프가 있는 이벤트 로그 — 퍼널·전후비교에 사용
const SNAPSHOT_KEY = 'forest_snapshot';   // 사용자가 지정한 "기준 시점"
const EVENT_CAP = 300;                    // 무한정 쌓이지 않도록 최근 N개만 보관
const MODEL_OPTIONS = {
  openai: [
    ['gpt-4o-mini', 'GPT-4o mini — 빠르고 경제적'],
    ['gpt-4.1-mini', 'GPT-4.1 mini — 균형 잡힌 성능'],
  ],
  anthropic: [
    ['claude-haiku-4-5', 'Claude Haiku 4.5 — 빠른 응답'],
    ['claude-sonnet-4-6', 'Claude Sonnet 4.6 — 균형 잡힌 성능'],
    ['claude-opus-4-8', 'Claude Opus 4.8 — 높은 추론 성능'],
  ],
  google: [
    ['gemini-3.5-flash', 'Gemini 3.5 Flash — 빠른 응답'],
    ['gemini-3-pro', 'Gemini 3 Pro — 높은 성능'],
  ],
};

function getActivity() {
  try {
    return { visits: 0, aiUses: 0, ...JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '{}') };
  } catch { return { visits: 0, aiUses: 0 }; }
}

function saveActivity(activity) {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
}

function recordAiUse(eventType = 'ai_success') {
  const activity = getActivity();
  activity.aiUses += 1;
  saveActivity(activity);
  logEvent(eventType);
}

// --- 이벤트 로그: 개선 효과를 확인하기 위한 퍼널·전후비교의 기반 ---

function logEvent(type) {
  const events = getEvents();
  events.push({ type, ts: Date.now() });
  const trimmed = events.length > EVENT_CAP ? events.slice(events.length - EVENT_CAP) : events;
  localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
}

function getEvents() {
  try {
    const events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    return Array.isArray(events) ? events : [];
  } catch { return []; }
}

function countEvents(type, sinceTs = 0) {
  return getEvents().filter((e) => e.type === type && e.ts > sinceTs).length;
}

function getSnapshot() {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null'); } catch { return null; }
}

function saveSnapshotNow() {
  const snapshot = { ts: Date.now() };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

// 단계별 전환율(퍼널)과 기준 시점 이후 변화(전후비교)를 계산해 보여준다.
// 이게 곧 "개선 효과를 확인하는 방법" — 숫자를 누적만 하는 게 아니라
// 단계 간 비율과, 특정 시점 대비 변화량을 항상 볼 수 있게 한다.
function renderEffectPanel() {
  const funnelEl = document.getElementById('effect-funnel');
  const snapshotEl = document.getElementById('effect-snapshot');
  if (!funnelEl && !snapshotEl) return;

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const visits = countEvents('visit');
  const notesSaved = countEvents('note_saved');
  const kwOk = countEvents('keyword_ai_success');
  const kwFail = countEvents('keyword_ai_fail');
  const graphRuns = countEvents('graph_analyze');

  if (funnelEl) {
    const steps = [
      { label: '방문', value: visits, rate: null },
      { label: '노트 작성', value: notesSaved, rate: pct(notesSaved, visits) },
      { label: 'AI 키워드 연결 성공', value: kwOk, rate: pct(kwOk, kwOk + kwFail) },
      { label: '그래프 분석 실행', value: graphRuns, rate: pct(graphRuns, notesSaved) },
    ];
    funnelEl.innerHTML = '';
    steps.forEach((step) => {
      const row = document.createElement('div');
      row.className = 'funnel-row';
      const label = document.createElement('span');
      label.className = 'funnel-label';
      label.textContent = step.label;
      const value = document.createElement('span');
      value.className = 'funnel-value';
      value.textContent = step.rate === null ? `${step.value}회` : `${step.value}회 (전환율 ${step.rate}%)`;
      row.append(label, value);
      funnelEl.appendChild(row);
    });
  }

  if (snapshotEl) {
    const snapshot = getSnapshot();
    if (!snapshot) {
      snapshotEl.textContent = '아직 기준 시점이 없어요. 지금을 기준점으로 기록해두면, 이후 변화와 이전을 비교할 수 있어요.';
    } else {
      const date = new Date(snapshot.ts).toLocaleString('ko-KR');
      const since = (type) => countEvents(type, snapshot.ts);
      snapshotEl.textContent =
        `${date} 기준 이후 — 노트 ${since('note_saved')}개, AI 키워드 성공 ${since('keyword_ai_success')}회, `
        + `그래프 분석 ${since('graph_analyze')}회, 정리기 ${since('organize_success')}회, 챗봇 ${since('chat_success')}회 추가됐어요.`;
    }
  }
}

function getAiSettings() {
  try {
    return { provider: 'openai', model: 'gpt-4o-mini', ...JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || '{}') };
  } catch { return { provider: 'openai', model: 'gpt-4o-mini' }; }
}

function saveAiSettings(settings) { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings)); }

function renderModelOptions(modelSelect, provider, selectedModel) {
  modelSelect.innerHTML = '';
  MODEL_OPTIONS[provider].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = label;
    modelSelect.appendChild(option);
  });
  modelSelect.value = MODEL_OPTIONS[provider].some(([value]) => value === selectedModel)
    ? selectedModel : MODEL_OPTIONS[provider][0][0];
}

function initAiSelector() {
  const providerSelect = document.getElementById('ai-provider');
  const modelSelect = document.getElementById('ai-model');
  if (!providerSelect || !modelSelect) return;
  const saved = getAiSettings();
  providerSelect.value = MODEL_OPTIONS[saved.provider] ? saved.provider : 'openai';
  renderModelOptions(modelSelect, providerSelect.value, saved.model);
  function persist() { saveAiSettings({ provider: providerSelect.value, model: modelSelect.value }); }
  providerSelect.addEventListener('change', () => { renderModelOptions(modelSelect, providerSelect.value); persist(); });
  modelSelect.addEventListener('change', persist);
}

function updateActivityView() {
  const activity = getActivity();
  let notes = 0;
  try { notes = typeof getNotes === 'function' ? getNotes().length : JSON.parse(localStorage.getItem('forest_notes') || '[]').length; } catch { notes = 0; }
  const visit = document.getElementById('visit-count');
  const note = document.getElementById('saved-note-count');
  const ai = document.getElementById('ai-use-count');
  if (visit) visit.textContent = activity.visits;
  if (note) note.textContent = notes;
  if (ai) ai.textContent = activity.aiUses;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    const isDark = theme === 'dark';
    toggle.textContent = isDark ? '☀️' : '🌙';
    toggle.setAttribute('aria-label', isDark ? '라이트 모드로 전환' : '다크 모드로 전환');
  }
}

const savedTheme = localStorage.getItem('forest_theme') || 'dark';
applyTheme(savedTheme);
document.querySelector('.theme-toggle')?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('forest_theme', next);
  applyTheme(next);
});

const hamburger = document.querySelector('.hamburger');
const siteNav = document.querySelector('.site-nav');
hamburger?.addEventListener('click', () => {
  const open = siteNav.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', String(open));
});
siteNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => siteNav.classList.remove('open')));

const activity = getActivity();
activity.visits += 1;
saveActivity(activity);
logEvent('visit');
updateActivityView();
initAiSelector();
renderEffectPanel();
document.getElementById('effect-snapshot-btn')?.addEventListener('click', () => {
  saveSnapshotNow();
  renderEffectPanel();
});
