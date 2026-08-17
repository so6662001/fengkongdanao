/* ==========================================================================
   Mock 数据层 —— 钢铁行业 AI 风控大脑
   全部为演示用模拟数据，字段口径与真实钢贸 ERP / 资源平台保持一致
   ========================================================================== */
(function (global) {
  'use strict';

  /* 固定种子随机，保证每次刷新图形一致 */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function walk(seed, n, start, vol, drift, floor) {
    const r = seeded(seed), out = []; let v = start;
    for (let i = 0; i < n; i++) {
      v += (r() - .5) * vol + (typeof drift === 'function' ? drift(i, n) : (drift || 0));
      if (floor !== undefined) v = Math.max(floor, v);
      out.push(+v.toFixed(2));
    }
    return out;
  }
  function days(n, endLabel) {
    const out = []; const base = new Date(2026, 7, 16);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000);
      out.push((d.getMonth() + 1) + '/' + d.getDate());
    }
    if (endLabel) out[out.length - 1] = endLabel;
    return out;
  }
  function hours(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) { const h = (23 - i + 24) % 24; out.push(String(h).padStart(2, '0') + ':00'); }
    return out;
  }

  /* ---------------- 顶层 KPI ---------------- */
  const kpi = {
    inventoryValue: 6086,          // 万元 = Σ 各品类 stockAmt
    inventoryTon: 15490,           // 吨   = Σ 各品类 stockTon
    riskInventory: 3226,           // 万元 高风险品类货值（螺纹Φ20 + 热卷3.0 + H型钢）
    riskInventoryDelta: +18.4,
    receivable: 11860,             // 万元 全部 42 家赊销客户应收余额
    receivableTop10: 6703,         // 万元 重点客户 TOP10 应收
    overdueTotal: 1091,            // 万元 逾期合计
    badDebtExposure: 4121,         // 万元 高风险客户应收合计（宏基+正弘+鼎晟+中远建工）
    badDebtDelta: +9.2,
    unrealizedLoss: 104.6,         // 万元 浮亏敞口 = Σ 各品类 loss
    unrealizedLossDelta: +31.7,
    marketPressure: 78.4,          // 市场抛压指数
    marketPressureDelta: +12.6,
    leadTimeDays: 11.4,            // 风险预判提前量（天）
    leadTimeBefore: 4.2,
    modelAuc: 0.913,
    alertAccuracy: 86.2,
    adoptRate: 78.5,
    casePool: 3186,
    merchants: 527,
    quotesToday: 41628,
    skuMapped: 96.8
  };

  /* ---------------- 品类 / SKU 库存风险 ---------------- */
  const categories = [
    {
      code: 'HRB400E-Φ20', name: '螺纹钢 HRB400E Φ20', region: '上海', mill: '沙钢',
      stockTon: 4260, stockAmt: 1533, cost: 3598, platAvg: 3472, ageDays: 47,
      idleProb: 82, pressure: 91, sentiment: 27, listers: 83, listersDelta: +46,
      loss: 53.7, level: 'high', turnover: 62,
      priceSeries: walk(11, 30, 3660, 26, i => (i > 18 ? -7.2 : -1.4)),
      listSeries: walk(12, 30, 34, 6, i => (i > 20 ? 3.6 : .5), 8),
      idxSeries: walk(13, 30, 108, 1.6, i => (i > 17 ? -1.05 : -.1))
    },
    {
      code: 'Q235B-3.0*1250C', name: '热轧卷板 Q235B 3.0×1250×C', region: '无锡', mill: '日照',
      stockTon: 2980, stockAmt: 1074, cost: 3605, platAvg: 3548, ageDays: 39,
      idleProb: 71, pressure: 79, sentiment: 34, listers: 61, listersDelta: +27,
      loss: 17.0, level: 'high', turnover: 71,
      priceSeries: walk(21, 30, 3648, 22, i => (i > 20 ? -5.1 : -.6)),
      listSeries: walk(22, 30, 30, 5, i => (i > 21 ? 2.6 : .3), 8),
      idxSeries: walk(23, 30, 105, 1.4, i => (i > 19 ? -.72 : 0))
    },
    {
      code: 'HRB400-Φ25', name: '螺纹钢 HRB400 Φ25', region: '杭州', mill: '永钢',
      stockTon: 1870, stockAmt: 664, cost: 3552, platAvg: 3490, ageDays: 31,
      idleProb: 64, pressure: 74, sentiment: 38, listers: 52, listersDelta: +19,
      loss: 11.6, level: 'mid', turnover: 78,
      priceSeries: walk(31, 30, 3580, 20, i => (i > 21 ? -4.0 : -.4)),
      listSeries: walk(32, 30, 28, 5, i => (i > 22 ? 2.1 : .2), 8),
      idxSeries: walk(33, 30, 104, 1.3, i => (i > 20 ? -.55 : 0))
    },
    {
      code: 'Q345B-20mm', name: '中厚板 Q345B 20mm', region: '天津', mill: '鞍钢',
      stockTon: 2210, stockAmt: 906, cost: 4098, platAvg: 4152, ageDays: 26,
      idleProb: 34, pressure: 41, sentiment: 58, listers: 24, listersDelta: -6,
      loss: 0, level: 'low', turnover: 88,
      priceSeries: walk(41, 30, 4062, 24, .32),
      listSeries: walk(42, 30, 31, 4, -.22, 6),
      idxSeries: walk(43, 30, 100, 1.1, .12)
    },
    {
      code: 'H-200*200', name: 'H型钢 Q235B 200×200', region: '上海', mill: '马钢',
      stockTon: 1520, stockAmt: 619, cost: 4072, platAvg: 3980, ageDays: 68,
      idleProb: 76, pressure: 68, sentiment: 33, listers: 47, listersDelta: +22,
      loss: 14.0, level: 'high', turnover: 54,
      priceSeries: walk(51, 30, 4090, 22, i => (i > 19 ? -4.6 : -.9)),
      listSeries: walk(52, 30, 25, 4, i => (i > 20 ? 1.9 : .2), 6),
      idxSeries: walk(53, 30, 103, 1.2, i => (i > 18 ? -.62 : 0))
    },
    {
      code: 'GI-1.0*1000C', name: '镀锌卷 DX51D 1.0×1000×C', region: '广州', mill: '本钢',
      stockTon: 890, stockAmt: 401, cost: 4506, platAvg: 4620, ageDays: 18,
      idleProb: 21, pressure: 28, sentiment: 69, listers: 17, listersDelta: -11,
      loss: 0, level: 'low', turnover: 94,
      priceSeries: walk(61, 30, 4470, 26, 1.1),
      listSeries: walk(62, 30, 28, 4, -.4, 5),
      idxSeries: walk(63, 30, 99, 1.0, .28)
    },
    {
      code: 'SMLS-108*4.5', name: '无缝管 20# 108×4.5', region: '无锡', mill: '衡阳',
      stockTon: 640, stockAmt: 372, cost: 5810, platAvg: 5748, ageDays: 55,
      idleProb: 58, pressure: 52, sentiment: 44, listers: 29, listersDelta: +8,
      loss: 4.0, level: 'mid', turnover: 66,
      priceSeries: walk(71, 30, 5842, 30, -1.2),
      listSeries: walk(72, 30, 22, 3, .28, 5),
      idxSeries: walk(73, 30, 101, 1.0, -.18)
    },
    {
      code: 'CR-1.0*1250C', name: '冷轧卷 SPCC 1.0×1250×C', region: '乐从', mill: '柳钢',
      stockTon: 1120, stockAmt: 517, cost: 4616, platAvg: 4578, ageDays: 34,
      idleProb: 46, pressure: 57, sentiment: 47, listers: 38, listersDelta: +12,
      loss: 4.3, level: 'mid', turnover: 74,
      priceSeries: walk(81, 30, 4652, 24, -1.5),
      listSeries: walk(82, 30, 26, 4, .5, 6),
      idxSeries: walk(83, 30, 102, 1.1, -.22)
    }
  ];

  /* ---------------- 下游赊销客户 ---------------- */
  const customers = [
    {
      name: '宏基建设集团有限公司', short: '宏基', industry: '房建工程', credit: 1200, ar: 1080,
      overdue: 386, overdueDays: 63, prob: 87, level: 'high', trend: +23, isMerchant: true,
      dumping: true, dumpNote: '近5日在平台集中挂牌抛售自有螺纹钢 1,860 吨，挂牌价低于市场均价 82 元/吨',
      events: [
        { d: '08-14', t: '新增被执行人', amt: '1,240 万元', sev: 'high', src: '失信检测API' },
        { d: '08-09', t: '新增买卖合同纠纷立案', amt: '318 万元', sev: 'mid', src: '失信检测API' },
        { d: '07-28', t: '法定代表人变更', amt: '—', sev: 'mid', src: '失信检测API' }
      ],
      aiRead: '两周内连续出现「被执行 1,240 万」＋「合同纠纷立案」，且该客户作为平台入驻商户同步低价抛售自有库存回笼现金，三个信号相互印证，判定为<em>资金链紧张</em>而非孤立小额诉讼，坏账概率由 64% 上调至 <span class="hl-red">87%</span>。',
      actions: ['授信额度由 1200 万下调至 300 万', '停止新增赊销发货，改为款到发货', '48h 内业务经理上门对账并争取抵押物/第三方担保', '启动 386 万逾期款分期回款协议谈判']
    },
    {
      name: '正弘工程建设有限公司', short: '正弘', industry: '市政工程', credit: 800, ar: 742,
      overdue: 214, overdueDays: 41, prob: 76, level: 'high', trend: +18, isMerchant: false,
      events: [
        { d: '08-12', t: '经营异常名录', amt: '—', sev: 'high', src: '失信检测API' },
        { d: '08-05', t: '新增股权冻结', amt: '600 万元', sev: 'high', src: '失信检测API' }
      ],
      aiRead: '经营异常＋股权冻结属于股东层面风险，叠加内部沟通纪要中出现「资金还在走审批流程」高频拖延话术（近30天出现 <em>11 次</em>），回款意愿与能力同步走弱。',
      actions: ['冻结剩余授信 586 万', '要求补充实际控制人个人连带担保', '法务提前准备催收函件']
    },
    {
      name: '鼎晟置业发展有限公司', short: '鼎晟', industry: '房地产开发', credit: 1500, ar: 1365,
      overdue: 168, overdueDays: 28, prob: 68, level: 'high', trend: +26, isMerchant: false,
      events: [{ d: '08-15', t: '关联方新增失信被执行', amt: '4,600 万元', sev: 'high', src: '失信检测API' }],
      aiRead: '客户自身暂无直接失信记录，但<strong>关联方（同一实控人）</strong>新增 4,600 万失信被执行；同时全局中枢检测到平台建材钢材品类正在集中抛货，指向地产端需求走弱，对该客户执行<em>行业系统性风险上调</em>。',
      actions: ['坏账等级由「中」升至「高」', '账期由 60 天压缩至 30 天', '要求本月内清偿 168 万逾期']
    },
    {
      name: '江南机械制造股份有限公司', short: '江南机械', industry: '机械制造', credit: 600, ar: 412,
      overdue: 0, overdueDays: 0, prob: 22, level: 'low', trend: -4, isMerchant: true,
      dumping: false, dumpNote: '平台挂牌行为平稳，近30日挂牌量与报价无异常',
      events: [],
      aiRead: '无司法与失信风险事件，回款记录连续 14 期准时，平台挂牌行为平稳，维持低风险。',
      actions: ['维持现有 600 万授信', '可作为热销品类搭售的优先承接客户']
    },
    {
      name: '恒力钢结构工程有限公司', short: '恒力钢构', industry: '钢结构工程', credit: 900, ar: 688,
      overdue: 96, overdueDays: 19, prob: 51, level: 'mid', trend: +11, isMerchant: true,
      dumping: true, dumpNote: '近7日挂牌 H型钢 620 吨，较其历史均值上升 148%',
      events: [{ d: '08-11', t: '新增劳动仲裁 3 起', amt: '47 万元', sev: 'low', src: '失信检测API' }],
      aiRead: '劳动仲裁金额较小，单独看属<em>小额纠纷</em>，不足以大幅上调；但结合其在平台异常放量抛售 H型钢（+148%），推断存在阶段性现金流压力，风险由「低」调至「中」。',
      actions: ['账期维持但暂缓授信提额申请', '加强月度对账频次至双周一次']
    },
    {
      name: '瑞通贸易有限公司', short: '瑞通', industry: '钢材贸易', credit: 500, ar: 356,
      overdue: 42, overdueDays: 12, prob: 38, level: 'mid', trend: +6, isMerchant: true,
      dumping: false, dumpNote: '挂牌量小幅上升 18%，仍在正常波动区间',
      events: [],
      aiRead: '轻度逾期 12 天属其历史习惯性节奏，无失信事件，维持中风险观察。',
      actions: ['系统自动催收短信＋业务员电话跟进']
    },
    {
      name: '中远建工集团有限公司', short: '中远建工', industry: '房建工程', credit: 1100, ar: 934,
      overdue: 127, overdueDays: 34, prob: 63, level: 'high', trend: +21, isMerchant: false,
      events: [{ d: '08-13', t: '新增建设工程施工合同纠纷', amt: '890 万元', sev: 'mid', src: '失信检测API' }],
      aiRead: '890 万工程款纠纷显示其上游业主方回款受阻，属于<em>传导型风险</em>，地产链条走弱背景下坏账概率上调至 63%。',
      actions: ['账期压缩至 45 天', '新增订单要求 30% 预付款']
    },
    {
      name: '泰隆市政建设有限公司', short: '泰隆市政', industry: '市政工程', credit: 600, ar: 486,
      overdue: 58, overdueDays: 16, prob: 44, level: 'mid', trend: +12, isMerchant: false,
      events: [],
      aiRead: '自身暂无失信事件，但受建材抛货 → 地产/工程需求走弱传导，按行业系统性风险因子上调 12 个百分点。',
      actions: ['账期由 60 天压缩至 45 天', '本月内完成一次实地对账']
    },
    {
      name: '华宇置业集团有限公司', short: '华宇置业', industry: '房地产开发', credit: 500, ar: 372,
      overdue: 0, overdueDays: 0, prob: 39, level: 'mid', trend: +14, isMerchant: false,
      events: [],
      aiRead: '无逾期、无失信事件，但所属地产开发行业景气度快速下滑，属行业系统性风险上调对象，需提前锁定回款节奏。',
      actions: ['暂缓授信提额', '新增订单要求 20% 预付款']
    },
    {
      name: '安泰精密制造有限公司', short: '安泰精密', industry: '精密制造', credit: 400, ar: 268,
      overdue: 0, overdueDays: 0, prob: 15, level: 'low', trend: -2, isMerchant: false,
      events: [],
      aiRead: '经营稳健，无风险事件，回款优良，可考虑适度提额以承接冷轧、镀锌等热销品类。',
      actions: ['建议授信提额至 550 万']
    }
  ];

  /* ---------------- 上游供应商（平台入驻商户） ---------------- */
  const suppliers = [
    {
      name: '华鑫钢贸有限公司', role: '螺纹钢主力供货商', share: 23.6, openPo: 1860, ton: 5200,
      level: 'high', prob: 74,
      events: [{ d: '08-15', t: '新增失信被执行人', amt: '2,180 万元', sev: 'high' }, { d: '08-10', t: '账户被冻结', amt: '—', sev: 'high' }],
      aiRead: '占我方螺纹钢采购量 23.6%，在手未交付订单 1,860 万元。失信＋账户冻结组合出现，<em>断货与预付款损失风险高</em>，需立即启动备源。',
      actions: ['暂停新增预付款采购', '在手订单要求缩短交货周期或改为现货自提', '启动备选供应商询价：中天、永钢、鑫达']
    },
    {
      name: '恒昌物资贸易有限公司', role: '热轧卷板供货商', share: 15.2, openPo: 940, ton: 2600,
      level: 'mid', prob: 46,
      events: [{ d: '08-08', t: '新增司法案件（买卖合同）', amt: '260 万元', sev: 'mid' }],
      aiRead: '单笔中等金额合同纠纷，履约能力暂未受实质影响，但需缩短账期敞口窗口。',
      actions: ['预付款比例由 40% 降至 20%', '增加到货节点跟踪']
    },
    {
      name: '瑞泰钢材经营部', role: '型材供货商', share: 8.4, openPo: 320, ton: 880,
      level: 'mid', prob: 41,
      events: [{ d: '08-06', t: '平台挂牌异常放量 +210%', amt: '—', sev: 'mid' }],
      aiRead: '平台挂牌量异常放量 210% 且报价持续下探，可能为清库回笼现金，反向提示<em>该品类采购不宜追高</em>。',
      actions: ['暂停型材备货采购', '若采购则要求现货现结压价']
    },
    {
      name: '中天钢铁销售公司', role: '螺纹钢/线材直供', share: 19.8, openPo: 2240, ton: 6400,
      level: 'low', prob: 12, events: [], aiRead: '钢厂直属销售公司，无风险事件，可作为华鑫的替代备源承接转移量。',
      actions: ['建议将华鑫部分订单量转移至此']
    },
    {
      name: '鑫达金属材料有限公司', role: '中厚板供货商', share: 11.3, openPo: 680, ton: 1700,
      level: 'low', prob: 17, events: [], aiRead: '经营正常，履约记录良好。', actions: ['维持现有合作']
    }
  ];

  /* ---------------- 500+ 商户实时挂牌数据流 ---------------- */
  const quoteFeed = [
    { t: '14:52:07', m: '瑞泰钢材经营部', sku: 'HRB400E Φ20', reg: '上海', price: 3452, delta: -28, qty: 320, act: '新挂牌', hit: true },
    { t: '14:51:44', m: '闽兴物资', sku: 'HRB400E Φ20', reg: '上海', price: 3458, delta: -22, qty: 180, act: '调价', hit: true },
    { t: '14:50:58', m: '德聚钢铁', sku: 'Q235B 3.0×1250×C', reg: '无锡', price: 3542, delta: -18, qty: 260, act: '调价', hit: true },
    { t: '14:50:12', m: '宏基建设集团', sku: 'HRB400E Φ20', reg: '上海', price: 3440, delta: -46, qty: 480, act: '新挂牌', hit: true, warn: true },
    { t: '14:49:33', m: '金桥钢材', sku: 'H型钢 200×200', reg: '上海', price: 3968, delta: -32, qty: 140, act: '调价', hit: true },
    { t: '14:48:51', m: '恒力钢构', sku: 'H型钢 200×200', reg: '上海', price: 3955, delta: -40, qty: 220, act: '新挂牌', hit: true, warn: true },
    { t: '14:48:07', m: '正大金属', sku: 'DX51D 1.0×1000×C', reg: '广州', price: 4636, delta: +16, qty: 90, act: '调价', hit: true },
    { t: '14:47:22', m: '中远物资', sku: 'Q345B 20mm', reg: '天津', price: 4168, delta: +12, qty: 300, act: '新挂牌', hit: true },
    { t: '14:46:40', m: '润泽钢铁', sku: 'HRB400 Φ25', reg: '杭州', price: 3486, delta: -24, qty: 260, act: '调价', hit: true },
    { t: '14:45:55', m: '兴海贸易', sku: 'HRB400E Φ20', reg: '上海', price: 3462, delta: -20, qty: 150, act: '新挂牌', hit: true },
    { t: '14:45:11', m: '天成金属', sku: 'SPCC 1.0×1250×C', reg: '乐从', price: 4570, delta: -14, qty: 120, act: '调价', hit: true },
    { t: '14:44:29', m: '锦泰钢材', sku: 'HRB400E Φ20', reg: '上海', price: 3455, delta: -30, qty: 400, act: '新挂牌', hit: true },
    { t: '14:43:48', m: '华鑫钢贸', sku: 'HRB400E Φ20', reg: '上海', price: 3448, delta: -38, qty: 620, act: '新挂牌', hit: true, warn: true },
    { t: '14:43:02', m: '恒昌物资', sku: 'Q235B 3.0×1250×C', reg: '无锡', price: 3538, delta: -26, qty: 340, act: '调价', hit: true },
    { t: '14:42:20', m: '通达钢铁', sku: '20# 108×4.5', reg: '无锡', price: 5742, delta: -8, qty: 60, act: '撤牌', hit: true }
  ];

  /* ---------------- 处置工单（数据飞轮回流） ---------------- */
  const tickets = [
    {
      id: 'WO-20260816-013', type: '库存跌价', target: 'HRB400E Φ20 · 4,260吨', owner: '张伟（现货部）',
      level: 'high', created: '08-16 09:12', status: '待决策', aiPlan: '5日内分3批降价出清 60%（建议挂牌 3,480 元/吨）',
      decision: '', result: '', pressure: 91
    },
    {
      id: 'WO-20260815-041', type: '应收坏账', target: '宏基建设集团 · 逾期386万', owner: '李娜（销售一部）',
      level: 'high', created: '08-15 16:40', status: '执行中', aiPlan: '授信降至300万＋款到发货＋48h上门对账',
      decision: '采纳', result: '', pressure: null
    },
    {
      id: 'WO-20260815-028', type: '供应链风险', target: '华鑫钢贸 · 在手订单1,860万', owner: '王强（采购部）',
      level: 'high', created: '08-15 11:05', status: '执行中', aiPlan: '暂停预付款＋订单转移至中天钢铁',
      decision: '部分采纳', result: '', pressure: null
    },
    {
      id: 'WO-20260812-017', type: '库存跌价', target: 'H型钢 200×200 · 1,520吨', owner: '张伟（现货部）',
      level: 'high', created: '08-12 10:22', status: '已闭环', aiPlan: '搭配镀锌卷搭售＋降价 60 元/吨清 40%',
      decision: '采纳', result: '成功：8日内出货 640吨，实际减亏 42万', pressure: null
    },
    {
      id: 'WO-20260809-006', type: '应收坏账', target: '恒力钢构 · 逾期96万', owner: '李娜（销售一部）',
      level: 'mid', created: '08-09 14:30', status: '已闭环', aiPlan: '暂缓提额＋双周对账',
      decision: '采纳', result: '成功：08-14 收回 62万，剩余34万已签分期', pressure: null
    },
    {
      id: 'WO-20260805-022', type: '库存跌价', target: 'Q345B 20mm · 2,210吨', owner: '赵磊（现货部）',
      level: 'mid', created: '08-05 09:48', status: '已闭环', aiPlan: '建议降价 40 元/吨清 30%',
      decision: '否决', result: '判断失误：业务坚持不降价，后市场回升 90 元/吨，多赚 84万 → 已标记为微调样本',
      wrong: true, pressure: null
    },
    {
      id: 'WO-20260802-011', type: '采购拦截', target: 'HRB400E Φ20 采购申请 3,000吨', owner: '王强（采购部）',
      level: 'high', created: '08-02 15:16', status: '已闭环', aiPlan: '市场货源泛滥，建议采购量压缩至 800吨',
      decision: '采纳', result: '成功：规避后续 15 日跌价 138 元/吨，避免损失约 30万', pressure: null
    }
  ];

  /* ---------------- 规格编码标准化映射 ---------------- */
  const skuMap = [
    { erp: '螺纹钢HRB400E-20-沙钢-9M', plat: ['HRB400E Φ20 9米 沙钢', '螺纹20 沙钢', '沙钢螺纹 Φ20', '抗震螺纹HRB400E20'], std: 'RB-400E-020-9000-SG', conf: 99.2, state: 'ok' },
    { erp: '热卷Q235B-3.0*1250*C-日照', plat: ['Q235B 3.0*1250*C 日钢', '热轧卷3.0 日照', '日钢热卷 3.0mm'], std: 'HR-Q235B-030-1250-RZ', conf: 98.6, state: 'ok' },
    { erp: '中板Q345B-20-鞍钢', plat: ['Q345B 20mm 鞍钢', '低合金中板20 鞍钢'], std: 'MP-Q345B-200-ANG', conf: 97.8, state: 'ok' },
    { erp: 'H型钢Q235B-200*200*8*12-马钢', plat: ['H200*200 马钢', 'H型钢200*200*8*12', '马钢H钢200'], std: 'HB-Q235B-200200-MG', conf: 96.4, state: 'ok' },
    { erp: '镀锌卷DX51D-1.0*1000*C-本钢', plat: ['DX51D 1.0*1000 本钢', '镀锌1.0 本钢 有花'], std: 'GI-DX51D-010-1000-BG', conf: 94.1, state: 'ok' },
    { erp: '无缝管20#-108*4.5-衡钢', plat: ['20# 108*4.5 衡阳', '无缝108*4.5 衡钢'], std: 'SM-20-108-45-HG', conf: 91.7, state: 'ok' },
    { erp: '花纹板Q235B-3.0*1500*C', plat: ['花纹卷3.0 五条筋', '花纹板3.0*1500'], std: 'CP-Q235B-030-1500-?', conf: 72.4, state: 'review' },
    { erp: '带钢Q195-2.0*355', plat: ['热轧带钢2.0*355', '带钢2.0 355 唐山'], std: '—', conf: 48.6, state: 'fail' }
  ];

  /* ---------------- 预警消息中心 ---------------- */
  const alerts = [
    { lv: 'high', t: '螺纹钢 HRB400E Φ20 市场抛压指数升至 91', b: '平台近3日新增 83 家商户集中挂牌（+46 家），同业均价 3,472 元/吨已低于我方库存成本价 3,598 元/吨，浮亏敞口 53.7 万元', time: '3 分钟前', to: '总经理 / 现货部负责人', src: '库存风控智能体' },
    { lv: 'high', t: '宏基建设集团新增被执行 1,240 万元', b: '失信检测 API 检测到新增被执行信息，同时该客户在平台低价抛售自有货源 1,860 吨，坏账概率 64% → 87%', time: '18 分钟前', to: '总经理 / 销售一部', src: '客户应收风控智能体' },
    { lv: 'high', t: '上游华鑫钢贸失信＋账户冻结', b: '占螺纹钢采购量 23.6%，在手未交付订单 1,860 万元，存在断货与预付款损失风险，建议立即启动备源', time: '42 分钟前', to: '采购部负责人 / 总经理', src: '供应链风险子模型' },
    { lv: 'mid', t: '建材类钢材集中抛货 → 地产链客户批量预警', b: '全局中枢联动推演：已批量上调 7 家地产/工程类下游客户坏账预警等级，涉及应收 5,667 万元', time: '1 小时前', to: '销售总监 / 财务总监', src: '经营全局风控中枢' },
    { lv: 'mid', t: 'H型钢 200×200 库龄突破 68 天', b: '同业报价已跌破成本线 92 元/吨，平台挂牌商户 47 家（+22），建议搭售出清', time: '2 小时前', to: '现货部负责人', src: '库存呆滞预测模型' },
    { lv: 'low', t: '镀锌卷 DX51D 市场紧俏', b: '平台货源持续减少（-11 家），报价稳步抬升 +2.9%，现有库存跌价风险下降，可适度备货', time: '3 小时前', to: '采购部 / 现货部', src: '库存风控智能体' }
  ];

  /* ---------------- 行情指数时序 ---------------- */
  const indices = {
    xLabels: days(30),
    建材综合: walk(101, 30, 108, 1.5, i => (i > 17 ? -.95 : -.08)),
    板材综合: walk(102, 30, 105, 1.3, i => (i > 19 ? -.6 : .02)),
    型材综合: walk(103, 30, 103.5, 1.2, i => (i > 18 ? -.58 : -.05)),
    管材综合: walk(104, 30, 101, 1.0, -.12),
    成交情绪: walk(105, 30, 56, 3.2, i => (i > 17 ? -1.5 : -.1), 10),
    区域热度: walk(106, 30, 62, 3.0, i => (i > 18 ? -1.2 : .05), 10)
  };

  /* ---------------- 热力图：品类 × 区域 抛压指数 ---------------- */
  const heat = {
    rows: ['螺纹钢', '热轧卷', '中厚板', 'H型钢', '镀锌卷', '冷轧卷', '无缝管'],
    cols: ['上海', '杭州', '无锡', '天津', '广州', '乐从', '济南'],
    data: [
      [91, 86, 78, 64, 58, 61, 72],
      [72, 68, 79, 66, 54, 57, 63],
      [42, 38, 45, 41, 36, 39, 44],
      [68, 63, 59, 52, 47, 51, 56],
      [28, 31, 26, 33, 24, 29, 34],
      [57, 52, 61, 48, 43, 55, 49],
      [51, 46, 52, 44, 39, 42, 47]
    ]
  };

  /* ---------------- 特征重要度 ---------------- */
  const featureImp = {
    inventory: [
      { label: '平台同规格挂牌商户数环比', value: 18.6, color: '#2dd4bf', tagNew: true },
      { label: '平台同业均价 vs 库存成本价', value: 16.9, color: '#2dd4bf', tagNew: true },
      { label: '平台行情指数波动率', value: 12.4, color: '#2dd4bf', tagNew: true },
      { label: '库龄天数', value: 11.8, color: '#38bdf8' },
      { label: '近90日出库周转率', value: 10.2, color: '#38bdf8' },
      { label: '货源撤牌速率', value: 8.7, color: '#2dd4bf', tagNew: true },
      { label: '成交情绪指数', value: 7.3, color: '#2dd4bf', tagNew: true },
      { label: '钢厂调价方向', value: 6.1, color: '#a78bfa' },
      { label: '下游开工率', value: 4.4, color: '#a78bfa' },
      { label: '在途＋在库总水位', value: 3.6, color: '#38bdf8' }
    ],
    receivable: [
      { label: '失信API新增风险事件严重度', value: 21.3, color: '#2dd4bf', tagNew: true },
      { label: '逾期天数 / 逾期金额占比', value: 17.6, color: '#38bdf8' },
      { label: '历史回款准时率', value: 13.9, color: '#38bdf8' },
      { label: '客户平台挂牌抛售异动', value: 11.2, color: '#2dd4bf', tagNew: true },
      { label: '所属下游行业景气指数', value: 9.8, color: '#2dd4bf', tagNew: true },
      { label: '沟通纪要拖延话术频次', value: 8.4, color: '#a78bfa' },
      { label: '授信使用率', value: 7.1, color: '#38bdf8' },
      { label: '关联方风险传导', value: 6.2, color: '#2dd4bf', tagNew: true },
      { label: '合作年限 / 交易额稳定度', value: 4.5, color: '#38bdf8' }
    ]
  };

  /* ---------------- 模型效果对比（接入平台数据前后） ---------------- */
  const modelCompare = {
    xLabels: ['库存呆滞 AUC', '坏账预测 AUC', '预警准确率', '误报率(逆)', '提前量(天/10)'],
    before: [0.78, 0.81, 0.68, 0.62, 0.42],
    after: [0.913, 0.926, 0.862, 0.845, 1.14]
  };

  global.Mock = {
    seeded, walk, days, hours,
    kpi, categories, customers, suppliers, quoteFeed, tickets, skuMap, alerts,
    indices, heat, featureImp, modelCompare
  };
})(window);
