/* ==========================================================================
   App Shell —— 侧边导航 / 顶部栏 / AI 自然语言问答抽屉 / 通用组件
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------- 图标 ---------------- */
  const I = {
    home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H4a1 1 0 0 1-1-1z"/>',
    layers: '<path d="M12 2 2 7l10 5 10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01M2 13h2M20 13h2"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    wallet: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M16 14h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3C9 6.5 9 17.5 12 21"/>',
    flow: '<rect x="3" y="3" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/><path d="M6.5 9v5a4 4 0 0 0 4 4h3.5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.5-4.5"/>',
    spark: '<path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6.3 6.3 4.2 4.2M19.8 19.8l-2.1-2.1M17.7 6.3l2.1-2.1M4.2 19.8l2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M17 8.5a3.2 3.2 0 0 0 0-1M18 14c2.4.8 4 3.1 4 5.7"/>',
    truck: '<rect x="1" y="6" width="13" height="10" rx="1"/><path d="M14 9h4l4 4v3h-8z"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'
  };
  function icon(name, size, cls) {
    return `<svg class="ico ${cls || ''}" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[name] || ''}</svg>`;
  }

  /* ---------------- 导航配置 ---------------- */
  const NAV = [
    {
      g: '总览', items: [
        { k: 'index', t: '风控大脑总览', h: 'index.html', i: 'home' },
        { k: 'arch', t: '四层架构全景', h: 'architecture.html', i: 'layers' }
      ]
    },
    {
      g: '数据与模型', items: [
        { k: 'data', t: '数据接入层', h: 'data-source.html', i: 'db', tag: 'NEW' },
        { k: 'dict', t: '数据源字段规范', h: 'data-dictionary.html', i: 'file', tag: 'NEW' },
        { k: 'model', t: '模型引擎层', h: 'model-engine.html', i: 'cpu' },
        { k: 'agent', t: 'Agent 推理实录', h: 'agent-detail.html', i: 'bot' }
      ]
    },
    {
      g: '风险看板', items: [
        { k: 'inv', t: '库存风险看板', h: 'dashboard-inventory.html', i: 'box', n: 3 },
        { k: 'ar', t: '应收欠款风险看板', h: 'dashboard-receivable.html', i: 'wallet', n: 4 },
        { k: 'global', t: '全局经营风控总看板', h: 'dashboard-global.html', i: 'globe', n: 2 },
        { k: 'invoice', t: '发票税务风险看板', h: 'invoice-risk.html', i: 'file', tag: 'NEW' },
        { k: 'price', t: '采购智能定价预警', h: 'pricing-alert.html', i: 'trend', tag: 'NEW' }
      ]
    },
    {
      g: '执行与迭代', items: [
        { k: 'flow', t: '业务执行与预警', h: 'workflow.html', i: 'flow' },
        { k: 'gate', t: '发票风控闸口', h: 'invoice-gate.html', i: 'shield', tag: 'NEW' },
        { k: 'wheel', t: '数据飞轮与路线图', h: 'flywheel.html', i: 'refresh' }
      ]
    },
    {
      g: '开放能力', items: [
        { k: 'api', t: '开放 API 接口', h: 'open-api.html', i: 'plug', tag: 'NEW' },
        { k: 'embed', t: 'ERP 嵌入场景', h: 'erp-embed.html', i: 'file', tag: 'NEW' }
      ]
    }
  ];

  const TITLES = {
    api: ['开放能力', '开放 API 接口 · ERP 双向集成'],
    embed: ['开放能力', 'ERP 业务场景嵌入效果'],
    index: ['总览', '风控大脑总览'],
    arch: ['总览', '四层架构全景'],
    data: ['数据与模型', '第一层 · 数据接入层'],
    dict: ['数据与模型', '数据源字段规范（数据字典）'],
    model: ['数据与模型', '第二层 · 模型引擎层'],
    agent: ['数据与模型', 'Agent 智能体推理实录'],
    inv: ['风险看板', '库存风险看板'],
    ar: ['风险看板', '应收欠款风险看板'],
    global: ['风险看板', '全局经营风控总看板'],
    price: ['风险看板', '采购智能定价预警'],
    invoice: ['风险看板', '发票税务风险看板'],
    gate: ['执行与迭代', '发票风控闸口与证据链'],
    flow: ['执行与迭代', '第三层 · 业务执行与预警'],
    wheel: ['执行与迭代', '数据飞轮闭环与落地路线']
  };

  /* ---------------- AI 问答语料 ---------------- */
  const QA = [
    {
      q: '现在平台上抛货最多的钢材品类有哪些，对应我手上哪些库存会面临亏损，对应的下游客户哪些需要重点盯回款',
      a: `<div class="ai-hd">${icon('spark', 14)} 风控大脑 · 全局联动分析 <span class="m">耗时 4.2s · 检索 11 类数据源</span></div>
      <div class="ai-txt">
        <b style="color:#fff">① 平台抛货最集中的 3 个品类（近 3 日）</b><br>
        · <em>螺纹钢 HRB400E Φ20</em>：挂牌商户 83 家（+46），均价 3,472 元/吨，抛压指数 <span class="hl-red">91</span><br>
        · <em>热轧卷板 Q235B 3.0×1250</em>：挂牌商户 61 家（+27），均价 3,548 元/吨，抛压指数 <span class="hl-red">79</span><br>
        · <em>H型钢 Q235B 200×200</em>：挂牌商户 47 家（+22），均价 3,980 元/吨，抛压指数 68<br><br>
        <b style="color:#fff">② 你手上会面临亏损的库存（同业报价已低于库存成本）</b><br>
        · 螺纹钢 Φ20：4,260 吨，成本 3,598 → 市场 3,472，浮亏敞口 <span class="hl-red">53.7 万元</span>，库龄 47 天<br>
        · 热轧卷 3.0：2,980 吨，成本 3,605 → 市场 3,548，浮亏 <span class="hl-red">17.0 万元</span><br>
        · H型钢 200×200：1,520 吨，成本 4,072 → 市场 3,980，浮亏 <span class="hl-red">14.0 万元</span>，库龄 68 天<br>
        合计浮亏敞口约 <span class="hl-red">84.7 万元</span>，占这三类库存货值（3,226 万元）的 2.6%。<br><br>
        <b style="color:#fff">③ 需要重点盯回款的下游客户（建材抛货 → 地产链需求走弱传导）</b><br>
        · <em>宏基建设集团</em>：应收 1,080 万（逾期 386 万 / 63 天），新增被执行 1,240 万，坏账概率 <span class="hl-red">87%</span> — 最高优先级<br>
        · <em>正弘工程</em>：应收 742 万（逾期 214 万），经营异常＋股权冻结，坏账概率 76%<br>
        · <em>鼎晟置业</em>：应收 1,365 万，关联方失信 4,600 万，行业系统性上调至 68%<br>
        · <em>中远建工</em>：应收 934 万，新增工程款纠纷 890 万，坏账概率 63%<br>
        以上 4 家合计应收 <span class="hl-red">4,121 万元</span>，建议本周内全部完成对账并压缩账期。<br><br>
        <b style="color:#fff">④ 建议动作（3 条）</b><br>
        1. 螺纹钢 Φ20 立即启动 5 日 3 批降价出清 60%，并<em>暂停该品类新增采购</em>；<br>
        2. 对 4 家地产/工程类客户统一执行「款到发货 + 账期压缩」，宏基单独启动担保物谈判；<br>
        3. 用当前紧俏的镀锌卷、中厚板搭售螺纹钢与 H型钢，降低单纯降价的毛利损失。
      </div>`
    },
    {
      q: '螺纹钢这批货现在到底要不要降价，降多少合适',
      a: `<div class="ai-hd">${icon('spark', 14)} 风控大脑 · 处置方案测算</div>
      <div class="ai-txt">
        建议降价，且<em>宜早不宜晚</em>。判断依据：平台 83 家商户集中挂牌且报价 3 日连跌 126 元/吨，建材行情指数连续 7 日下行，成交情绪指数由 56 跌至 31，属于典型<em>抛压累积期</em>而非短期波动。<br><br>
        <b style="color:#fff">三套方案测算（4,260 吨，成本 3,598 元/吨）</b><br>
        · <b>方案A 快速出清</b>：挂 3,450 元/吨清 60%（2,556 吨）→ 预计 5 日内出货，亏损约 <span class="hl-red">37.8 万</span>，释放资金 <span class="hl-green">882 万</span>；<br>
        · <b>方案B 分批阶梯（推荐）</b>：3,510 / 3,480 / 3,450 三档，8 日清 60% → 亏损约 <span class="hl-green">29.4 万</span>，释放资金 890 万；<br>
        · <b>方案C 观望持有</b>：若行情继续按当前斜率下行 15 日，浮亏将扩大至约 <span class="hl-red">96 万</span>，且库龄突破 60 天进入呆滞区间。<br><br>
        推荐<b>方案B</b>：兼顾亏损控制与出货速度，同时对老客户搭售镀锌卷（当前紧俏、毛利 4.2%）可再对冲约 8 万毛利。
      </div>`
    },
    {
      q: '上游有哪些供货商现在有风险，会不会断货',
      a: `<div class="ai-hd">${icon('spark', 14)} 风控大脑 · 供应链风险扫描</div>
      <div class="ai-txt">
        平台 527 家入驻商户中，与我方存在采购关系的 38 家，本周新增风险事件 3 家：<br><br>
        · <em>华鑫钢贸</em>（螺纹钢主力，占采购 23.6%）：新增失信被执行 2,180 万 ＋ 账户被冻结，在手未交付订单 <span class="hl-red">1,860 万</span> → <b>断货与预付款损失风险高</b>，建议立即暂停新增预付款，并把量转移至中天钢铁（无风险，占比 19.8%，有承接余量）；<br>
        · <em>恒昌物资</em>（热卷）：新增买卖合同纠纷 260 万，属中等风险，建议预付比例 40% → 20%；<br>
        · <em>瑞泰钢材</em>（型材）：平台挂牌异常放量 +210% 且持续压价，疑似清库回笼现金 → 反向提示<em>型材品类不宜追高备货</em>。<br><br>
        整体判断：短期断货风险集中在螺纹钢，备源切换可在 3 个工作日内完成，不会影响在手销售订单交付。
      </div>`
    }
  ];

  /* ---------------- 渲染 ---------------- */
  function renderShell() {
    const page = document.body.dataset.page || 'index';
    const tc = TITLES[page] || ['', ''];

    const nav = NAV.map(g => `
      <div class="nav-group">
        <div class="nav-group-t">${g.g}</div>
        ${g.items.map(it => `
          <a class="nav-item ${it.k === page ? 'active' : ''}" href="${it.h}">
            ${icon(it.i, 16)}<span>${it.t}</span>
            ${it.n ? `<span class="dot-n">${it.n}</span>` : ''}
            ${it.tag ? `<span class="dot-n" style="background:rgba(45,212,191,.14);color:#2dd4bf;border-color:rgba(45,212,191,.35)">${it.tag}</span>` : ''}
          </a>`).join('')}
      </div>`).join('');

    const sb = document.createElement('aside');
    sb.className = 'sidebar';
    sb.innerHTML = `
      <div class="brand">
        <div class="brand-mark">钢</div>
        <div class="brand-txt"><strong>钢铁风控大脑</strong><span>Steel Risk Brain</span></div>
      </div>
      <nav class="nav">${nav}</nav>
      <div class="sb-foot">
        <div class="live"><span class="dot dot-green pulse"></span> 平台数据流正常 · 527 商户在线</div>
        <div style="margin-top:5px;font-family:var(--mono)">v2.0 · 内部经营 + 行业全域双驱动</div>
      </div>`;

    const hd = document.createElement('header');
    hd.className = 'header';
    hd.innerHTML = `
      <button class="icon-btn" id="sbToggle" style="display:none">${icon('layers', 16)}</button>
      <div class="crumb">
        <span>${tc[0]}</span><span class="sep">/</span><b>${tc[1]}</b>
        <span class="hd-tag">AI 决策辅助</span>
      </div>
      <div class="hd-right">
        <span class="blink-live"><i></i>实时</span>
        <span class="hd-clock" id="clock">2026-08-16 14:52:18</span>
        <button class="icon-btn" title="全局检索">${icon('search', 16)}</button>
        <button class="icon-btn" title="风险预警" id="bellBtn">${icon('bell', 16)}<span class="badge-n">9</span></button>
        <button class="ask-btn" id="askBtn">${icon('spark', 14)} AI 问答</button>
        <div class="avatar" title="陈总 · 总经理">陈</div>
      </div>`;

    const main = document.querySelector('.main');
    const layout = document.querySelector('.layout');
    layout.insertBefore(sb, main);
    main.insertBefore(hd, main.firstChild);

    renderAsk();
    renderAlertPanel();
    clock();
    if (innerWidth <= 1024) {
      const tg = document.getElementById('sbToggle');
      tg.style.display = 'grid';
      tg.onclick = () => sb.classList.toggle('on');
    }
  }

  function clock() {
    const e = document.getElementById('clock');
    if (!e) return;
    let base = new Date(2026, 7, 16, 14, 52, 18);
    setInterval(() => {
      base = new Date(base.getTime() + 1000);
      const p = n => String(n).padStart(2, '0');
      e.textContent = `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())} ${p(base.getHours())}:${p(base.getMinutes())}:${p(base.getSeconds())}`;
    }, 1000);
  }

  /* ---------------- AI 问答抽屉 ---------------- */
  function renderAsk() {
    const mask = document.createElement('div'); mask.className = 'mask'; mask.id = 'askMask';
    const sl = document.createElement('div'); sl.className = 'slide'; sl.id = 'askSlide';
    sl.innerHTML = `
      <div class="slide-hd">
        <span style="width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(140deg,#a78bfa,#38bdf8);color:#07111d">${icon('spark', 15)}</span>
        <div>
          <div style="font-size:13.5px;font-weight:650">风控大脑 · 自然语言问答</div>
          <div class="fs10 t4">已接入：内部 ERP / 应收台账 · 平台 527 商户报价流 · 行情指数 · 失信检测 · 私有向量库</div>
        </div>
        <button class="icon-btn ml-auto" id="askClose">${icon('close', 15)}</button>
      </div>
      <div class="slide-bd" id="askBody">
        <div class="ask-intro fs11 t4 mb" style="letter-spacing:.5px">试试这样问 —— 管理层高频问题</div>
        <div class="ask-intro suggest" id="askSuggest">
          ${QA.map((x, i) => `<button data-i="${i}">${icon('right', 12)} ${x.q}</button>`).join('')}
        </div>
        <div class="ask-intro note blue" style="margin-top:14px">
          <b>说明</b>：AI 仅做决策辅助，不自动下达业务指令。所有结论均附带数据来源与推理链，最终决策权保留在业务与管理人员手中。
        </div>
      </div>
      <div class="slide-ft">
        <div class="ask-input">
          ${icon('search', 15)}
          <input id="askInput" placeholder="用一句话提问，例如：本月哪些库存会亏钱，哪些客户要盯回款">
          <button class="btn btn-primary btn-sm" id="askSend">${icon('send', 12)} 提问</button>
        </div>
      </div>`;
    document.body.appendChild(mask); document.body.appendChild(sl);

    const open = () => { mask.classList.add('on'); sl.classList.add('on'); };
    const close = () => { mask.classList.remove('on'); sl.classList.remove('on'); };
    document.getElementById('askBtn').onclick = open;
    document.getElementById('askClose').onclick = close;
    mask.onclick = close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); closeAlert(); } });

    const body = document.getElementById('askBody');
    function answer(i) {
      const item = QA[i] || QA[0];
      body.querySelectorAll('.ask-intro').forEach(n => n.remove());
      body.insertAdjacentHTML('beforeend', `<div class="q-bubble">${item.q}</div>`);
      const box = document.createElement('div');
      box.className = 'ai-box a-bubble'; box.style.marginBottom = '16px';
      box.innerHTML = `<div class="ai-hd">${icon('spark', 14)} 风控大脑正在检索多源数据…</div>
        <div class="ai-txt t3">① 解析问题意图 → ② 检索平台商户报价流 & 行情指数 → ③ 匹配内部库存 SKU 与应收台账 → ④ 生成结论</div>`;
      body.appendChild(box);
      body.scrollTop = body.scrollHeight;
      setTimeout(() => { box.innerHTML = item.a; body.scrollTop = body.scrollHeight; }, 900);
    }
    body.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (b) answer(+b.dataset.i);
    });
    document.getElementById('askSend').onclick = () => {
      const v = document.getElementById('askInput').value.trim();
      let i = 0;
      if (/降价|多少|清货|出清/.test(v)) i = 1;
      else if (/上游|供货|供应商|断货/.test(v)) i = 2;
      if (v) { QA[i] = Object.assign({}, QA[i], { q: v }); }
      answer(i);
      document.getElementById('askInput').value = '';
    };
    document.getElementById('askInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('askSend').click(); });
    global.__openAsk = open;
  }

  /* ---------------- 预警面板 ---------------- */
  function closeAlert() {
    const m = document.getElementById('alMask'), s = document.getElementById('alSlide');
    if (m) m.classList.remove('on'); if (s) s.classList.remove('on');
  }
  function renderAlertPanel() {
    const A = (global.Mock && global.Mock.alerts) || [];
    const mask = document.createElement('div'); mask.className = 'mask'; mask.id = 'alMask';
    const sl = document.createElement('div'); sl.className = 'slide'; sl.id = 'alSlide'; sl.style.width = '480px';
    const lvMap = { high: ['高风险', 'tag-red', 'red'], mid: ['中风险', 'tag-orange', 'orange'], low: ['低风险', 'tag-green', 'green'] };
    sl.innerHTML = `
      <div class="slide-hd">
        ${icon('bell', 17)}
        <div><div style="font-size:13.5px;font-weight:650">风险预警中心</div>
        <div class="fs10 t4">分级推送：低中风险 → 对应负责人；高风险 → 直达高管</div></div>
        <button class="icon-btn ml-auto" id="alClose">${icon('close', 15)}</button>
      </div>
      <div class="slide-bd">
        <div class="flex gap6 mb wrap">
          <span class="chip on">全部 ${A.length}</span>
          <span class="chip">高风险 ${A.filter(a => a.lv === 'high').length}</span>
          <span class="chip">中风险 ${A.filter(a => a.lv === 'mid').length}</span>
          <span class="chip">低风险 ${A.filter(a => a.lv === 'low').length}</span>
        </div>
        ${A.map(a => {
      const L = lvMap[a.lv];
      return `<div class="card pad mb" style="border-left:2px solid var(--${L[2]})">
            <div class="flex items-c gap8 mb" style="margin-bottom:6px">
              <span class="tag ${L[1]}">${L[0]}</span>
              <span class="fs12 b6">${a.t}</span>
              <span class="ml-auto fs10 t4 mono nowrap">${a.time}</span>
            </div>
            <div class="fs11 t3" style="line-height:1.75">${a.b}</div>
            <div class="flex items-c gap8 wrap" style="margin-top:8px">
              <span class="tag tag-ai">${a.src}</span>
              <span class="fs10 t4">推送至：${a.to}</span>
              <button class="btn btn-sm ml-auto">查看详情</button>
            </div>
          </div>`;
    }).join('')}
      </div>`;
    document.body.appendChild(mask); document.body.appendChild(sl);
    const bell = document.getElementById('bellBtn');
    if (bell) bell.onclick = () => { mask.classList.add('on'); sl.classList.add('on'); };
    document.getElementById('alClose').onclick = closeAlert;
    mask.onclick = closeAlert;
  }

  /* ---------------- 通用组件 helper ---------------- */
  const lvTag = lv => ({
    high: '<span class="tag tag-red">高风险</span>',
    mid: '<span class="tag tag-orange">中风险</span>',
    low: '<span class="tag tag-green">低风险</span>'
  })[lv] || '';
  const lvColor = lv => ({ high: 'var(--red)', mid: 'var(--orange)', low: 'var(--green)' })[lv];
  const lvName = lv => ({ high: '高', mid: '中', low: '低' })[lv];

  /* 分段控件绑定 */
  function seg(sel, cb) {
    document.querySelectorAll(sel + ' button').forEach(b => {
      b.onclick = () => {
        b.parentElement.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if (cb) cb(b.dataset.v, b);
      };
    });
  }
  /* tabs 绑定：data-tab -> #panel */
  function tabs(sel) {
    document.querySelectorAll(sel + ' button').forEach(b => {
      b.onclick = () => {
        const root = b.parentElement;
        root.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        document.querySelectorAll('[data-panel]').forEach(p => {
          if (p.dataset.group === root.dataset.group) p.style.display = p.dataset.panel === b.dataset.tab ? '' : 'none';
        });
        global.dispatchEvent(new Event('resize'));
      };
    });
  }

  /* ---------- JSON 语法高亮 ---------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function json(obj, indent) {
    const raw = typeof obj === 'string' ? obj : JSON.stringify(obj, null, indent || 2);
    return esc(raw)
      .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="k">$1</span><span class="p">$2</span>')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="s">$1</span>')
      .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g, ': <span class="n">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="b">$1</span>')
      .replace(/\/\/(.*)$/gm, '<span class="c">//$1</span>');
  }
  /* 代码块渲染：<div class="code-block" data-title="..."> */
  function codeBlock(title, content, lang) {
    return `<div class="code-hd">${icon(lang === 'http' ? 'link' : 'file', 12)} ${title}</div>
      <pre class="code">${lang === 'raw' ? esc(content) : json(content)}</pre>`;
  }
  /* 接口卡片折叠 */
  function collapsible(sel) {
    document.querySelectorAll(sel + ' .api-hd').forEach(hd => {
      hd.onclick = () => {
        hd.parentElement.classList.toggle('open');
        global.dispatchEvent(new Event('resize'));
      };
    });
  }

  global.App = { icon, renderShell, lvTag, lvColor, lvName, seg, tabs, QA, json, esc, codeBlock, collapsible };
  document.addEventListener('DOMContentLoaded', renderShell);
})(window);
