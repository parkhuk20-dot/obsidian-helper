// 공통 메뉴 · 테마 · 이 브라우저 안에서만 저장되는 간단한 활동 통계
const ACTIVITY_KEY = 'forest_activity';

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
