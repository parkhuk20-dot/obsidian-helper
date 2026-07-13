// canvas 그래프 렌더링 — 원형(circular) 배치
let lastGraphData = null;

function renderGraph(notes, links) {
  lastGraphData = { notes, links };

  const canvas = document.getElementById('graph');
  const wrap = canvas.parentElement;
  const width = wrap.clientWidth - 20; // 카드 패딩 고려
  const height = notes.length > 30
    ? Math.max(520, Math.min(width * 0.85, 680))
    : Math.max(320, Math.min(width * 0.8, 480));

  // 레티나 대응
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!notes.length) return;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#a78bfa';
  const gray = '#6b6b7d';
  const textColor = styles.getPropertyValue('--text').trim() || '#e4e4e7';

  const pos = {};
  const clustered = notes.length > 30;
  if (clustered) {
    // 대용량 메모는 제목 앞부분(예: 생산성 · 메모 1)별로 묶어 읽기 쉽게 배치한다.
    const groups = new Map();
    notes.forEach((note) => {
      const groupName = note.title.split(' · ')[0];
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(note);
    });
    const groupEntries = [...groups.entries()];
    const columns = width >= 760 ? 5 : 2;
    const rows = Math.ceil(groupEntries.length / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    groupEntries.forEach(([groupName, groupNotes], groupIndex) => {
      const col = groupIndex % columns; const row = Math.floor(groupIndex / columns);
      const left = col * cellWidth; const top = row * cellHeight;
      ctx.fillStyle = gray; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(groupName, left + 14, top + 20);
      groupNotes.forEach((note, index) => {
        pos[note.id] = { x: left + 28 + (index % 5) * ((cellWidth - 56) / 4), y: top + 48 + Math.floor(index / 5) * 34 };
      });
    });
  } else {
    const cx = width / 2; const cy = height / 2; const radius = Math.min(width, height) / 2 - 50;
    notes.forEach((note, i) => {
      const angle = (2 * Math.PI * i) / notes.length - Math.PI / 2;
      pos[note.id] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
  }

  const connected = new Set();
  for (const link of links) {
    connected.add(link.from);
    connected.add(link.to);
  }

  // 연결선
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  for (const link of links) {
    const a = pos[link.from];
    const b = pos[link.to];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 노드 + 제목
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  for (const note of notes) {
    const { x, y } = pos[note.id];
    const isConnected = connected.has(note.id);

    ctx.beginPath();
    ctx.arc(x, y, isConnected ? 9 : 7, 0, 2 * Math.PI);
    ctx.fillStyle = isConnected ? accent : gray;
    ctx.fill();

    if (!clustered) {
      const label = note.title.length > 10 ? note.title.slice(0, 10) + '…' : note.title;
      ctx.fillStyle = isConnected ? textColor : gray;
      ctx.fillText(label, x, y + 24);
    }
  }
}

window.addEventListener('resize', () => {
  if (lastGraphData) renderGraph(lastGraphData.notes, lastGraphData.links);
});
