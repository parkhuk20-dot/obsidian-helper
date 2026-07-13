// 공통 메뉴 · 테마 · 이 브라우저 안에서만 저장되는 간단한 활동 통계
const ACTIVITY_KEY = 'forest_activity';
const AI_SETTINGS_KEY = 'forest_ai_settings';
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

function recordAiUse() {
  const activity = getActivity();
  activity.aiUses += 1;
  saveActivity(activity);
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
updateActivityView();
initAiSelector();
