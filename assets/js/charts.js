/* ==========================================================================
   Chart.js —— 零依赖轻量 SVG 图表库（离线可用，无 CDN 依赖）
   支持：折线/面积、柱状（分组/堆叠）、折柱组合、横向排名条、环形、
        半环仪表、雷达、热力图、迷你 sparkline、桑基式流向
   ========================================================================== */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f4586e', '#2dd4bf', '#fbbf24', '#f472b6'];

  function el(tag, attrs, txt) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]); }
    if (txt !== undefined) n.textContent = txt;
    return n;
  }
  function uid(p) { return p + Math.random().toString(36).slice(2, 8); }
  function nice(v, d) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    if (d !== undefined) return Number(v).toFixed(d);
    const a = Math.abs(v);
    if (a >= 10000) return (v / 10000).toFixed(a >= 100000 ? 1 : 2) + '万';
    if (a >= 100) return Math.round(v).toLocaleString();
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function axisTicks(min, max, count) {
    count = count || 5;
    if (min === max) { min -= 1; max += 1; }
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  /* ---------- tooltip ---------- */
  let tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showTip(html, ev) {
    const t = tip(); t.innerHTML = html; t.style.opacity = '1';
    const r = t.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY - r.height / 2;
    if (x + r.width > innerWidth - 10) x = ev.clientX - r.width - 14;
    if (y < 8) y = 8;
    if (y + r.height > innerHeight - 8) y = innerHeight - r.height - 8;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = '0'; }

  /* ---------- mount with resize ---------- */
  function mount(host, draw) {
    host = typeof host === 'string' ? document.querySelector(host) : host;
    if (!host) return;
    const run = () => {
      const w = host.clientWidth, h = host.clientHeight || 240;
      if (w < 30) return;
      host.innerHTML = '';
      const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, style: 'overflow:visible' });
      host.appendChild(svg);
      draw(svg, w, h);
    };
    run();
    if (global.ResizeObserver) {
      let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(run, 120); }).observe(host);
    }
    host.addEventListener('mouseleave', hideTip);
  }

  function grid(svg, x0, y0, w, h, ticks, scaleY, opt) {
    opt = opt || {};
    ticks.forEach(t => {
      const y = scaleY(t);
      if (y < y0 - 1 || y > y0 + h + 1) return;
      svg.appendChild(el('line', { x1: x0, y1: y, x2: x0 + w, y2: y, stroke: 'rgba(125,158,214,.10)', 'stroke-dasharray': '3 4' }));
      svg.appendChild(el('text', {
        x: x0 - 7, y: y + 3.5, 'text-anchor': 'end', fill: '#5c6d8b', 'font-size': 10, 'font-family': 'var(--mono)'
      }, opt.fmt ? opt.fmt(t) : nice(t)));
    });
  }

  /* ======================= 折线 / 面积 ======================= */
  function line(host, o) {
    mount(host, (svg, W, H) => {
      const pad = Object.assign({ t: 14, r: o.y2 ? 46 : 16, b: 26, l: 44 }, o.pad || {});
      const x0 = pad.l, y0 = pad.t, w = W - pad.l - pad.r, h = H - pad.t - pad.b;
      const xs = o.xLabels, n = xs.length;
      const series = o.series.filter(s => !s.hidden);
      const left = series.filter(s => !s.axis2), right = series.filter(s => s.axis2);

      const vals = arr => arr.reduce((a, s) => a.concat(s.data.filter(v => v !== null)), []);
      function scaleFor(list, isLeft) {
        const v = vals(list);
        if (!v.length) return { ticks: [0, 1], fn: () => y0 + h };
        let mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
        if (o.markLines) o.markLines.forEach(m => { if (!!m.axis2 !== isLeft) { mn = Math.min(mn, m.value); mx = Math.max(mx, m.value); } });
        const pad2 = (mx - mn) * .16 || Math.abs(mx * .1) || 1;
        const t = axisTicks(o.min !== undefined ? o.min : mn - pad2, mx + pad2, o.tickCount || 4);
        const lo = t[0], hi = t[t.length - 1];
        return { ticks: t, fn: v => y0 + h - ((v - lo) / (hi - lo)) * h };
      }
      const sL = scaleFor(left, true);
      const sR = right.length ? scaleFor(right, false) : null;
      const sx = i => n === 1 ? x0 + w / 2 : x0 + (i / (n - 1)) * w;

      grid(svg, x0, y0, w, h, sL.ticks, sL.fn, { fmt: o.yFmt });
      if (sR) sR.ticks.forEach(t => {
        const y = sR.fn(t);
        svg.appendChild(el('text', { x: x0 + w + 7, y: y + 3.5, fill: '#5c6d8b', 'font-size': 10, 'font-family': 'var(--mono)' }, o.y2Fmt ? o.y2Fmt(t) : nice(t)));
      });

      // x labels
      const every = o.xEvery || Math.max(1, Math.ceil(n / (w / 62)));
      xs.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        svg.appendChild(el('text', { x: sx(i), y: y0 + h + 15, 'text-anchor': 'middle', fill: '#5c6d8b', 'font-size': 10 }, lb));
      });

      // mark lines
      (o.markLines || []).forEach(m => {
        const y = (m.axis2 && sR ? sR : sL).fn(m.value);
        svg.appendChild(el('line', { x1: x0, y1: y, x2: x0 + w, y2: y, stroke: m.color || '#fbbf24', 'stroke-width': 1.2, 'stroke-dasharray': '5 4', opacity: .85 }));
        if (m.label) {
          const tw = m.label.length * 6.2 + 10;
          const g = el('g');
          g.appendChild(el('rect', { x: x0 + w - tw, y: y - 15, width: tw, height: 14, rx: 3, fill: m.color || '#fbbf24', opacity: .16 }));
          g.appendChild(el('text', { x: x0 + w - tw + 5, y: y - 4.5, fill: m.color || '#fbbf24', 'font-size': 9.5, 'font-weight': 700 }, m.label));
          svg.appendChild(g);
        }
      });

      // bands (背景区间标注)
      (o.bands || []).forEach(b => {
        const a = sx(b.from), c = sx(b.to);
        svg.appendChild(el('rect', { x: a, y: y0, width: Math.max(2, c - a), height: h, fill: b.color || 'rgba(244,88,110,.09)' }));
        if (b.label) svg.appendChild(el('text', { x: (a + c) / 2, y: y0 + 11, 'text-anchor': 'middle', fill: b.textColor || '#f4586e', 'font-size': 9.5, 'font-weight': 700 }, b.label));
      });

      series.forEach((s, si) => {
        const sc = (s.axis2 && sR ? sR : sL).fn;
        const color = s.color || PALETTE[si % PALETTE.length];
        const pts = s.data.map((v, i) => v === null ? null : [sx(i), sc(v)]).filter(Boolean);
        if (!pts.length) return;
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        if (s.area) {
          const gid = uid('g');
          const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          lg.appendChild(el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': s.areaOpacity || .32 }));
          lg.appendChild(el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
          svg.appendChild(lg);
          svg.appendChild(el('path', { d: d + ` L${pts[pts.length - 1][0]} ${y0 + h} L${pts[0][0]} ${y0 + h} Z`, fill: `url(#${gid})` }));
        }
        svg.appendChild(el('path', {
          d, fill: 'none', stroke: color, 'stroke-width': s.width || 2,
          'stroke-dasharray': s.dashed ? '5 4' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          opacity: s.opacity || 1
        }));
        if (s.dots !== false && n <= 40) pts.forEach(p => svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: s.dotR || 2.4, fill: '#0a1220', stroke: color, 'stroke-width': 1.6 })));
      });

      // hover layer
      const hl = el('line', { x1: 0, y1: y0, x2: 0, y2: y0 + h, stroke: 'rgba(56,189,248,.5)', 'stroke-width': 1, opacity: 0 });
      svg.appendChild(hl);
      const hoverDots = el('g', { opacity: 0 }); svg.appendChild(hoverDots);
      const cap = el('rect', { x: x0, y: y0, width: w, height: h, fill: 'transparent' });
      svg.appendChild(cap);
      cap.addEventListener('mousemove', ev => {
        const bb = svg.getBoundingClientRect();
        const rel = ev.clientX - bb.left - x0;
        let i = Math.round((rel / w) * (n - 1)); i = Math.max(0, Math.min(n - 1, i));
        hl.setAttribute('x1', sx(i)); hl.setAttribute('x2', sx(i)); hl.setAttribute('opacity', 1);
        hoverDots.innerHTML = ''; hoverDots.setAttribute('opacity', 1);
        let html = `<div class="tt-t">${o.tipTitle ? o.tipTitle(xs[i], i) : xs[i]}</div>`;
        series.forEach((s, si) => {
          const v = s.data[i]; if (v === null || v === undefined) return;
          const color = s.color || PALETTE[si % PALETTE.length];
          const sc = (s.axis2 && sR ? sR : sL).fn;
          hoverDots.appendChild(el('circle', { cx: sx(i), cy: sc(v), r: 4, fill: color, stroke: '#050a14', 'stroke-width': 2 }));
          html += `<div class="tt-r"><i style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block"></i><span>${s.name}</span><b>${(s.fmt || o.tipFmt || nice)(v)}${s.unit || ''}</b></div>`;
        });
        showTip(html, ev);
      });
      cap.addEventListener('mouseleave', () => { hl.setAttribute('opacity', 0); hoverDots.setAttribute('opacity', 0); hideTip(); });
    });
  }

  /* ======================= 柱状 / 折柱组合 ======================= */
  function bar(host, o) {
    mount(host, (svg, W, H) => {
      const pad = Object.assign({ t: 14, r: o.lineSeries ? 44 : 14, b: 26, l: 44 }, o.pad || {});
      const x0 = pad.l, y0 = pad.t, w = W - pad.l - pad.r, h = H - pad.t - pad.b;
      const xs = o.xLabels, n = xs.length;
      const bs = o.series || [];
      const stacked = !!o.stacked;

      let mx = 0, mn = 0;
      if (stacked) xs.forEach((_, i) => { let s = 0; bs.forEach(b => s += (b.data[i] || 0)); mx = Math.max(mx, s); });
      else bs.forEach(b => b.data.forEach(v => { mx = Math.max(mx, v); mn = Math.min(mn, v); }));
      const t = axisTicks(mn, mx * 1.12 || 1, o.tickCount || 4);
      const lo = t[0], hi = t[t.length - 1];
      const sy = v => y0 + h - ((v - lo) / (hi - lo)) * h;
      grid(svg, x0, y0, w, h, t, sy, { fmt: o.yFmt });

      const slot = w / n;
      const gw = slot * (o.bandWidth || .62);
      const bw = stacked ? gw : gw / bs.length;

      const every = o.xEvery || Math.max(1, Math.ceil(n / Math.max(1, w / 46)));
      xs.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        const cx = x0 + slot * i + slot / 2;
        svg.appendChild(el('text', { x: cx, y: y0 + h + 15, 'text-anchor': 'middle', fill: '#5c6d8b', 'font-size': 10 }, lb));
      });

      bs.forEach((s, si) => {
        const color = s.color || PALETTE[si % PALETTE.length];
        let acc = new Array(n).fill(0);
        s.data.forEach((v, i) => {
          if (v === null || v === undefined) return;
          const cx = x0 + slot * i + slot / 2;
          const bx = stacked ? cx - gw / 2 : cx - gw / 2 + si * bw;
          let yTop, hh;
          if (stacked) {
            const base = bs.slice(0, si).reduce((a, b) => a + (b.data[i] || 0), 0);
            yTop = sy(base + v); hh = sy(base) - sy(base + v);
          } else { yTop = sy(Math.max(0, v)); hh = Math.abs(sy(v) - sy(0)); }
          const r = el('rect', {
            x: bx + (stacked ? 0 : bw * .1), y: yTop, width: (stacked ? bw : bw * .8), height: Math.max(1, hh),
            rx: o.round === false ? 0 : 3, fill: color, opacity: s.opacity || .88
          });
          r.addEventListener('mousemove', ev => {
            let html = `<div class="tt-t">${xs[i]}</div>`;
            bs.forEach((b, bi) => {
              const bv = b.data[i]; if (bv === null || bv === undefined) return;
              const c = b.color || PALETTE[bi % PALETTE.length];
              html += `<div class="tt-r"><i style="width:8px;height:8px;border-radius:2px;background:${c};display:inline-block"></i><span>${b.name}</span><b>${(b.fmt || nice)(bv)}${b.unit || ''}</b></div>`;
            });
            (o.lineSeries || []).forEach(l => {
              html += `<div class="tt-r"><i style="width:8px;height:2px;background:${l.color};display:inline-block"></i><span>${l.name}</span><b>${(l.fmt || nice)(l.data[i])}${l.unit || ''}</b></div>`;
            });
            showTip(html, ev);
          });
          r.addEventListener('mouseleave', hideTip);
          svg.appendChild(r);
        });
      });

      if (o.lineSeries) {
        const all = o.lineSeries.reduce((a, s) => a.concat(s.data), []);
        const t2 = axisTicks(Math.min.apply(null, all) * .96, Math.max.apply(null, all) * 1.05, 4);
        const l2 = t2[0], h2 = t2[t2.length - 1];
        const sy2 = v => y0 + h - ((v - l2) / (h2 - l2)) * h;
        t2.forEach(tv => svg.appendChild(el('text', { x: x0 + w + 6, y: sy2(tv) + 3.5, fill: '#5c6d8b', 'font-size': 10, 'font-family': 'var(--mono)' }, nice(tv))));
        o.lineSeries.forEach(s => {
          const pts = s.data.map((v, i) => [x0 + slot * i + slot / 2, sy2(v)]);
          svg.appendChild(el('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' '), fill: 'none', stroke: s.color || '#fbbf24', 'stroke-width': 2, 'stroke-dasharray': s.dashed ? '5 4' : null }));
          pts.forEach(p => svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 2.6, fill: '#0a1220', stroke: s.color || '#fbbf24', 'stroke-width': 1.6 })));
        });
      }
    });
  }

  /* ======================= 横向排名条 ======================= */
  function rank(host, o) {
    mount(host, (svg, W, H) => {
      const items = o.items;
      const labelW = o.labelW || 118, valW = o.valW || 58;
      const rowH = H / items.length;
      const bw = W - labelW - valW;
      const mx = Math.max.apply(null, items.map(i => Math.abs(i.value))) || 1;
      items.forEach((it, i) => {
        const cy = rowH * i + rowH / 2;
        const bh = Math.min(o.barH || 9, rowH - 8);
        svg.appendChild(el('text', { x: 0, y: cy + 3.6, fill: it.labelColor || '#9db0d0', 'font-size': 11 }, it.label));
        svg.appendChild(el('rect', { x: labelW, y: cy - bh / 2, width: bw, height: bh, rx: bh / 2, fill: 'rgba(125,158,214,.10)' }));
        const wpx = Math.max(2, (Math.abs(it.value) / mx) * bw);
        const gid = uid('r');
        const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 0 });
        const c = it.color || PALETTE[i % PALETTE.length];
        lg.appendChild(el('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': .55 }));
        lg.appendChild(el('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': 1 }));
        svg.appendChild(lg);
        const r = el('rect', { x: labelW, y: cy - bh / 2, width: wpx, height: bh, rx: bh / 2, fill: `url(#${gid})` });
        r.addEventListener('mousemove', ev => showTip(`<div class="tt-t">${it.label}</div><div class="tt-r"><span>${o.metric || '数值'}</span><b>${(o.fmt || nice)(it.value)}${o.unit || ''}</b></div>${it.note ? `<div class="tt-r"><span>${it.note}</span></div>` : ''}`, ev));
        r.addEventListener('mouseleave', hideTip);
        svg.appendChild(r);
        svg.appendChild(el('text', { x: W, y: cy + 3.6, 'text-anchor': 'end', fill: it.valColor || '#e8eefb', 'font-size': 11, 'font-weight': 600, 'font-family': 'var(--mono)' }, (o.fmt || nice)(it.value) + (o.unit || '')));
      });
    });
  }

  /* ======================= 环形 ======================= */
  function donut(host, o) {
    mount(host, (svg, W, H) => {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 6, r = R * (o.inner || .64);
      const total = o.items.reduce((a, i) => a + i.value, 0) || 1;
      let ang = -Math.PI / 2;
      o.items.forEach((it, i) => {
        const a2 = ang + (it.value / total) * Math.PI * 2;
        const large = a2 - ang > Math.PI ? 1 : 0;
        const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
        const [x1, y1] = p(R, ang), [x2, y2] = p(R, a2), [x3, y3] = p(r, a2), [x4, y4] = p(r, ang);
        const path = el('path', {
          d: `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`,
          fill: it.color || PALETTE[i % PALETTE.length], opacity: .9, style: 'transition:opacity .15s'
        });
        path.addEventListener('mousemove', ev => { path.setAttribute('opacity', 1); showTip(`<div class="tt-r"><i style="width:8px;height:8px;border-radius:2px;background:${it.color || PALETTE[i % PALETTE.length]};display:inline-block"></i><span>${it.label}</span><b>${nice(it.value)}${o.unit || ''}</b></div><div class="tt-r"><span>占比</span><b>${(it.value / total * 100).toFixed(1)}%</b></div>`, ev); });
        path.addEventListener('mouseleave', () => { path.setAttribute('opacity', .9); hideTip(); });
        svg.appendChild(path);
        ang = a2;
      });
      if (o.centerVal !== undefined) {
        svg.appendChild(el('text', { x: cx, y: cy - 1, 'text-anchor': 'middle', fill: '#fff', 'font-size': o.centerSize || 20, 'font-weight': 700, 'font-family': 'var(--mono)' }, o.centerVal));
        if (o.centerLabel) svg.appendChild(el('text', { x: cx, y: cy + 15, 'text-anchor': 'middle', fill: '#6a7d9d', 'font-size': 10.5 }, o.centerLabel));
      }
    });
  }

  /* ======================= 半环仪表 ======================= */
  function gauge(host, o) {
    mount(host, (svg, W, H) => {
      const cx = W / 2, cy = H * .78, R = Math.min(W / 2 - 12, H * .74);
      const th = o.thickness || 13;
      const A0 = Math.PI, A1 = 0;
      const val = Math.max(o.min || 0, Math.min(o.max || 100, o.value));
      const pct = (val - (o.min || 0)) / ((o.max || 100) - (o.min || 0));
      const arc = (a, b, rad, w2, fill, op) => {
        const p = (r2, a2) => [cx + r2 * Math.cos(a2), cy + r2 * Math.sin(a2)];
        const ro = rad, ri = rad - w2;
        const [x1, y1] = p(ro, a), [x2, y2] = p(ro, b), [x3, y3] = p(ri, b), [x4, y4] = p(ri, a);
        const large = Math.abs(b - a) > Math.PI ? 1 : 0;
        return el('path', { d: `M${x1} ${y1} A${ro} ${ro} 0 ${large} ${b > a ? 1 : 0} ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${large} ${b > a ? 0 : 1} ${x4} ${y4} Z`, fill, opacity: op });
      };
      // 分段底色
      const segs = o.segments || [{ to: .4, color: '#34d399' }, { to: .7, color: '#fb923c' }, { to: 1, color: '#f4586e' }];
      let from = 0;
      segs.forEach(s => { svg.appendChild(arc(A0 + from * Math.PI, A0 + s.to * Math.PI, R, th, s.color, .17)); from = s.to; });
      // 值弧
      const cur = segs.find(s => pct <= s.to) || segs[segs.length - 1];
      svg.appendChild(arc(A0, A0 + Math.max(.004, pct) * Math.PI, R, th, o.color || cur.color, .95));
      // 指针
      const a = A0 + pct * Math.PI;
      const px = cx + (R - th - 5) * Math.cos(a), py = cy + (R - th - 5) * Math.sin(a);
      svg.appendChild(el('line', { x1: cx, y1: cy, x2: px, y2: py, stroke: '#e8eefb', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      svg.appendChild(el('circle', { cx, cy, r: 4, fill: '#0a1220', stroke: '#e8eefb', 'stroke-width': 2 }));
      svg.appendChild(el('text', { x: cx, y: cy - 22, 'text-anchor': 'middle', fill: o.color || cur.color, 'font-size': o.size || 27, 'font-weight': 700, 'font-family': 'var(--mono)' }, o.display !== undefined ? o.display : nice(val, o.digits)));
      if (o.label) svg.appendChild(el('text', { x: cx, y: cy + 19, 'text-anchor': 'middle', fill: '#9db0d0', 'font-size': 11, 'font-weight': 600 }, o.label));
      svg.appendChild(el('text', { x: cx - R + th / 2, y: cy + 15, 'text-anchor': 'middle', fill: '#4c5c76', 'font-size': 9.5 }, String(o.min || 0)));
      svg.appendChild(el('text', { x: cx + R - th / 2, y: cy + 15, 'text-anchor': 'middle', fill: '#4c5c76', 'font-size': 9.5 }, String(o.max || 100)));
    });
  }

  /* ======================= 雷达 ======================= */
  function radar(host, o) {
    mount(host, (svg, W, H) => {
      const cx = W / 2, cy = H / 2 + 2, R = Math.min(W, H) / 2 - 30;
      const ax = o.axes, k = ax.length;
      const ang = i => -Math.PI / 2 + (i / k) * Math.PI * 2;
      for (let ring = 1; ring <= 4; ring++) {
        const rr = R * ring / 4;
        const pts = ax.map((_, i) => [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))]);
        svg.appendChild(el('polygon', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(125,158,214,.13)' }));
      }
      ax.forEach((a, i) => {
        const x = cx + R * Math.cos(ang(i)), y = cy + R * Math.sin(ang(i));
        svg.appendChild(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: 'rgba(125,158,214,.13)' }));
        const lx = cx + (R + 15) * Math.cos(ang(i)), ly = cy + (R + 15) * Math.sin(ang(i));
        svg.appendChild(el('text', {
          x: lx, y: ly + 3.5, 'text-anchor': Math.abs(lx - cx) < 6 ? 'middle' : (lx > cx ? 'start' : 'end'),
          fill: '#9db0d0', 'font-size': 10.5
        }, a));
      });
      (o.series || []).forEach((s, si) => {
        const c = s.color || PALETTE[si % PALETTE.length];
        const pts = s.data.map((v, i) => {
          const rr = R * Math.max(0, Math.min(1, v / (o.max || 100)));
          return [cx + rr * Math.cos(ang(i)), cy + rr * Math.sin(ang(i))];
        });
        svg.appendChild(el('polygon', { points: pts.map(p => p.join(',')).join(' '), fill: c, 'fill-opacity': s.opacity || .18, stroke: c, 'stroke-width': 1.8 }));
        pts.forEach((p, i) => {
          const d = el('circle', { cx: p[0], cy: p[1], r: 3, fill: c, stroke: '#050a14', 'stroke-width': 1.4 });
          d.addEventListener('mousemove', ev => showTip(`<div class="tt-t">${ax[i]}</div><div class="tt-r"><span>${s.name}</span><b>${s.data[i]}</b></div>`, ev));
          d.addEventListener('mouseleave', hideTip);
          svg.appendChild(d);
        });
      });
    });
  }

  /* ======================= 热力图 ======================= */
  function heatmap(host, o) {
    mount(host, (svg, W, H) => {
      const rows = o.rows, cols = o.cols, data = o.data; // data[r][c]
      const lw = o.labelW || 108, bh = o.bottomH || 22;
      const cw = (W - lw) / cols.length, ch = (H - bh) / rows.length;
      const flat = data.reduce((a, r) => a.concat(r), []);
      const mx = o.max !== undefined ? o.max : Math.max.apply(null, flat);
      const mn = o.min !== undefined ? o.min : Math.min.apply(null, flat);
      const colorOf = v => {
        const t = (v - mn) / ((mx - mn) || 1);
        const stops = o.stops || [[0, [52, 211, 153]], [.45, [251, 191, 36]], [.72, [251, 146, 60]], [1, [244, 88, 110]]];
        let a = stops[0], b = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
        const k = (t - a[0]) / ((b[0] - a[0]) || 1);
        const c = a[1].map((v2, i) => Math.round(v2 + (b[1][i] - v2) * k));
        return `rgba(${c[0]},${c[1]},${c[2]},${.22 + t * .74})`;
      };
      rows.forEach((rw, ri) => {
        svg.appendChild(el('text', { x: lw - 8, y: ch * ri + ch / 2 + 3.5, 'text-anchor': 'end', fill: '#9db0d0', 'font-size': 10.5 }, rw));
        cols.forEach((cl, ci) => {
          const v = data[ri][ci];
          const r = el('rect', {
            x: lw + cw * ci + 1.5, y: ch * ri + 1.5, width: cw - 3, height: ch - 3, rx: 3,
            fill: colorOf(v), class: 'heat-cell'
          });
          r.addEventListener('mousemove', ev => showTip(`<div class="tt-t">${rw} · ${cl}</div><div class="tt-r"><span>${o.metric || '指数'}</span><b>${nice(v, o.digits)}${o.unit || ''}</b></div>`, ev));
          r.addEventListener('mouseleave', hideTip);
          svg.appendChild(r);
          if (o.showVal && cw > 34) svg.appendChild(el('text', { x: lw + cw * ci + cw / 2, y: ch * ri + ch / 2 + 3.5, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.86)', 'font-size': 10, 'font-family': 'var(--mono)', 'pointer-events': 'none' }, nice(v, o.digits)));
        });
      });
      cols.forEach((cl, ci) => svg.appendChild(el('text', { x: lw + cw * ci + cw / 2, y: H - 6, 'text-anchor': 'middle', fill: '#5c6d8b', 'font-size': 10 }, cl)));
    });
  }

  /* ======================= sparkline ======================= */
  function spark(host, o) {
    mount(host, (svg, W, H) => {
      const d = o.data, n = d.length;
      const mn = Math.min.apply(null, d), mx = Math.max.apply(null, d);
      const sy = v => H - 3 - ((v - mn) / ((mx - mn) || 1)) * (H - 6);
      const sx = i => (i / (n - 1)) * W;
      const pts = d.map((v, i) => [sx(i), sy(v)]);
      const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      const c = o.color || '#38bdf8';
      if (o.area !== false) {
        const gid = uid('s');
        const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
        lg.appendChild(el('stop', { offset: '0%', 'stop-color': c, 'stop-opacity': .38 }));
        lg.appendChild(el('stop', { offset: '100%', 'stop-color': c, 'stop-opacity': 0 }));
        svg.appendChild(lg);
        svg.appendChild(el('path', { d: path + ` L${W} ${H} L0 ${H} Z`, fill: `url(#${gid})` }));
      }
      svg.appendChild(el('path', { d: path, fill: 'none', stroke: c, 'stroke-width': 1.7, 'stroke-linejoin': 'round' }));
      svg.appendChild(el('circle', { cx: pts[n - 1][0] - 1, cy: pts[n - 1][1], r: 2.4, fill: c }));
      if (o.bars) { /* reserved */ }
    });
  }

  /* ======================= 流向图（简化桑基） ======================= */
  function flow(host, o) {
    mount(host, (svg, W, H) => {
      const cols = o.columns; // [{title, nodes:[{id,label,value,color}]}]
      const colW = 116, gapX = (W - colW * cols.length) / (cols.length - 1 || 1);
      const posOf = {};
      cols.forEach((col, ci) => {
        const x = ci * (colW + gapX);
        const total = col.nodes.reduce((a, n2) => a + (n2.value || 1), 0);
        const gapY = 9, avail = H - 22 - gapY * (col.nodes.length - 1);
        let y = 22;
        svg.appendChild(el('text', { x: x + colW / 2, y: 11, 'text-anchor': 'middle', fill: '#6a7d9d', 'font-size': 10, 'font-weight': 700 }, col.title));
        col.nodes.forEach(nd => {
          const hh = Math.max(24, avail * ((nd.value || 1) / total));
          posOf[nd.id] = { x, y, w: colW, h: hh, cx: x + colW / 2, color: nd.color || '#38bdf8' };
          const g = el('g');
          g.appendChild(el('rect', { x, y, width: colW, height: hh, rx: 7, fill: (nd.color || '#38bdf8'), 'fill-opacity': .13, stroke: nd.color || '#38bdf8', 'stroke-opacity': .45 }));
          g.appendChild(el('text', { x: x + colW / 2, y: y + hh / 2 - (nd.sub ? 4 : -3.5), 'text-anchor': 'middle', fill: '#e8eefb', 'font-size': 10.8, 'font-weight': 600 }, nd.label));
          if (nd.sub) g.appendChild(el('text', { x: x + colW / 2, y: y + hh / 2 + 9, 'text-anchor': 'middle', fill: '#7f93b3', 'font-size': 9.5, 'font-family': 'var(--mono)' }, nd.sub));
          svg.appendChild(g);
          y += hh + gapY;
        });
      });
      (o.links || []).forEach(lk => {
        const a = posOf[lk.from], b = posOf[lk.to];
        if (!a || !b) return;
        const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
        const mx = (x1 + x2) / 2;
        svg.appendChild(el('path', {
          d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, fill: 'none',
          stroke: lk.color || a.color, 'stroke-width': lk.width || 1.6, opacity: lk.opacity || .38,
          'stroke-dasharray': lk.dashed ? '4 4' : null
        }));
      });
    });
  }

  global.Chart = { line, bar, rank, donut, gauge, radar, heatmap, spark, flow, nice, PALETTE, hideTip };
})(window);
