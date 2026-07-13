// 노트 CRUD + localStorage + 키워드 기반 연결
const STORAGE_KEY = 'forest_notes';
const NOTE_MAX_CONTENT = 500;
const NOTE_MAX_COUNT = 20;

function getNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const notes = raw ? JSON.parse(raw) : [];
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  localStorage.setItem('forest_note_count', String(notes.length));
}

// '#' 제거 + 공백 정리
function normalizeKeyword(value) {
  return String(value).trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
}

function noteKeywords(note) {
  return Array.isArray(note && note.keywords)
    ? note.keywords.map(normalizeKeyword).filter(Boolean)
    : [];
}

function addNote(title, content, keywords = []) {
  const notes = getNotes();
  if (notes.length >= NOTE_MAX_COUNT) {
    return { ok: false, error: `노트는 최대 ${NOTE_MAX_COUNT}개까지 추가할 수 있어요` };
  }
  if (!title.trim() || !content.trim()) {
    return { ok: false, error: '내용을 입력해주세요' };
  }
  if (content.length > NOTE_MAX_CONTENT) {
    return { ok: false, error: `내용은 ${NOTE_MAX_CONTENT}자 이하로 적어주세요` };
  }
  const cleaned = [];
  const seen = new Set();
  keywords.map(normalizeKeyword).forEach((kw) => {
    const key = kw.toLowerCase();
    if (kw && !seen.has(key)) { seen.add(key); cleaned.push(kw); }
  });
  notes.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    content: content.trim(),
    keywords: cleaned.slice(0, 3),
    createdAt: new Date().toISOString(),
  });
  saveNotes(notes);
  return { ok: true };
}

function deleteNote(id) {
  saveNotes(getNotes().filter((n) => n.id !== id));
}

// 키워드를 공유하는 노트 쌍을 연결(간선)로 만든다 — 옵시디언의 태그·링크처럼
function linksFromKeywords(notes) {
  const links = [];
  for (let i = 0; i < notes.length; i += 1) {
    const a = noteKeywords(notes[i]);
    for (let j = i + 1; j < notes.length; j += 1) {
      const setB = new Set(noteKeywords(notes[j]).map((k) => k.toLowerCase()));
      const shared = a.filter((k) => setB.has(k.toLowerCase()));
      if (shared.length) {
        links.push({
          from: notes[i].id,
          to: notes[j].id,
          reason: `공유 키워드: ${shared.map((k) => '#' + k).join(' ')}`,
        });
      }
    }
  }
  return links;
}

function renderNotes() {
  const listEl = document.getElementById('notes-list');
  const emptyEl = document.getElementById('notes-empty');
  const addBtn = document.getElementById('add-note-btn');
  const notes = getNotes();

  listEl.innerHTML = '';
  emptyEl.hidden = notes.length > 0;

  for (const note of notes) {
    const card = document.createElement('div');
    card.className = 'card note-card';

    const title = document.createElement('h3');
    title.textContent = note.title;

    const preview = document.createElement('p');
    preview.textContent = note.content;

    const del = document.createElement('button');
    del.className = 'note-delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', '노트 삭제');
    del.addEventListener('click', () => {
      deleteNote(note.id);
      renderNotes();
    });

    card.append(title, preview, del);

    const kws = noteKeywords(note);
    if (kws.length) {
      const chips = document.createElement('div');
      chips.className = 'note-keywords';
      kws.forEach((kw) => {
        const chip = document.createElement('span');
        chip.className = 'kw-chip';
        chip.textContent = '#' + kw;
        chips.appendChild(chip);
      });
      card.appendChild(chips);
    }

    listEl.appendChild(card);
  }

  // 20개 도달 시 추가 버튼 비활성 + 안내
  const full = notes.length >= NOTE_MAX_COUNT;
  addBtn.disabled = full;
  const msgEl = document.getElementById('note-form-msg');
  if (full) {
    msgEl.textContent = `노트는 최대 ${NOTE_MAX_COUNT}개까지 추가할 수 있어요. 필요 없는 노트를 삭제해주세요.`;
    msgEl.hidden = false;
  }

  if (typeof updateAnalyzeButton === 'function') updateAnalyzeButton();
}
