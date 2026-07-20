// 옵시디언 스타일 force-directed 그래프
// - 기본 상태: 모든 노드가 무채색 점으로만 표시된다 (제목은 숨김)
// - 노드에 마우스를 가까이 가져가거나 끌면: 그 노드와 직접 연결된 노드·선만 제목과 함께
//   보라색(강조색)으로 밝아지고, 나머지는 반투명해진다
// - 노드를 클릭하면 메모 내용이 보인다
// - 노드를 끌면 스프링으로 이어진 노트들이 함께 따라온다
// - 마우스 휠로 확대·축소, 빈 공간을 끌면 화면을 이동한다 (노드는 화면 규격에 갇히지 않는다)
(() => {
  let canvas, ctx;
  let width = 0, height = 0, dpr = 1;
  let nodes = [], links = [];
  let nodeById = new Map();
  let adjacency = new Map();
  let raf = null, energy = Infinity;
  let hoverId = null, dragId = null, dragMoved = false, dragStart = null;
  let panning = false, panPointerStart = null, panViewStart = null;
  let bound = false;
  let pendingFit = false;    // 새 데이터가 안정되면 화면에 맞춰 자동으로 카메라를 조정한다
  let resizePending = false; // 리사이즈 이벤트를 한 프레임으로 묶어서 처리한다
  let selectedId = null;     // 현재 SELECTED NOTE 패널에 열려 있는 노드
  let searchIds = null;      // 검색어와 일치하는 노드 id 집합 (검색 중이 아니면 null)

  // 물리 상수 (노드 20개 안팎 기준으로 조정) — 좌표는 화면 픽셀이 아닌 자유로운 "월드" 단위
  const REPULSION = 5200;   // 노드끼리 밀어내는 힘
  const SPRING = 0.035;     // 연결선의 당기는 힘
  const SPRING_LEN = 92;    // 연결선의 자연 길이
  const CENTER = 0.014;     // 월드 중심으로 모으는 힘 (그래프가 무한히 퍼지지 않도록)
  const DAMPING = 0.82;     // 속도 감쇠
  const MIN_ENERGY = 0.04;  // 이보다 잠잠해지면 시뮬레이션 정지

  // 노드 크기: 연결이 가장 많은 노드가 NODE_MAX_R(가장 큰 형태=15px로 고정),
  // 고립 노드는 NODE_MIN_R(1px). 그 사이는 현재 그래프의 최대 연결 수 대비 비율로 선형 보간한다.
  const NODE_MIN_R = 1;
  const NODE_MAX_R = 15;

  const FIT_PADDING = 56; // 화면에 맞추기 시 그래프 바깥으로 남겨둘 여백(라벨 공간 포함)

  const DIM_ALPHA = 0.15;        // 근접하지 않은 노드·라벨의 반투명 정도
  const DIM_EDGE_ALPHA = 0.09;   // 근접하지 않은 연결선의 반투명 정도

  const MIN_SCALE = 0.15, MAX_SCALE = 5;

  // 카메라(팬·줌) 상태 — 월드 좌표 * scale + (tx,ty) = 화면 좌표
  const view = { scale: 1, tx: 0, ty: 0, ready: false };

  function ensureRefs() {
    canvas = document.getElementById('graph');
    ctx = canvas.getContext('2d');
    if (!bound) {
      bindEvents();
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(scheduleResize).observe(canvas.parentElement);
      } else {
        window.addEventListener('resize', scheduleResize); // 구형 브라우저 대체
      }
      bound = true;
    }
  }

  function measure() {
    const wrap = canvas.parentElement;
    // 레이아웃 전이거나 그리드 열이 접혀 폭이 비정상적으로 작으면 상위 요소 폭으로 대체
    let w = wrap.clientWidth;
    if (w < 120) {
      const fallback = canvas.closest('.interactive-graph') || wrap.parentElement;
      w = (fallback && fallback.clientWidth) || 600;
    } else {
      // wrap의 좌우 패딩만큼은 캔버스가 실제로 차지하는 폭이 아니므로 빼준다
      const cs = getComputedStyle(wrap);
      w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    width = Math.max(1, w);
    height = Math.max(440, Math.min(width * 0.72, 640));
    dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 최초 1회만 화면 중앙을 월드 원점(0,0)에 맞춘다 — 이후에는 사용자가 옮긴 시점(팬·줌)을 유지
    if (!view.ready) { view.tx = width / 2; view.ty = height / 2; view.ready = true; }
  }

  function screenToWorld(x, y) {
    return { x: (x - view.tx) / view.scale, y: (y - view.ty) / view.scale };
  }

  function buildGraph(noteList, linkList) {
    const prev = nodeById;
    const ids = new Set(noteList.map((n) => n.id));
    links = (linkList || []).filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);

    adjacency = new Map();
    noteList.forEach((n) => adjacency.set(n.id, new Set()));
    links.forEach((l) => { adjacency.get(l.from).add(l.to); adjacency.get(l.to).add(l.from); });

    // 이번 그래프에서 가장 많이 연결된 노드 기준으로 크기를 정규화한다
    // (연결이 많을수록 커지고, 가장 많이 연결된 노드가 NODE_MAX_R로 고정된다)
    let maxDeg = 0;
    adjacency.forEach((set) => { if (set.size > maxDeg) maxDeg = set.size; });

    nodes = noteList.map((note, i) => {
      const old = prev.get(note.id);
      const deg = adjacency.get(note.id).size;
      const ratio = maxDeg > 0 ? deg / maxDeg : 0;
      const angle = (2 * Math.PI * i) / Math.max(1, noteList.length);
      const base = old || {
        x: Math.cos(angle) * 140 + (Math.random() - 0.5) * 40,
        y: Math.sin(angle) * 140 + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0,
      };
      return {
        id: note.id, title: note.title || '', content: note.content || '',
        deg, r: NODE_MIN_R + (NODE_MAX_R - NODE_MIN_R) * ratio,
        x: base.x, y: base.y, vx: base.vx || 0, vy: base.vy || 0, fixed: false,
      };
    });
    nodeById = new Map(nodes.map((n) => [n.id, n]));
    if (dragId && !nodeById.has(dragId)) dragId = null;
    if (hoverId && !nodeById.has(hoverId)) hoverId = null;
  }

  function reheat() { energy = Infinity; if (!raf) loop(); }

  // 현재 모든 노드가 캔버스 안에 여백을 두고 들어오도록 카메라(팬·줌)를 자동으로 맞춘다.
  // 라벨은 호버 시에만 그려지지만, 어느 노드든 호버하면 나타날 수 있으므로
  // 그 공간까지 미리 bounding box에 포함해 맞춘다.
  function fitToView() {
    if (!nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ctx.font = 'bold 12px sans-serif';
    for (const n of nodes) {
      const raw = n.title || '';
      const label = raw.length > 16 ? raw.slice(0, 16) + '…' : raw;
      const halfLabelW = ctx.measureText(label).width / 2 + 5;
      minX = Math.min(minX, n.x - n.r, n.x - halfLabelW);
      maxX = Math.max(maxX, n.x + n.r, n.x + halfLabelW);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, n.y + n.r + 21); // 라벨이 노드 아래에 그려지는 만큼 여유를 둔다
    }
    const graphW = Math.max(maxX - minX, 1);
    const graphH = Math.max(maxY - minY, 1);
    const scale = clampScale(Math.min(
      (width - FIT_PADDING * 2) / graphW,
      (height - FIT_PADDING * 2) / graphH,
    ));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    view.scale = scale;
    view.tx = width / 2 - cx * scale;
    view.ty = height / 2 - cy * scale;
  }

  function tick() {
    if (!nodes.length) return;
    for (const n of nodes) { n.fx = 0; n.fy = 0; }

    // 반발력 (모든 쌍) — 노드 수가 적어 O(n^2)로 충분
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        a.fx += (dx / d) * f; a.fy += (dy / d) * f;
        b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
      }
      // 월드 원점으로 모으는 약한 힘 — 화면 경계 제한 대신 이 힘만으로 흩어지지 않게 한다
      a.fx += -a.x * CENTER;
      a.fy += -a.y * CENTER;
    }

    // 연결선의 스프링력
    for (const l of links) {
      const a = nodeById.get(l.from), b = nodeById.get(l.to);
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = SPRING * (d - SPRING_LEN);
      a.fx += (dx / d) * f; a.fy += (dy / d) * f;
      b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
    }

    // 적분 (끌고 있는 노드는 고정) — 화면 경계로 위치를 자르지 않는다: 노드가 규격 밖으로 자유롭게 퍼질 수 있다
    let e = 0;
    for (const n of nodes) {
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.vx = Math.max(-32, Math.min(32, (n.vx + n.fx) * DAMPING));
      n.vy = Math.max(-32, Math.min(32, (n.vy + n.fy) * DAMPING));
      n.x += n.vx; n.y += n.vy;
      e += n.vx * n.vx + n.vy * n.vy;
    }
    energy = e / nodes.length;
  }

  function loop() {
    tick();
    const settled = energy <= MIN_ENERGY && !dragId;
    if (settled && pendingFit) {
      fitToView();
      pendingFit = false;
    }
    draw();
    if (!settled) raf = requestAnimationFrame(loop);
    else raf = null;
  }

  // requestAnimationFrame은 브라우저 탭·패널이 백그라운드일 때(document.visibilityState
  // !== 'visible') 전혀 실행되지 않는다. 그 상태에서 새 그래프를 그리면 물리 시뮬레이션이
  // 초기 배치에서 영원히 멈추고 fitToView()도 실행되지 못해 화면이 빈 것처럼 보인다.
  // 그래서 rAF 루프를 시작하기 전에, 동기적으로 최대 WARM_START_STEPS번 물리를 미리
  // 진행해 첫 렌더가 이미 안정된 배치로 나오게 한다.
  const WARM_START_STEPS = 300;
  function warmStart() {
    let steps = 0;
    while (energy > MIN_ENERGY && steps < WARM_START_STEPS) { tick(); steps += 1; }
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#a78bfa';
    const text = styles.getPropertyValue('--text').trim() || '#e4e4e7';
    const bg = styles.getPropertyValue('--bg').trim() || '#1e1e2e';
    const base = styles.getPropertyValue('--muted').trim() || '#7a7a8c';

    // 검색 중이면 검색 결과가 호버 강조보다 우선한다
    const isSearching = !!searchIds;
    const activeId = isSearching ? null : (dragId || hoverId);
    const neigh = activeId ? adjacency.get(activeId) : null;
    const highlightSet = isSearching ? searchIds : (activeId ? new Set([activeId, ...(neigh ? [...neigh] : [])]) : null);

    ctx.save();
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);

    // 연결선 — 평소엔 옅은 회색 그물망, 상호작용 시에만 활성 노드와 이어진 선이 보라색으로 밝아지고
    // 나머지는 반투명해진다 (옵시디언 기본 그래프 뷰와 동일한 3단계 상태)
    for (const l of links) {
      const a = nodeById.get(l.from), b = nodeById.get(l.to);
      let strokeStyle, lineWidth;
      if (isSearching) {
        const both = highlightSet.has(l.from) && highlightSet.has(l.to);
        strokeStyle = both ? 'rgba(167,139,250,0.75)' : `rgba(120,120,140,${DIM_EDGE_ALPHA})`;
        lineWidth = both ? 1.6 : 1;
      } else if (!activeId) {
        strokeStyle = 'rgba(150,150,165,0.35)'; lineWidth = 1;
      } else if (l.from === activeId || l.to === activeId) {
        strokeStyle = 'rgba(167,139,250,0.75)'; lineWidth = 1.6;
      } else {
        strokeStyle = `rgba(120,120,140,${DIM_EDGE_ALPHA})`; lineWidth = 1;
      }
      ctx.lineWidth = lineWidth / view.scale;
      ctx.strokeStyle = strokeStyle;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    // 노드 — 기본 상태는 무채색 점만. 상호작용·검색 시: 대상 노드만 보라색 + 진하게, 나머지는 반투명
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of nodes) {
      const highlighted = !highlightSet || highlightSet.has(n.id);
      const alpha = highlighted ? 1 : DIM_ALPHA;
      ctx.globalAlpha = alpha;

      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = (highlightSet && highlightSet.has(n.id)) ? accent : base;
      ctx.fill();
      if (n.id === activeId) {
        ctx.lineWidth = 2 / view.scale;
        ctx.strokeStyle = text;
        ctx.stroke();
      }

      // 제목은 마우스를 가까이 가져간 노드·그 직접 연결 노드, 또는 검색에 일치한 노드에만 보인다
      if (highlightSet && highlightSet.has(n.id)) drawLabel(n, n.id === activeId, text, bg, 1);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawLabel(n, strong, color, bg, alpha) {
    const raw = n.title || '';
    const label = raw.length > 16 ? raw.slice(0, 16) + '…' : raw;
    ctx.font = (strong ? 'bold ' : '') + '12px sans-serif';
    const w = ctx.measureText(label).width;
    const y = n.y + n.r + 12;
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = bg;
    ctx.fillRect(n.x - w / 2 - 5, y - 9, w + 10, 18);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(label, n.x, y);
  }

  // --- 상호작용 ---

  function pointerPos(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function nodeAt(worldX, worldY) {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      const tolerance = n.r + 6 / view.scale;
      if ((worldX - n.x) ** 2 + (worldY - n.y) ** 2 <= tolerance ** 2) return n;
    }
    return null;
  }

  function clampScale(s) { return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)); }

  function bindEvents() {
    canvas.addEventListener('pointerdown', (evt) => {
      const p = pointerPos(evt);
      const wp = screenToWorld(p.x, p.y);
      const n = nodeAt(wp.x, wp.y);
      if (n) {
        dragId = n.id; n.fixed = true; dragMoved = false; dragStart = p;
        try { canvas.setPointerCapture(evt.pointerId); } catch {}
        reheat();
        return;
      }
      // 빈 공간을 잡으면 화면 이동(팬) 시작 — 노드가 아닌 곳을 찍은 것이므로 선택 해제
      hideDetail();
      panning = true; panPointerStart = p; panViewStart = { tx: view.tx, ty: view.ty };
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(evt.pointerId); } catch {}
    });

    canvas.addEventListener('pointermove', (evt) => {
      const p = pointerPos(evt);

      if (panning) {
        view.tx = panViewStart.tx + (p.x - panPointerStart.x);
        view.ty = panViewStart.ty + (p.y - panPointerStart.y);
        if (!raf) draw();
        return;
      }

      if (dragId) {
        const wp = screenToWorld(p.x, p.y);
        const n = nodeById.get(dragId);
        if (n) { n.x = wp.x; n.y = wp.y; n.vx = 0; n.vy = 0; }
        if (dragStart && ((p.x - dragStart.x) ** 2 + (p.y - dragStart.y) ** 2) > 20) dragMoved = true;
        reheat();
        return;
      }

      const wp = screenToWorld(p.x, p.y);
      const n = nodeAt(wp.x, wp.y);
      const id = n ? n.id : null;
      canvas.style.cursor = n ? 'grab' : 'default';
      if (id !== hoverId) { hoverId = id; if (!raf) draw(); }
    });

    canvas.addEventListener('pointerup', (evt) => {
      if (panning) {
        panning = false;
        canvas.style.cursor = 'default';
        try { canvas.releasePointerCapture(evt.pointerId); } catch {}
        return;
      }
      if (!dragId) return;
      const clickedNode = nodeById.get(dragId);
      const wasClick = !dragMoved;
      if (clickedNode) clickedNode.fixed = false;
      dragId = null; dragStart = null;
      try { canvas.releasePointerCapture(evt.pointerId); } catch {}
      reheat();
      if (wasClick && clickedNode) showDetail(clickedNode);
    });

    canvas.addEventListener('pointerleave', () => {
      if (!dragId && !panning) { hoverId = null; if (!raf) draw(); }
    });

    // 마우스 휠 = 확대·축소 (커서 위치를 기준으로 확대되도록 카메라를 함께 이동)
    canvas.addEventListener('wheel', (evt) => {
      evt.preventDefault();
      const p = pointerPos(evt);
      const before = screenToWorld(p.x, p.y);
      const factor = Math.exp(-evt.deltaY * 0.0012);
      view.scale = clampScale(view.scale * factor);
      view.tx = p.x - before.x * view.scale;
      view.ty = p.y - before.y * view.scale;
      if (!raf) draw();
    }, { passive: false });
  }

  function showDetail(note) {
    const detail = document.getElementById('graph-detail');
    if (!detail) return;
    detail.hidden = false;
    selectedId = note.id;

    document.getElementById('graph-detail-title').textContent = note.title;
    document.getElementById('graph-detail-content').textContent = note.content;
    document.getElementById('graph-detail-view').hidden = false;
    const form = document.getElementById('graph-detail-edit-form');
    if (form) form.hidden = true;

    // 예시 데이터(5개/100개 그래프)에는 저장된 원본 노트가 없으니 편집을 제공하지 않는다
    const savedNote = typeof getNotes === 'function' ? getNotes().find((n) => n.id === note.id) : null;
    const keywordsEl = document.getElementById('graph-detail-keywords');
    if (keywordsEl && typeof renderKeywordChips === 'function' && typeof noteKeywords === 'function') {
      renderKeywordChips(keywordsEl, savedNote ? noteKeywords(savedNote) : []);
    }
    const editBtn = document.getElementById('graph-detail-edit-btn');
    if (editBtn) editBtn.hidden = !savedNote;
  }

  function hideDetail() {
    const detail = document.getElementById('graph-detail');
    if (detail && !detail.hidden) detail.hidden = true;
    selectedId = null;
  }

  // 검색어와 제목·내용이 겹치는 노드만 강조한다. 빈 문자열이면 검색 모드를 끈다.
  function applySearch(query) {
    const q = (query || '').trim().toLowerCase();
    searchIds = q ? new Set(nodes.filter((n) => (n.title + ' ' + n.content).toLowerCase().includes(q)).map((n) => n.id)) : null;
    draw();
  }

  function renderGraph(noteList, linkList) {
    ensureRefs();
    measure();
    buildGraph(noteList, linkList);
    pendingFit = true;
    warmStart(); // rAF를 기다리지 않고 즉시 안정된 배치에 가깝게 만든다
    if (energy <= MIN_ENERGY) { fitToView(); pendingFit = false; }
    draw(); // 화면이 백그라운드라 rAF가 아예 안 돌아도 최소 한 번은 그려지도록 직접 호출
    reheat(); // 남은 미세 조정(또는 대형 그래프의 나머지 수렴)은 이어서 rAF로 처리
  }

  // 창 크기뿐 아니라 사이드바 열림/닫힘 등 레이아웃 변화로 캔버스 크기가 바뀌는 경우까지 감지한다.
  // requestAnimationFrame은 패널이 백그라운드면 실행되지 않으므로 setTimeout으로 묶는다.
  function scheduleResize() {
    if (resizePending) return;
    resizePending = true;
    setTimeout(() => {
      resizePending = false;
      if (!nodes.length) return;
      measure();
      fitToView(); // 그래프 전체가 항상 새 크기에 맞춰 다시 배율을 잡도록 한다
      draw();
    }, 0);
  }

  window.renderGraph = renderGraph;
  window.applyGraphSearch = applySearch;
  window.clearGraphSearch = () => applySearch('');
  window.getSelectedGraphNoteId = () => selectedId;
  window.hideGraphDetail = hideDetail;
})();
