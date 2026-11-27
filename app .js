(() => {
  'use strict';

  const STORAGE_KEY = 'pie-scheduler-v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CX = 220, CY = 220, R_OUT = 170, R_IN = 82;
  const PALETTE = ['#4f8ef7', '#34c38f', '#f6a23c', '#ef6b6b', '#9b6bf2', '#2ec4d6', '#e86bb3', '#8a94a6'];

  const SAMPLE = [
    { title: '睡眠', start: '23:00', end: '07:00', color: '#8a94a6' },
    { title: '朝の準備', start: '07:00', end: '08:30', color: '#f6a23c' },
    { title: '仕事', start: '09:00', end: '12:00', color: '#4f8ef7' },
    { title: '昼休み', start: '12:00', end: '13:00', color: '#34c38f' },
    { title: '仕事', start: '13:00', end: '18:00', color: '#4f8ef7' },
    { title: '勉強', start: '20:00', end: '21:30', color: '#9b6bf2' },
  ];

  // ---------- 状態 ----------
  let events = load();
  let editingId = null;

  // ---------- 要素 ----------
  const $ = (sel) => document.querySelector(sel);
  const chart = $('#chart');
  const form = $('#event-form');
  const fTitle = $('#f-title');
  const fStart = $('#f-start');
  const fEnd = $('#f-end');
  const fColor = $('#f-color');
  const swatchBox = $('#swatches');
  const formError = $('#form-error');
  const formTitle = $('#form-title');
  const btnSubmit = $('#btn-submit');
  const btnCancel = $('#btn-cancel');
  const list = $('#event-list');
  const emptyMsg = $('#empty');
  const centerTip = $('#center-tip');
  let centerFullName = '';   // 中央で省略表示中の予定名（省略していないときは空）
  let lastPointerType = 'mouse';
  let tipTimer = null;

  // ---------- ユーティリティ ----------
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  }
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const pad = (n) => String(n).padStart(2, '0');
  const toHHMM = (min) => { min = ((min % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); };
  const duration = (e) => { const s = toMin(e.start), t = toMin(e.end); return t > s ? t - s : t + 1440 - s; };
  const fmtDuration = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return h && m ? `${h}時間${m}分` : h ? `${h}時間` : `${m}分`;
  };

  function svgEl(tag, attrs = {}, text) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // 0:00 が真上、時計回り
  function polar(r, min) {
    const a = (min / 1440) * 2 * Math.PI - Math.PI / 2;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }

  function arcPath(startMin, spanMin) {
    const span = Math.min(spanMin, 1439.9);
    const endMin = startMin + span;
    const [x1, y1] = polar(R_OUT, startMin);
    const [x2, y2] = polar(R_OUT, endMin);
    const [x3, y3] = polar(R_IN, endMin);
    const [x4, y4] = polar(R_IN, startMin);
    const large = span > 720 ? 1 : 0;
    return `M${x1} ${y1}A${R_OUT} ${R_OUT} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${R_IN} ${R_IN} 0 ${large} 0 ${x4} ${y4}Z`;
  }

  // 日またぎを [開始, 終了) の区間に分解
  function intervals(e) {
    const s = toMin(e.start), t = toMin(e.end);
    return t > s ? [[s, t]] : [[s, 1440], [0, t]];
  }
  function overlaps(a, b) {
    return intervals(a).some(([s1, e1]) => intervals(b).some(([s2, e2]) => s1 < e2 && s2 < e1));
  }

  // ---------- 保存 / 読み込み ----------
  function isValid(e) {
    return e && typeof e.title === 'string' && /^\d{2}:\d{2}$/.test(e.start) && /^\d{2}:\d{2}$/.test(e.end)
      && e.start !== e.end && typeof e.color === 'string';
  }
  function normalize(arr) {
    return arr.filter(isValid).map((e) => ({
      id: e.id || uid(),
      title: e.title.slice(0, 30),
      start: e.start,
      end: e.end,
      color: /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : '#4f8ef7',
    }));
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (_) { /* 読み込み失敗時はサンプル */ }
    return normalize(SAMPLE);
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch (_) { /* 容量不足など */ }
  }

  // ---------- 円グラフ描画 ----------
  function renderChart() {
    hideTip();
    chart.replaceChildren();

    // 背景リング（空き時間）
    chart.appendChild(svgEl('circle', {
      cx: CX, cy: CY, r: (R_OUT + R_IN) / 2, fill: 'none',
      stroke: 'var(--free)', 'stroke-width': R_OUT - R_IN,
    }));

    // 予定
    const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start));
    for (const e of sorted) {
      const start = toMin(e.start);
      const span = duration(e);
      const g = svgEl('g', { class: 'seg', tabindex: 0, role: 'button', 'aria-label': `${e.title} ${e.start}から${e.end}` });
      g.appendChild(svgEl('path', {
        d: arcPath(start, span), fill: e.color, stroke: 'var(--card)', 'stroke-width': 1.5,
      }));
      g.appendChild(svgEl('title', {}, `${e.title}  ${e.start}–${e.end}（${fmtDuration(span)}）`));

      if (span >= 60) {
        const [lx, ly] = polar((R_OUT + R_IN) / 2, start + span / 2);
        const label = e.title.length > 6 ? e.title.slice(0, 6) + '…' : e.title;
        g.appendChild(svgEl('text', { class: 'seg-label', x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, label));
      }
      g.addEventListener('click', () => startEdit(e.id));
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); startEdit(e.id); } });
      chart.appendChild(g);
    }

    // 目盛りと時刻ラベル
    for (let h = 0; h < 24; h++) {
      const major = h % 6 === 0;
      const [x1, y1] = polar(R_OUT, h * 60);
      const [x2, y2] = polar(R_OUT + (major ? 10 : 6), h * 60);
      chart.appendChild(svgEl('line', { class: 'tick' + (major ? ' major' : ''), x1, y1, x2, y2 }));
      if (h % 3 === 0) {
        const [tx, ty] = polar(R_OUT + 22, h * 60);
        chart.appendChild(svgEl('text', { class: 'hour-label', x: tx, y: ty }, String(h)));
      }
    }

    // 中央テキスト（現在時刻・現在の予定）
    chart.appendChild(svgEl('text', { class: 'center-time', id: 'center-time', x: CX, y: CY - 14 }, ''));
    chart.appendChild(svgEl('text', { class: 'center-sub', id: 'center-sub', x: CX, y: CY + 28 }, ''));

    // 現在時刻の針
    chart.appendChild(svgEl('line', { class: 'hand', id: 'hand', x1: CX, y1: CY, x2: CX, y2: CY - R_OUT }));
    chart.appendChild(svgEl('circle', { class: 'hand-dot', cx: CX, cy: CY, r: 4 }));
    // 針は中央テキストより上に出すと読みにくいので、テキストを前面へ
    chart.appendChild($('#center-time'));
    chart.appendChild($('#center-sub'));

    // 中央の透明な当たり判定（省略された予定名を、ホバー / タップで全文表示）
    const hit = svgEl('circle', { id: 'center-hit', cx: CX, cy: CY, r: R_IN - 4, fill: 'transparent' });
    hit.addEventListener('pointerdown', (ev) => { lastPointerType = ev.pointerType; });
    hit.addEventListener('mouseenter', () => { if (lastPointerType === 'mouse') showTip(); });
    hit.addEventListener('mouseleave', () => { if (lastPointerType === 'mouse') hideTip(); });
    hit.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (lastPointerType === 'mouse') return;       // マウスはホバーで表示済み
      if (centerTip.hidden) showTip(true); else hideTip();
    });
    chart.appendChild(hit);

    updateClock();
  }

  function updateClock() {
    const hand = $('#hand');
    if (!hand) return;
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const [x2, y2] = polar(R_OUT, min);
    // 針は内側リングの外から外周まで（中央テキストを隠さない）
    const [x1, y1] = polar(R_IN - 6, min);
    hand.setAttribute('x1', x1); hand.setAttribute('y1', y1);
    hand.setAttribute('x2', x2); hand.setAttribute('y2', y2);

    $('#center-time').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const current = events.find((e) => intervals(e).some(([s, t]) => nowMin >= s && nowMin < t));
    // 長い予定名が円の外にはみ出さないよう、10文字で切る
    const name = current ? current.title : '空き時間';
    $('#center-sub').textContent = name.length > 10 ? name.slice(0, 10) + '…' : name;
    centerFullName = name.length > 10 ? name : '';
    const hitEl = $('#center-hit');
    if (hitEl) hitEl.style.cursor = centerFullName ? 'pointer' : 'default';
    if (!centerFullName) hideTip();
  }

  // ---------- 中央の予定名（全文表示） ----------
  function showTip(autoHide) {
    if (!centerFullName) return;
    centerTip.textContent = centerFullName;
    centerTip.hidden = false;
    clearTimeout(tipTimer);
    if (autoHide) tipTimer = setTimeout(hideTip, 4000);   // タップ時は4秒で自動的に消す
  }
  function hideTip() {
    clearTimeout(tipTimer);
    centerTip.hidden = true;
  }
  document.addEventListener('click', hideTip);

  // ---------- サマリー ----------
  function renderSummary() {
    // 重なりを二重カウントしないよう、分単位で埋まっているかを数える
    const used = new Uint8Array(1440);
    for (const e of events) for (const [s, t] of intervals(e)) for (let i = s; i < t; i++) used[i] = 1;
    const usedMin = used.reduce((a, b) => a + b, 0);
    $('#sum-used').textContent = fmtDuration(usedMin) || '0分';
    $('#sum-free').textContent = fmtDuration(1440 - usedMin) || '0分';
  }

  // ---------- 一覧 ----------
  function renderList() {
    list.replaceChildren();
    const sorted = [...events].sort((a, b) => toMin(a.start) - toMin(b.start));
    emptyMsg.hidden = sorted.length > 0;

    for (const e of sorted) {
      const li = document.createElement('li');
      li.className = 'event-item' + (e.id === editingId ? ' editing' : '');

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = e.color;

      const main = document.createElement('div');
      main.className = 'event-main';
      const title = document.createElement('div');
      title.className = 'event-title';
      title.textContent = e.title;
      if (events.some((o) => o.id !== e.id && overlaps(e, o))) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = '重なり';
        title.appendChild(badge);
      }
      const time = document.createElement('div');
      time.className = 'event-time';
      time.textContent = `${e.start} – ${e.end}（${fmtDuration(duration(e))}）`;
      main.append(title, time);

      const actions = document.createElement('div');
      actions.className = 'event-actions';
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = '編集';
      edit.addEventListener('click', () => startEdit(e.id));
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = '削除'; del.className = 'danger';
      del.addEventListener('click', () => removeEvent(e.id));
      actions.append(edit, del);

      li.append(dot, main, actions);
      list.appendChild(li);
    }
  }

  function renderAll() {
    renderChart();
    renderSummary();
    renderList();
  }

  // ---------- 操作 ----------
  function showError(msg) {
    formError.hidden = !msg;
    formError.textContent = msg || '';
  }

  function resetForm() {
    editingId = null;
    form.reset();
    fStart.value = '09:00';
    fEnd.value = '10:00';
    setColor(PALETTE[0]);
    formTitle.textContent = '予定を追加';
    btnSubmit.textContent = '追加';
    btnCancel.hidden = true;
    showError('');
  }

  function startEdit(id) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    editingId = id;
    fTitle.value = e.title;
    fStart.value = e.start;
    fEnd.value = e.end;
    setColor(e.color);
    formTitle.textContent = '予定を編集';
    btnSubmit.textContent = '更新';
    btnCancel.hidden = false;
    showError('');
    renderList();
    fTitle.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function removeEvent(id) {
    const e = events.find((x) => x.id === id);
    if (!e || !confirm(`「${e.title}」を削除しますか？`)) return;
    events = events.filter((x) => x.id !== id);
    if (editingId === id) resetForm();
    save();
    renderAll();
  }

  function setColor(hex) {
    fColor.value = hex;
    swatchBox.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.color === hex));
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = fTitle.value.trim();
    if (!title) return showError('予定名を入力してください。');
    if (fStart.value === fEnd.value) return showError('開始と終了が同じ時刻です。');

    const data = { title, start: fStart.value, end: fEnd.value, color: fColor.value };
    if (editingId) {
      events = events.map((e) => (e.id === editingId ? { ...e, ...data } : e));
    } else {
      events.push({ id: uid(), ...data });
    }
    save();
    resetForm();
    renderAll();
  });

  btnCancel.addEventListener('click', () => { resetForm(); renderList(); });
  fColor.addEventListener('input', () => setColor(fColor.value));

  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = c;
    b.style.background = c;
    b.setAttribute('aria-label', `色 ${c}`);
    b.addEventListener('click', () => setColor(c));
    swatchBox.appendChild(b);
  }

  // ---------- 書き出し / 読み込み ----------
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'schedule.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#file-import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('配列ではありません');
      const next = normalize(data);
      if (!next.length) throw new Error('有効な予定がありません');
      if (!confirm(`${next.length}件の予定を読み込みます。現在の予定は置き換えられます。`)) return;
      events = next;
      save(); resetForm(); renderAll();
    } catch (err) {
      alert('読み込みに失敗しました: ' + err.message);
    }
  });

  $('#btn-sample').addEventListener('click', () => {
    if (!confirm('現在の予定をサンプルに置き換えますか？')) return;
    events = normalize(SAMPLE);
    save(); resetForm(); renderAll();
  });

  $('#btn-clear').addEventListener('click', () => {
    if (!events.length || !confirm('すべての予定を削除しますか？')) return;
    events = [];
    save(); resetForm(); renderAll();
  });

  // ---------- 画像として保存 ----------
  function exportImage() {
    const SCALE = 3;           // 3倍の解像度で出力（1320 x 1320 px）
    const W = 440, H = 440;
    const root = getComputedStyle(document.documentElement);
    const v = (name) => root.getPropertyValue(name).trim();

    // 画面のSVGを複製し、画像向けに調整する
    const clone = chart.cloneNode(true);
    clone.querySelectorAll('#hand, .hand-dot, #center-time, #center-sub, #center-hit').forEach((n) => n.remove());
    clone.setAttribute('width', W);
    clone.setAttribute('height', H);

    // 中央には現在時刻ではなく日付を入れる
    const d = new Date();
    const dateText = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    clone.appendChild(svgEl('text', { class: 'center-date', x: CX, y: CY, 'dominant-baseline': 'middle' }, dateText));

    // 単体の画像ではページのCSSが使えないので、必要なスタイルを埋め込む
    const css = `
      text { font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif; }
      .seg-label { font-size: 12px; fill: #fff; font-weight: 600; paint-order: stroke; stroke: rgba(0,0,0,0.25); stroke-width: 2px; }
      .hour-label { font-size: 12px; fill: ${v('--muted')}; text-anchor: middle; dominant-baseline: middle; }
      .tick { stroke: ${v('--tick')}; stroke-width: 1; }
      .tick.major { stroke-width: 2; }
      .center-date { font-size: 22px; font-weight: 700; fill: ${v('--text')}; text-anchor: middle; }`;
    clone.insertBefore(svgEl('style', {}, css), clone.firstChild);
    clone.insertBefore(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: v('--card') }), clone.children[1]);

    // var(--xxx) を実際の色に置き換えてから文字列化
    let xml = new XMLSerializer().serializeToString(clone);
    xml = xml.replace(/var\(--([\w-]+)\)/g, (_, name) => v('--' + name) || '#888888');

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return alert('画像の作成に失敗しました。');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `schedule-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    };
    img.onerror = () => alert('画像の作成に失敗しました。');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  }

  $('#btn-image').addEventListener('click', exportImage);

  // ---------- 起動 ----------
  resetForm();
  renderAll();
  setInterval(updateClock, 15000);
})();
