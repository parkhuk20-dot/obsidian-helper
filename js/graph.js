// canvas 그래프 렌더링 — 원형(circular) 배치
let lastGraphData = null;

function renderGraph(notes, links) {
  lastGraphData = { notes, links };

  const canvas = document.getElementById('graph');
  const wrap = canvas.parentElement;
  const width = wrap.clientWidth - 20; // 카드 패딩 고려
  const height = Math.max(320, Math.min(width * 0.8, 480));

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

  // 원형 배치
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 50;
  const pos = {};
  notes.forEach((note, i) => {
    const angle = (2 * Math.PI * i) / notes.length - Math.PI / 2;
    pos[note.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

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

    const label = note.title.length > 10 ? note.title.slice(0, 10) + '…' : note.title;
    ctx.fillStyle = isConnected ? textColor : gray;
    ctx.fillText(label, x, y + 24);
  }
}

window.addEventListener('resize', () => {
  if (lastGraphData) renderGraph(lastGraphData.notes, lastGraphData.links);
});
