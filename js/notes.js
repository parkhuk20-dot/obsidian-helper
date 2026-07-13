// 노트 CRUD + localStorage
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

function addNote(title, content) {
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
  notes.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
  });
  saveNotes(notes);
  return { ok: true };
}

function deleteNote(id) {
  saveNotes(getNotes().filter((n) => n.id !== id));
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

  // main.js에서 정의 — 분석 버튼 활성/비활성 갱신
  if (typeof updateAnalyzeButton === 'function') updateAnalyzeButton();
}
