/* Organograma Interativo — parses a Mermaid flowchart and renders it as an
   interactive collapsible tree / radial chart (D3), plus the original Mermaid render. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const NODE_W = 236;
  const NODE_H = 40;
  const GAP_Y = 12;
  const GAP_X = 84;
  const FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';
  const DUR = 600;
  const INITIAL_DEPTH = 2;
  const DEFAULT_STYLE = { fill: '#ffffff', color: '#1f2937', stroke: '#94a3b8', sw: 1 };
  const CLASS_NAMES = {
    estatutaria: 'Diretoria Estatutária',
    super: 'Superintendência',
    diretoria: 'Diretorias',
    gestao: 'Gestões',
    apoio: 'Assessorias e Apoio',
    setor: 'Setores e Serviços',
  };

  // ---------------------------------------------------------------- utils
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const measureCtx = document.createElement('canvas').getContext('2d');
  function fitText(text, maxW, font) {
    measureCtx.font = font;
    if (measureCtx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measureCtx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }

  // ---------------------------------------------------------------- elements
  const els = {
    app: $('#app'),
    svg: $('#chart'),
    stage: $('#stage'),
    mermaidView: $('#mermaidView'),
    mermaidInner: $('#mermaidInner'),
    search: $('#search'),
    results: $('#results'),
    detail: $('#detail'),
    stats: $('#stats'),
    legend: $('#legend'),
    editor: $('#editor'),
    editorMsg: $('#editorMsg'),
    zoomLabel: $('#zoomLabel'),
    hint: $('#hint'),
    sidebar: $('#sidebar'),
    scrim: $('#scrim'),
    tabIndicator: $('#tabIndicator'),
  };
  const svg = d3.select(els.svg);
  const gView = svg.select('g.viewport');
  const gLinks = gView.select('g.links');
  const gNodes = gView.select('g.nodes');

  const state = {
    mode: ['tree', 'radial', 'mermaid'].includes(store.get('org.mode')) ? store.get('org.mode') : 'tree',
    source: window.ORG_SOURCE,
    model: null,
    root: null,
    all: [],
    byId: new Map(),
    selected: null,
    matches: new Set(),
    resultIdx: 0,
    mermaidDirty: true,
    mermaidSeq: 0,
  };

  // ---------------------------------------------------------------- parser
  function parseMermaid(src) {
    const nodes = new Map();
    const edges = [];
    const classDefs = {};
    let direction = 'TB';
    let section = null;

    const ensure = (id, label) => {
      let n = nodes.get(id);
      if (!n) { n = { id, label: id, cls: null, section }; nodes.set(id, n); }
      if (label != null && label !== '') n.label = label.normalize('NFC');
      return n;
    };
    const tokenRe = /^([A-Za-z0-9_\-.]+)\s*(?:\[\s*"?(.*?)"?\s*\])?$/;

    src.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim().replace(/;$/, '');
      if (!line) return;
      if (line.startsWith('%%')) {
        const t = line.replace(/^%%\s*/, '').trim();
        if (t && !/^[=\-*#\s]+$/.test(t)) section = t;
        return;
      }
      let m;
      if ((m = line.match(/^(flowchart|graph)\s*(\w+)?/i))) { direction = (m[2] || 'TB').toUpperCase(); return; }
      if ((m = line.match(/^classDef\s+([\w-]+)\s+(.+)$/))) {
        const st = {};
        m[2].split(',').forEach((p) => {
          const k = p.split(':')[0];
          const v = p.slice(k.length + 1);
          if (k && v) st[k.trim()] = v.trim();
        });
        classDefs[m[1]] = st;
        return;
      }
      if ((m = line.match(/^class\s+(.+?)\s+([\w-]+)$/))) {
        m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => { ensure(id).cls = m[2]; });
        return;
      }
      if (/^(style|linkStyle|subgraph|end|click|direction)\b/.test(line)) return;

      const parts = line.split(/\s*-->\s*/);
      const ids = parts.map((p) => {
        const t = p.trim().match(tokenRe);
        return t ? ensure(t[1], t[2]).id : null;
      });
      if (ids.some((x) => !x)) throw new Error(`Linha ${i + 1} não reconhecida:\n  ${raw.trim()}`);
      for (let k = 0; k < ids.length - 1; k++) edges.push([ids[k], ids[k + 1]]);
    });

    if (!nodes.size) throw new Error('Nenhum nó encontrado no diagrama.');
    return { nodes, edges, classDefs, direction };
  }

  function buildTree(model) {
    const kids = new Map();
    const parent = new Map();
    for (const [a, b] of model.edges) {
      if (a === b || parent.has(b)) continue;
      parent.set(b, a);
      if (!kids.has(a)) kids.set(a, []);
      kids.get(a).push(b);
    }
    const seen = new Set();
    const make = (id) => {
      seen.add(id);
      const n = model.nodes.get(id);
      const children = (kids.get(id) || []).filter((c) => !seen.has(c)).map(make);
      return { id, label: n.label, cls: n.cls, section: n.section, children };
    };
    const forest = [];
    for (const id of model.nodes.keys()) if (!parent.has(id) && !seen.has(id)) forest.push(make(id));
    for (const id of model.nodes.keys()) if (!seen.has(id)) forest.push(make(id)); // cycles
    return forest.length === 1
      ? forest[0]
      : { id: '__root__', label: 'Organização', cls: null, virtual: true, children: forest };
  }

  function styleOf(cls) {
    const s = state.model && state.model.classDefs[cls];
    if (!s) return DEFAULT_STYLE;
    return {
      fill: s.fill || DEFAULT_STYLE.fill,
      color: s.color || DEFAULT_STYLE.color,
      stroke: s.stroke || DEFAULT_STYLE.stroke,
      sw: parseFloat(s['stroke-width']) || 1,
    };
  }
  const className = (cls) => (cls ? CLASS_NAMES[cls] || cls.charAt(0).toUpperCase() + cls.slice(1) : 'Sem classe');
  const isStrong = (d) => d.data.label === d.data.label.toUpperCase() && /[A-ZÀ-Ý]{4}/.test(d.data.label);

  // ---------------------------------------------------------------- load model
  function load(src) {
    const model = parseMermaid(src);
    state.model = model;
    state.source = src;
    const root = d3.hierarchy(buildTree(model));
    root.each((d) => {
      d.kids = d.children || null;
      d.total = d.descendants().length - 1;
    });
    state.root = root;
    state.all = root.descendants();
    state.byId = new Map(state.all.map((d) => [d.data.id, d]));
    state.selected = null;
    state.matches = new Set();
    state.mermaidDirty = true;
    collapseTo(INITIAL_DEPTH);
    closeDetail();
    renderStats();
    renderLegend();
  }

  function collapseTo(level) {
    state.all.forEach((d) => { if (d.kids) d.children = d.depth < level ? d.kids : null; });
  }
  function expandAll() {
    state.all.forEach((d) => { if (d.kids) d.children = d.kids; });
  }

  // ---------------------------------------------------------------- layout
  function layout() {
    const root = state.root;
    if (state.mode === 'tree') {
      d3.tree()
        .nodeSize([NODE_H + GAP_Y, NODE_W + GAP_X])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.35))(root);
      root.each((d) => { d.cur = { x: d.y, y: d.x, a: 0, r: 0 }; });
    } else {
      const visible = root.descendants();
      const leaves = root.leaves().length;
      const depth = d3.max(visible, (d) => d.depth) || 1;
      const R = Math.max(240, depth * 170, (leaves * 19) / (2 * Math.PI));
      d3.tree()
        .size([2 * Math.PI, R])
        .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(root);
      root.each((d) => {
        const ang = d.x - Math.PI / 2;
        d.cur = { x: d.y * Math.cos(ang), y: d.y * Math.sin(ang), a: d.x, r: d.y };
      });
    }
  }

  const isTree = () => state.mode === 'tree';
  const curve = (x0, y0, x1, y1) => {
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  };
  const polar = (a, r) => [r * Math.cos(a - Math.PI / 2), r * Math.sin(a - Math.PI / 2)];
  function radialCurve(s, t) {
    const mr = (s.r + t.r) / 2;
    const [x0, y0] = polar(s.a, s.r), [x1, y1] = polar(s.a, mr), [x2, y2] = polar(t.a, mr), [x3, y3] = polar(t.a, t.r);
    return `M${x0},${y0}C${x1},${y1} ${x2},${y2} ${x3},${y3}`;
  }
  function linkD(s, t) {
    return isTree() ? curve(s.x + NODE_W / 2, s.y, t.x - NODE_W / 2, t.y) : radialCurve(s, t);
  }
  function linkCollapsed(p) {
    if (isTree()) { const x = p.x + NODE_W / 2 + 12; return curve(x, p.y, x, p.y); }
    return radialCurve(p, p);
  }
  const nodePoint = (p) => ({ x: p.x + (isTree() ? NODE_W / 2 + 12 : 0), y: p.y });

  // ---------------------------------------------------------------- render
  function update(source, opts = {}) {
    const dur = opts.instant ? 0 : DUR;
    layout();
    const t = svg.transition('layout').duration(dur).ease(d3.easeCubicInOut);
    const fromP = opts.from || source.prev || source.cur;
    const toP = source.cur;
    const nodes = state.root.descendants();
    const links = state.root.links();

    // links
    const link = gLinks.selectAll('path.link').data(links, (d) => d.target.data.id);
    link.exit().transition(t).attr('d', linkCollapsed(toP)).attr('opacity', 0).remove();
    link.enter().append('path')
      .attr('class', 'link')
      .attr('d', linkCollapsed(fromP))
      .attr('opacity', 0)
      .merge(link)
      .transition(t)
      .attr('d', (d) => linkD(d.source.cur, d.target.cur))
      .attr('opacity', 1);

    // nodes
    const node = gNodes.selectAll('g.node').data(nodes, (d) => d.data.id);
    const fp = nodePoint(fromP), tp = nodePoint(toP);
    node.exit().transition(t)
      .attr('transform', `translate(${tp.x},${tp.y}) scale(0.3)`)
      .attr('opacity', 0)
      .remove();

    const enter = node.enter().append('g')
      .attr('class', 'node')
      .attr('transform', `translate(${fp.x},${fp.y}) scale(0.3)`)
      .attr('opacity', 0)
      .on('click', (e, d) => { e.stopPropagation(); onNodeClick(d); });
    enter.each(function (d) { drawNode(d3.select(this), d); });

    const merged = enter.merge(node);
    merged.each(function (d) { refreshNode(d3.select(this), d, t); });
    merged.transition(t)
      .attr('transform', (d) => `translate(${d.cur.x},${d.cur.y}) scale(1)`)
      .attr('opacity', 1);

    nodes.forEach((d) => { d.prev = { ...d.cur }; });
    applyHighlight();
  }

  function drawNode(g, d) {
    const s = styleOf(d.data.cls);
    const label = d.data.label;
    g.append('title').text(label);
    if (isTree()) {
      g.append('rect')
        .attr('class', 'card')
        .attr('x', -NODE_W / 2).attr('y', -NODE_H / 2)
        .attr('width', NODE_W).attr('height', NODE_H)
        .attr('rx', 10)
        .attr('fill', s.fill).attr('stroke', s.stroke).attr('stroke-width', s.sw)
        .attr('filter', 'url(#shadow)');
      const strong = isStrong(d);
      const font = `${strong ? 800 : 600} ${strong ? 12 : 12.5}px Manrope`;
      g.append('text')
        .attr('class', 'label')
        .attr('x', -NODE_W / 2 + 14)
        .attr('dy', '0.35em')
        .attr('fill', s.color)
        .attr('font-family', FONT)
        .attr('font-size', strong ? 12 : 12.5)
        .attr('font-weight', strong ? 800 : 600)
        .attr('letter-spacing', strong ? '0.04em' : null)
        .text(fitText(label, NODE_W - (d.kids ? 42 : 26), font));
      if (d.kids) {
        const tg = g.append('g').attr('class', 'toggle').attr('transform', `translate(${NODE_W / 2},0)`);
        tg.append('circle').attr('r', 12).attr('fill', s.stroke);
        tg.append('text').attr('text-anchor', 'middle').attr('dy', '0.36em').attr('font-family', FONT);
      }
    } else {
      const r = d.depth === 0 ? 14 : d.kids ? 8 : 5;
      g.append('circle')
        .attr('class', 'dot-node')
        .attr('r', r)
        .attr('fill', s.fill)
        .attr('stroke', s.stroke)
        .attr('stroke-width', Math.max(1.5, s.sw));
      g.append('text')
        .attr('class', 'rlabel')
        .attr('dy', '0.35em')
        .attr('font-family', FONT)
        .attr('font-size', d.kids ? 11.5 : 10.5)
        .attr('font-weight', d.kids ? 700 : 500);
    }
  }

  function refreshNode(g, d, t) {
    const collapsed = !!(d.kids && !d.children);
    g.classed('collapsed', collapsed);
    if (isTree()) {
      g.select('.toggle text').text(collapsed ? `+${d.kids.length}` : '−');
      return;
    }
    const r = d.depth === 0 ? 14 : d.kids ? 8 : 5;
    const text = g.select('text.rlabel');
    const base = fitText(d.data.label, 210, `${d.kids ? 700 : 500} ${d.kids ? 11.5 : 10.5}px Manrope`);
    text.text(collapsed ? `${base}  +${d.kids.length}` : base);
    if (d.depth === 0) {
      text.attr('text-anchor', 'middle').attr('font-size', 13).attr('font-weight', 800)
        .transition(t).attr('transform', 'translate(0,30)');
      return;
    }
    const deg = (d.cur.a * 180) / Math.PI - 90;
    const flip = d.cur.a > Math.PI;
    const off = r + 6;
    text.attr('text-anchor', flip ? 'end' : 'start')
      .transition(t)
      .attr('transform', `rotate(${flip ? deg + 180 : deg}) translate(${flip ? -off : off},0)`);
  }

  function applyHighlight() {
    const sel = state.selected;
    const path = new Set(sel ? sel.ancestors() : []);
    svg.classed('has-selection', !!sel)
      .classed('has-matches', !sel && state.matches.size > 0);
    gNodes.selectAll('g.node')
      .classed('hl', (d) => path.has(d))
      .classed('selected', (d) => d === sel)
      .classed('match', (d) => state.matches.has(d));
    gLinks.selectAll('path.link').classed('hl', (d) => path.has(d.target));
  }

  function resetView({ instant = false } = {}) {
    gLinks.selectAll('*').remove();
    gNodes.selectAll('*').remove();
    state.all.forEach((d) => { d.prev = null; });
    update(state.root, { from: { x: 0, y: 0, a: 0, r: 0 } });
    fit(instant);
  }

  // ---------------------------------------------------------------- zoom
  const zoom = d3.zoom()
    .scaleExtent([0.08, 3])
    .on('zoom', (e) => {
      gView.attr('transform', e.transform);
      els.zoomLabel.textContent = `${Math.round(e.transform.k * 100)}%`;
    })
    .on('start', dismissHint);
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('click', () => { if (state.selected) select(null); });

  const mZoom = d3.zoom()
    .scaleExtent([0.05, 4])
    .on('zoom', (e) => {
      const { x, y, k } = e.transform;
      els.mermaidInner.style.transform = `translate(${x}px,${y}px) scale(${k})`;
      els.zoomLabel.textContent = `${Math.round(k * 100)}%`;
    })
    .on('start', dismissHint);
  d3.select(els.mermaidView).call(mZoom).on('dblclick.zoom', null);

  function viewport() {
    const r = els.stage.getBoundingClientRect();
    const detailOpen = els.detail.classList.contains('open') && window.innerWidth > 860;
    return { w: r.width - (detailOpen ? 372 : 0), h: r.height };
  }

  function bounds() {
    const nodes = state.root.descendants();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach((d) => {
      x0 = Math.min(x0, d.cur.x); x1 = Math.max(x1, d.cur.x);
      y0 = Math.min(y0, d.cur.y); y1 = Math.max(y1, d.cur.y);
    });
    if (isTree()) { x0 -= NODE_W / 2; x1 += NODE_W / 2 + 14; y0 -= NODE_H / 2; y1 += NODE_H / 2; }
    else { const p = 180; x0 -= p; x1 += p; y0 -= p; y1 += p; }
    const pad = 30;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  }

  function fit(instant = false) {
    if (state.mode === 'mermaid') return fitMermaid(instant);
    const b = bounds();
    const { w, h } = viewport();
    const top = 64; // leave room for toolbar
    const k = Math.min((w - 40) / b.w, (h - top - 40) / b.h, 1.15);
    const tr = d3.zoomIdentity
      .translate(w / 2 - k * (b.x + b.w / 2), top / 2 + h / 2 - k * (b.y + b.h / 2))
      .scale(k);
    (instant ? svg : svg.transition('zoom').duration(750).ease(d3.easeCubicInOut)).call(zoom.transform, tr);
  }

  function centerOn(d) {
    const { w, h } = viewport();
    const cur = d3.zoomTransform(els.svg);
    const k = Math.max(cur.k, 0.85);
    const tr = d3.zoomIdentity.translate(w / 2 - k * d.cur.x, h / 2 - k * d.cur.y).scale(k);
    svg.transition('zoom').duration(750).ease(d3.easeCubicInOut).call(zoom.transform, tr);
  }

  function zoomBy(f) {
    if (state.mode === 'mermaid') d3.select(els.mermaidView).transition().duration(250).call(mZoom.scaleBy, f);
    else svg.transition('zoom').duration(250).call(zoom.scaleBy, f);
  }

  function pulse(d) {
    const g = gNodes.selectAll('g.node').filter((x) => x === d);
    if (g.empty()) return;
    const shape = isTree()
      ? g.append('rect').attr('x', -NODE_W / 2).attr('y', -NODE_H / 2).attr('width', NODE_W).attr('height', NODE_H).attr('rx', 10)
      : g.append('circle').attr('r', d.depth === 0 ? 14 : d.kids ? 8 : 5);
    shape.attr('class', 'pulse');
    setTimeout(() => shape.remove(), 2300);
  }

  // ---------------------------------------------------------------- interaction
  function onNodeClick(d) {
    dismissHint();
    if (d.kids) {
      d.children = d.children ? null : d.kids;
      update(d);
    }
    select(d);
  }

  function select(d) {
    state.selected = d;
    applyHighlight();
    if (d) showDetail(d); else closeDetail();
  }

  function reveal(d, { center = true } = {}) {
    let source = null;
    d.ancestors().reverse().forEach((a) => {
      if (a !== d && a.kids && !a.children) {
        if (!source) source = a;
        a.children = a.kids;
      }
    });
    if (state.mode === 'mermaid') setMode('tree');
    if (source) update(source);
    select(d);
    if (center) centerOn(d);
    setTimeout(() => pulse(d), source ? DUR : 50);
  }

  // ---------------------------------------------------------------- detail panel
  function showDetail(d) {
    const s = styleOf(d.data.cls);
    const ancestors = d.ancestors().slice(1).reverse();
    const kids = d.kids || [];
    const n = state.model.nodes.get(d.data.id);
    const level = d.depth + 1;
    els.detail.innerHTML = `
      <button class="close" data-act="close" aria-label="Fechar">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <div class="hero" style="--c:${s.fill};--s:${s.stroke}"></div>
      <span class="chip"><i class="dot" style="--c:${s.fill};--s:${s.stroke}"></i>${esc(className(d.data.cls))}</span>
      <h2>${esc(d.data.label)}</h2>
      <div class="meta">Nível ${level}${n && n.section ? ` · ${esc(n.section)}` : ''} · <code>${esc(d.data.id)}</code></div>
      <div class="crumbs">
        ${ancestors.length
          ? ancestors.map((a) => `<button data-id="${esc(a.data.id)}" title="${esc(a.data.label)}">${esc(a.data.label)}</button>`).join('<span class="arrow">›</span>')
          : '<span class="meta">Topo da estrutura</span>'}
      </div>
      <div class="kpis">
        <div><b>${kids.length}</b><span>Subordinados diretos</span></div>
        <div><b>${d.total}</b><span>Total no ramo</span></div>
      </div>
      <h3>Subordinados diretos</h3>
      ${kids.length
        ? `<ul class="kids">${kids.map((k) => {
            const ks = styleOf(k.data.cls);
            return `<li><button data-id="${esc(k.data.id)}"><i class="dot" style="--c:${ks.fill};--s:${ks.stroke}"></i>${esc(k.data.label)}${k.total ? `<span class="n">+${k.total}</span>` : ''}</button></li>`;
          }).join('')}</ul>`
        : '<p class="kids-empty">Unidade final — sem subordinados.</p>'}
      <div class="detail-actions">
        <button class="btn" data-act="center">Centralizar</button>
        ${kids.length ? '<button class="btn primary" data-act="branch">Expandir ramo</button>' : ''}
      </div>`;
    els.detail.classList.add('open');
  }

  function closeDetail() { els.detail.classList.remove('open'); }

  els.detail.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const d = state.selected;
    if (btn.dataset.id) return reveal(state.byId.get(btn.dataset.id));
    switch (btn.dataset.act) {
      case 'close': select(null); break;
      case 'center': if (d) { centerOn(d); pulse(d); } break;
      case 'branch':
        if (d) {
          d.descendants().forEach((x) => { if (x.kids) x.children = x.kids; });
          update(d);
          setTimeout(() => fitBranch(d), 30);
        }
        break;
    }
  });

  function fitBranch(d) {
    const nodes = d.descendants();
    const xs = nodes.map((n) => n.cur.x), ys = nodes.map((n) => n.cur.y);
    const pad = isTree() ? NODE_W / 2 + 40 : 180;
    const b = { x: Math.min(...xs) - pad, y: Math.min(...ys) - 60, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + 120 };
    const { w, h } = viewport();
    const k = Math.min(w / b.w, h / b.h, 1.1);
    svg.transition('zoom').duration(750).call(zoom.transform,
      d3.zoomIdentity.translate(w / 2 - k * (b.x + b.w / 2), h / 2 - k * (b.y + b.h / 2)).scale(k));
  }

  // ---------------------------------------------------------------- sidebar
  function renderStats() {
    const real = state.all.filter((d) => !d.data.virtual);
    const levels = d3.max(real, (d) => d.depth) + 1;
    const leaves = real.filter((d) => !d.kids).length;
    const widest = real.reduce((m, d) => ((d.kids ? d.kids.length : 0) > (m.kids ? m.kids.length : 0) ? d : m), real[0]);
    els.stats.innerHTML = `
      <div class="stat"><b data-count="${real.length}">0</b><span>Unidades</span></div>
      <div class="stat"><b data-count="${levels}">0</b><span>Níveis hierárquicos</span></div>
      <div class="stat"><b data-count="${leaves}">0</b><span>Unidades finais</span></div>
      <div class="stat"><b data-count="${state.model.edges.length}">0</b><span>Vínculos</span></div>
      <div class="stat wide"><b>${esc(widest.data.label)}</b><span>Maior amplitude · ${plural(widest.kids ? widest.kids.length : 0, 'subordinado direto', 'subordinados diretos')}</span></div>`;
    els.stats.querySelectorAll('[data-count]').forEach((el) => {
      const target = +el.dataset.count;
      d3.select(el).transition().duration(1200).ease(d3.easeCubicOut)
        .tween('text', () => { const i = d3.interpolateRound(0, target); return (t) => { el.textContent = i(t); }; });
    });
  }

  function renderLegend() {
    const counts = d3.rollup(state.all.filter((d) => !d.data.virtual), (v) => v.length, (d) => d.data.cls);
    const order = [...Object.keys(state.model.classDefs), ...[...counts.keys()].filter((c) => !(c in state.model.classDefs))];
    const max = d3.max([...counts.values()]) || 1;
    els.legend.innerHTML = order.filter((c) => counts.get(c)).map((c) => {
      const s = styleOf(c);
      const n = counts.get(c);
      return `<li tabindex="0" data-cls="${esc(c ?? '')}">
        <span class="swatch" style="--c:${s.fill};--s:${s.stroke};--w:${Math.max(1.5, s.sw)}px"></span>
        <span class="name">${esc(className(c))}<div class="bar" style="--s:${s.stroke};width:${(n / max) * 100}%"></div></span>
        <span class="count">${n}</span>
      </li>`;
    }).join('');
  }

  function classFocus(cls) {
    svg.classed('class-focus', cls != null);
    gNodes.selectAll('g.node').classed('cf', (d) => cls != null && (d.data.cls ?? '') === cls);
  }
  els.legend.addEventListener('mouseover', (e) => { const li = e.target.closest('li'); if (li) classFocus(li.dataset.cls); });
  els.legend.addEventListener('mouseleave', () => classFocus(null));
  els.legend.addEventListener('focusin', (e) => { const li = e.target.closest('li'); if (li) classFocus(li.dataset.cls); });
  els.legend.addEventListener('focusout', () => classFocus(null));

  // ---------------------------------------------------------------- search
  function runSearch() {
    const q = norm(els.search.value.trim());
    if (!q) {
      state.matches = new Set();
      els.results.hidden = true;
      applyHighlight();
      return;
    }
    const hits = state.all.filter((d) => !d.data.virtual && (norm(d.data.label).includes(q) || norm(d.data.id) === q));
    hits.sort((a, b) => norm(a.data.label).indexOf(q) - norm(b.data.label).indexOf(q) || a.depth - b.depth);
    state.matches = new Set(hits);
    state.resultIdx = 0;
    applyHighlight();

    if (!hits.length) {
      els.results.innerHTML = '<li class="empty">Nenhuma unidade encontrada</li>';
    } else {
      els.results.innerHTML = hits.slice(0, 14).map((d, i) => {
        const s = styleOf(d.data.cls);
        const label = d.data.label;
        const at = norm(label).indexOf(q);
        const hl = at >= 0
          ? `${esc(label.slice(0, at))}<mark>${esc(label.slice(at, at + q.length))}</mark>${esc(label.slice(at + q.length))}`
          : esc(label);
        const path = d.ancestors().slice(1).reverse().filter((a) => !a.data.virtual).map((a) => a.data.label).join(' › ');
        return `<li role="option" data-id="${esc(d.data.id)}" class="${i === 0 ? 'active' : ''}">
          <i class="dot" style="--c:${s.fill};--s:${s.stroke}"></i>
          <div class="r-text"><div class="r-label">${hl}</div><div class="r-path">${esc(path || 'Topo')}</div></div>
        </li>`;
      }).join('');
    }
    els.results.hidden = false;
  }

  function pickResult(id) {
    const d = state.byId.get(id);
    if (!d) return;
    els.results.hidden = true;
    els.search.blur();
    reveal(d);
  }

  els.search.addEventListener('input', runSearch);
  els.search.addEventListener('focus', () => { if (els.search.value.trim()) runSearch(); });
  els.search.addEventListener('keydown', (e) => {
    const items = [...els.results.querySelectorAll('li[data-id]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      state.resultIdx = (state.resultIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.classList.toggle('active', i === state.resultIdx));
      items[state.resultIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (items[state.resultIdx]) pickResult(items[state.resultIdx].dataset.id);
    } else if (e.key === 'Escape') {
      els.search.value = '';
      runSearch();
      els.search.blur();
    }
  });
  els.results.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) { e.preventDefault(); pickResult(li.dataset.id); }
  });
  els.search.addEventListener('blur', () => setTimeout(() => { els.results.hidden = true; }, 120));

  // ---------------------------------------------------------------- mermaid view
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  async function renderMermaid() {
    if (!state.mermaidDirty) return;
    if (!window.mermaid) {
      els.mermaidInner.innerHTML = '<div class="mermaid-error">Não foi possível carregar a biblioteca Mermaid.</div>';
      return;
    }
    els.mermaidInner.innerHTML = '<div class="loading">Renderizando…</div>';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDark() ? 'dark' : 'default',
      fontFamily: FONT,
      flowchart: { curve: 'basis', nodeSpacing: 28, rankSpacing: 64, padding: 12 },
    });
    try {
      const { svg: out } = await mermaid.render(`mmd-${++state.mermaidSeq}`, state.source);
      els.mermaidInner.innerHTML = out;
      const s = els.mermaidInner.querySelector('svg');
      const vb = s.viewBox.baseVal;
      s.setAttribute('width', vb.width);
      s.setAttribute('height', vb.height);
      s.style.maxWidth = 'none';
      state.mermaidDirty = false;
      fitMermaid(true);
    } catch (err) {
      els.mermaidInner.innerHTML = `<div class="mermaid-error">${esc(err.message || err)}</div>`;
      d3.select(els.mermaidView).call(mZoom.transform, d3.zoomIdentity);
    }
  }

  function fitMermaid(instant = false) {
    const s = els.mermaidInner.querySelector('svg');
    if (!s) return;
    const vb = s.viewBox.baseVal;
    const r = els.stage.getBoundingClientRect();
    const top = 64;
    const k = Math.min((r.width - 60) / vb.width, (r.height - top - 60) / vb.height, 1.2);
    const tr = d3.zoomIdentity.translate((r.width - vb.width * k) / 2, top + (r.height - top - vb.height * k) / 2).scale(k);
    const sel = d3.select(els.mermaidView);
    (instant ? sel : sel.transition().duration(600)).call(mZoom.transform, tr);
  }

  // ---------------------------------------------------------------- modes
  function setMode(mode) {
    state.mode = mode;
    store.set('org.mode', mode);
    document.querySelectorAll('.tab').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    moveIndicator();
    els.app.classList.toggle('mode-mermaid', mode === 'mermaid');
    if (mode === 'mermaid') {
      els.svg.hidden = true;
      els.mermaidView.hidden = false;
      select(null);
      renderMermaid().then(() => {
        const k = d3.zoomTransform(els.mermaidView).k;
        els.zoomLabel.textContent = `${Math.round(k * 100)}%`;
      });
    } else {
      els.mermaidView.hidden = true;
      els.svg.hidden = false;
      const sel = state.selected;
      resetView();
      if (sel) { state.selected = sel; applyHighlight(); }
    }
  }

  function moveIndicator() {
    const active = document.querySelector('.tab.active');
    if (!active) return;
    els.tabIndicator.style.width = `${active.offsetWidth}px`;
    els.tabIndicator.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  }

  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.mode !== state.mode) setMode(b.dataset.mode);
  }));
  window.addEventListener('resize', moveIndicator);

  // ---------------------------------------------------------------- export
  function exportSVG() {
    let text;
    if (state.mode === 'mermaid') {
      const s = els.mermaidInner.querySelector('svg');
      if (!s) return;
      text = new XMLSerializer().serializeToString(s);
    } else {
      const b = bounds();
      const css = getComputedStyle(document.documentElement);
      const v = (n) => css.getPropertyValue(n).trim();
      const clone = els.svg.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('class');
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
      clone.setAttribute('width', b.w);
      clone.setAttribute('height', b.h);
      clone.querySelector('.viewport').removeAttribute('transform');
      clone.querySelectorAll('.pulse').forEach((n) => n.remove());
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap');
        .link{fill:none;stroke:${v('--link')};stroke-width:1.6px}
        .toggle circle{stroke:${v('--bg')};stroke-width:2.5px}
        .toggle text{fill:#fff;font-size:10.5px;font-weight:800}
        .rlabel{fill:${v('--text')};paint-order:stroke;stroke:${v('--bg')};stroke-width:4px;stroke-linejoin:round}
        .collapsed .dot-node{stroke-dasharray:3 2.5}`;
      clone.insertBefore(style, clone.firstChild);
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, fill: v('--bg') }).forEach(([k, val]) => bg.setAttribute(k, val));
      clone.querySelector('.viewport').before(bg);
      text = new XMLSerializer().serializeToString(clone);
    }
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', text], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `organograma-${state.mode}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- toolbar / misc
  $('#expandBtn').addEventListener('click', () => { expandAll(); update(state.root); setTimeout(() => fit(), 20); });
  $('#collapseBtn').addEventListener('click', () => {
    select(null); collapseTo(INITIAL_DEPTH); update(state.root); setTimeout(() => fit(), 20);
  });
  $('#fitBtn').addEventListener('click', () => fit());
  $('#exportBtn').addEventListener('click', exportSVG);
  $('#zoomIn').addEventListener('click', () => zoomBy(1.3));
  $('#zoomOut').addEventListener('click', () => zoomBy(1 / 1.3));

  $('#themeBtn').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('org.theme', next);
    state.mermaidDirty = true;
    if (state.mode === 'mermaid') renderMermaid();
  });

  function toggleSidebar(open) {
    els.sidebar.classList.toggle('open', open);
    els.scrim.classList.toggle('open', open);
  }
  $('#menuBtn').addEventListener('click', () => toggleSidebar(!els.sidebar.classList.contains('open')));
  els.scrim.addEventListener('click', () => toggleSidebar(false));

  function dismissHint() { els.hint.classList.add('gone'); }
  setTimeout(dismissHint, 7000);

  // editor
  function setMsg(text, kind = '') { els.editorMsg.textContent = text; els.editorMsg.className = `editor-msg ${kind}`; }
  $('#applyBtn').addEventListener('click', () => {
    try {
      load(els.editor.value);
      setMsg(`✓ ${state.model.nodes.size} nós, ${state.model.edges.length} vínculos`, 'ok');
      if (state.mode === 'mermaid') renderMermaid(); else resetView();
    } catch (err) {
      setMsg(err.message, 'err');
    }
  });
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(els.editor.value); setMsg('Copiado para a área de transferência', 'ok'); }
    catch { els.editor.select(); setMsg('Selecionado — use Ctrl+C', ''); }
  });
  $('#resetBtn').addEventListener('click', () => {
    els.editor.value = window.ORG_SOURCE;
    $('#applyBtn').click();
  });
  els.editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en, value } = els.editor;
      els.editor.value = value.slice(0, s) + '    ' + value.slice(en);
      els.editor.selectionStart = els.editor.selectionEnd = s + 4;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      $('#applyBtn').click();
    }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === '/') { e.preventDefault(); els.search.focus(); els.search.select(); }
    else if (k === 'f') fit();
    else if (k === 'e' && state.mode !== 'mermaid') $('#expandBtn').click();
    else if (k === 'c' && state.mode !== 'mermaid') $('#collapseBtn').click();
    else if (k === '1') setMode('tree');
    else if (k === '2') setMode('radial');
    else if (k === '3') setMode('mermaid');
    else if (k === '+' || k === '=') zoomBy(1.3);
    else if (k === '-') zoomBy(1 / 1.3);
    else if (e.key === 'Escape') { select(null); toggleSidebar(false); }
  });

  // ---------------------------------------------------------------- boot
  const savedTheme = store.get('org.theme');
  if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.dataset.theme = savedTheme;

  async function boot() {
    els.editor.value = state.source;
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* ignore */ }
    load(state.source);
    setMode(state.mode);
    if (state.mode !== 'mermaid') fit(true);
  }
  boot();
})();
