/* ==========================================================================
   钢铁行业 · 采购智能定价预警模型
   与通用商品的三点根本差异：
   1) 尺度用「元/吨」而不是百分比 —— 采购员脑子里是「今天涨了 30 块」
   2) 必看期货盘面与基差 —— 螺纹/热卷/铁矿/焦炭有主力合约，盘面领先现货
   3) 成本支撑有明确算法 —— 长流程按铁矿×1.6+焦炭×0.45，短流程电炉成本是价格地板
   ========================================================================== */
(function (global) {
  'use strict';
  const seeded = global.Mock.seeded;

  /* ================= 一、盘面速览（钢贸人早上第一眼看的） ================= */
  const FUTURES = [
    { code: 'RB2610', name: '螺纹钢主力', last: 3386, chg: -32, unit: '元/吨', oi: '198.6万手', note: '夜盘低开低走，日内未收复' },
    { code: 'HC2610', name: '热卷主力', last: 3452, chg: -28, unit: '元/吨', oi: '142.3万手', note: '跟随螺纹回落' },
    { code: 'I2609', name: '铁矿石主力', last: 748.5, chg: -11.5, unit: '元/湿吨', oi: '86.2万手', note: '原料端同步走弱' },
    { code: 'J2609', name: '焦炭主力', last: 1586, chg: -24, unit: '元/吨', oi: '12.8万手', note: '第三轮提降落地预期' }
  ];
  const SPOT_BENCH = [
    { name: '上海螺纹 HRB400E Φ20', price: 3470, chg: -30, note: '主流规格基价' },
    { name: '唐山普碳方坯', price: 3180, chg: -20, note: '现货风向标，领先成材半天' },
    { name: '张家港重废', price: 2450, chg: -30, note: '电炉成本核心变量' },
    { name: '日照热卷 3.0', price: 3540, chg: -26, note: '板材基价' }
  ];
  const BASIS = {
    rb: { spot: 3470, fut: 3386, basis: 84, normal: 40, ma30: 46, status: 'high',
      read: '现货升水期货 84 元/吨，高于常态 40 元约 44 元。盘面已先跌，现货尚未跟足 —— <b>基差修复的方向是现货补跌</b>，此时按现货价采购等于接最后一棒。' },
    hc: { spot: 3540, fut: 3452, basis: 88, normal: 60, ma30: 64, status: 'high',
      read: '热卷现货升水 88，高于常态 60，同样存在补跌压力，但幅度小于螺纹。' }
  };
  const SPREAD = { name: '卷螺差（热卷主力 − 螺纹主力）', value: 66, ma30: 88, chg: -22,
    read: '卷螺差由 88 收窄至 66，说明板材相对建材走弱。若手上板材与建材都要采，当前应<b>优先压缩板材采购</b>。' };

  /* ================= 二、成本支撑测算（钢材的价格地板） ================= */
  const COST = {
    bf: {
      name: '长流程（高炉转炉）完全成本', value: 3282, tag: '主流工艺',
      items: [
        ['铁矿石', '748.5 元/湿吨 × 1.60 吨', 1198],
        ['焦炭', '1,586 元/吨 × 0.45 吨', 714],
        ['废钢 / 合金 / 辅料', '按 12% 废钢比折算', 386],
        ['轧制 + 制造费用', '含能源、人工、备件', 384],
        ['期间费用 + 财务成本', '', 240],
        ['税费调整', '', 360]
      ],
      read: '长流程成本 3,282 元/吨，当前现货 3,470，钢厂吨钢利润约 <b>188 元</b> —— 利润尚可，钢厂没有减产动力，供给压力短期不会缓解。'
    },
    ef: {
      name: '短流程（电炉）平电成本', value: 3380, tag: '价格地板',
      items: [
        ['废钢', '2,450 元/吨 × 1.05 吨', 2573],
        ['电费', '平电 0.62 元/度 × 380 度', 236],
        ['石墨电极 / 合金 / 耐材', '', 324],
        ['轧制 + 制造费用', '', 187],
        ['期间费用 + 税费', '', 60]
      ],
      read: '电炉平电成本 <b>3,380</b> 是螺纹钢最经典的价格地板 —— 跌破后电炉厂普遍减产停产，供给收缩形成支撑。当前现货 3,470，距电炉成本仅 <b>90 元/吨</b>，下方空间有限。'
    },
    efValley: { name: '电炉谷电成本', value: 3290, read: '夜间谷电时段成本 3,290，是极端行情下的最后一道支撑。' }
  };

  /* ================= 三、三阶段定义（钢铁口径，元/吨） ================= */
  const STAGES = {
    stable: {
      key: 'stable', name: '平稳期', short: '平稳', color: '#34d399', tag: 'tag-green',
      gate: '3 日累计涨跌 ≤ ±30 元/吨',
      level: '绿 · 常规提示', levelTag: 'tag-green',
      spot: '现货窄幅盘整，单日波动多在 10~20 元以内，商家挺价意愿一致',
      fut: '盘面横盘，基差在常态区间内小幅摆动',
      mill: '钢厂旬价基本持平（调整 ≤ 30 元），结算无明显追补或让利',
      online: '平台挂牌商户数与挂牌量基本持平，同规格报价极差 ≤ 30 元，报价高度集中',
      buy: '按月度节奏正常从钢厂订货，市场端随用随买。这个阶段真正的风险不是价格，而是<b>惯性囤货</b> —— 价格不动时最容易凭手感多备，等行情来了才发现库存已经超配。'
    },
    online: {
      key: 'online', name: '线上波动期', short: '线上波动', color: '#fbbf24', tag: 'tag-yellow',
      gate: '3 日累计涨跌 ±30 ~ ±80 元/吨',
      level: '黄 · 关注提示', levelTag: 'tag-yellow',
      spot: '现货有波动但未形成单边趋势，早盘一个价、下午一个价的情况增多',
      fut: '盘面开始给方向但反复，基差偏离常态 25~60 元',
      mill: '钢厂旬价出现 30~80 元调整，部分钢厂开始给结算追补或让利',
      online: '<b>这是「线上」最先反应的阶段</b>：平台上同规格报价开始分化，有人急着出、有人还在扛价，报价极差拉大到 30~60 元，商户日均调价 1~3 次，试探性报价明显增多',
      buy: '方向未明时最忌一次性大单和长周期锁价。核心动作是<b>把单次采购量切小、把敞口周期缩短</b>，钢厂订货额度用一半、分旬打款，市场端分批点价，用时间换确定性。'
    },
    accel_up: {
      key: 'accel_up', name: '加速上涨期', short: '急涨', color: '#fb923c', tag: 'tag-orange',
      gate: '3 日累计上涨 > +80 元/吨',
      level: '橙 · 警示', levelTag: 'tag-orange',
      spot: '现货连续跳涨，单日涨幅常超 40 元，市场出现捂盘惜售、有价无市',
      fut: '盘面连续拉涨，现货贴水或平水，基差有修复上涨空间',
      mill: '钢厂连续上调旬价（累计 > 80 元），部分品种停止接单或限量',
      online: '平台挂牌商户数与挂牌量同步下降，撤牌率上升（挂出来很快被拿走），低价资源迅速消失',
      buy: '还按「随用随买」等于每天用更高的价格补库。应<b>用足钢厂额度、争取保价协议、市场端抢货锁量</b>，必要时用期货买入保值锁定采购成本。此阶段保供优先于价格，犹豫的成本比溢价更高。'
    },
    accel_down: {
      key: 'accel_down', name: '加速下跌期', short: '急跌', color: '#f4586e', tag: 'tag-red',
      gate: '3 日累计下跌 > −80 元/吨',
      level: '红 · 强警示', levelTag: 'tag-red',
      spot: '现货连续下探，单日跌幅常超 40 元，成交清淡，低价资源不断刷新',
      fut: '盘面领跌，现货升水偏高，<b>基差修复方向是现货补跌</b>',
      mill: '钢厂连续下调旬价（累计 > 80 元），结算大幅让利，代理户普遍亏损',
      online: '平台商户集中挂牌抛售，挂牌商户数 3 日增幅超 40%，撤牌率骤降（挂出来撤不掉说明没人接），报价极差拉大到 60 元以上',
      buy: '这是钢贸采购最容易踩坑的阶段：看着比上周便宜就进货，结果下周更便宜。应<b>停止钢厂预订、只走市场现货背靠背</b>，绝不预付 —— 上游此时急着出货往往是在回笼现金。定价锚要从「现货价」换成「期货主力价 + 常态基差」，并盯住电炉成本这条地板。'
    }
  };
  const STAGE_ORDER = ['stable', 'online', 'accel_up', 'accel_down'];

  /* ================= 四、判定指标体系（六大类，权重合计 100） ================= */
  const IND_GROUPS = [
    {
      g: '现货价格', color: '#38bdf8', items: [
        { k: 'spot3d', name: '3 日累计涨跌', unit: '元/吨', w: 16, t: [30, 80], fmt: v => (v > 0 ? '+' : '') + v.toFixed(0),
          why: '钢材定价的主尺度。采购员判断行情用的是「这周跌了多少块」，不是百分比' },
        { k: 'maxDaily', name: '单日最大波动', unit: '元/吨', w: 8, t: [20, 40], fmt: v => Math.abs(v).toFixed(0),
          why: '区分「慢跌」与「急跌」。同样跌 90 元，三天匀速跌是波动，一天跌 50 是趋势' }
      ]
    },
    {
      g: '期货盘面', color: '#a78bfa', items: [
        { k: 'fut3d', name: '主力合约 3 日涨跌', unit: '元/吨', w: 14, t: [40, 100], fmt: v => (v > 0 ? '+' : '') + v.toFixed(0),
          why: '盘面领先现货半天到一天，是钢材最重要的先行指标' },
        { k: 'basisDev', name: '基差偏离常态值', unit: '元/吨', w: 12, t: [25, 60], fmt: v => (v > 0 ? '+' : '') + v.toFixed(0),
          why: '基差 = 现货 − 期货。升水过高意味着现货有补跌压力，贴水则有修复上涨预期 —— 直接决定该不该囤货' }
      ]
    },
    {
      g: '钢厂政策', color: '#fbbf24', items: [
        { k: 'millAdj', name: '旬度出厂价累计调整', unit: '元/吨', w: 12, t: [30, 80], fmt: v => (v > 0 ? '+' : '') + v.toFixed(0),
          why: '钢厂旬价是市场价格锚。大厂调价当天，现货几乎必然跟随' },
        { k: 'settle', name: '上一期结算追补 / 让利', unit: '元/吨', w: 6, t: [20, 50], fmt: v => (v > 0 ? '+' : '') + v.toFixed(0),
          why: '结算政策反映钢厂对后市的真实态度，大幅让利通常预示还要继续降' }
      ]
    },
    {
      g: '线上报价（自有平台）', color: '#2dd4bf', items: [
        { k: 'merchantChg', name: '挂牌商户数 3 日变化', unit: '%', w: 10, t: [15, 40], fmt: v => (v > 0 ? '+' : '') + v.toFixed(0),
          why: '量能配合。集中挂牌是抛压，集中撤牌是惜售 —— 没有量的价格变动不可信' },
        { k: 'priceRange', name: '同规格报价极差', unit: '元/吨', w: 8, t: [30, 60], fmt: v => v.toFixed(0),
          why: '<b>线上波动期最核心的信号</b>。报价从集中走向分化，通常早于价格转折出现' },
        { k: 'reprice', name: '商户日均调价频次', unit: '次/商户', w: 6, t: [1, 3], fmt: v => v.toFixed(1),
          why: '调价频次骤增说明商家自己也没底，在试探市场' }
      ]
    },
    {
      g: '供需库存', color: '#fb923c', items: [
        { k: 'socStock', name: '社会库存周环比', unit: '%', w: 5, t: [1, 3], fmt: v => (v > 0 ? '+' : '') + v.toFixed(1),
          why: '累库还是去库，是判断供需的核心。看的是全市场社库+厂库，不是自家仓储' },
        { k: 'apparent', name: '表观消费量周环比', unit: '%', w: 3, t: [3, 8], fmt: v => (v > 0 ? '+' : '') + v.toFixed(1),
          why: '需求端的直接度量，与库存变化交叉验证' }
      ]
    }
  ];
  const ALL_IND = IND_GROUPS.reduce((a, g) => a.concat(g.items), []);

  /* ================= 五、一票否决 / 强制修正规则（行业 know-how） ================= */
  const OVERRIDES = [
    { name: '钢厂单日大幅调价', cond: '任一主流钢厂单日出厂价调整 > 100 元/吨', act: '强制判定为加速涨跌期',
      why: '钢厂是价格锚，大厂单日大幅调价当天，市场现货必然跟随，无需等指标累积', hit: false },
    { name: '期货主力封停', cond: '主力合约触及涨跌停板', act: '强制判定为加速涨跌期并置顶推送',
      why: '盘面极端行情当天，现货普遍停报或跳空开盘，常规指标已失效', hit: false },
    { name: '跌破电炉成本', cond: '现货到位价 < 电炉平电成本（当前 3,380）', act: '维持加速下跌判定，但采购建议改为「可分批试探性建仓」',
      why: '跌破电炉成本后电炉厂减产停产，供给收缩，下方空间有限 —— 这是钢材最经典的成本支撑逻辑', hit: false },
    { name: '现货深度贴水', cond: '现货 − 期货 < −60 元/吨', act: '警示降一级，提示后市有基差修复上涨预期',
      why: '现货贴水期货意味着市场预期后市上涨，此时下跌往往接近尾声', hit: false },
    { name: '旺季 / 冬储窗口', cond: '处于金三银四、金九银十或 11-1 月冬储窗口', act: '加速下跌期的备货天数上限放宽 50%',
      why: '季节性需求预期会改变持货意愿，旺季前的下跌通常是建仓窗口而非风险', hit: true,
      hitNote: '当前 8 月中，距金九银十旺季 15 天，已进入旺季前布局窗口 —— 加速下跌期备货天数由 3 天放宽至 4~5 天' },
    { name: '主产区限产落地', cond: '唐山、徐州等主产区发布限产或错峰生产通知', act: '加速上涨判定权重上调，下跌判定降权',
      why: '供给收缩是钢价最强驱动之一，限产消息落地当天盘面往往直接反应', hit: true,
      hitNote: '唐山 8/10 发布秋冬季错峰生产预案，对建材形成利多，已在下跌判定中扣减 6 分' }
  ];

  /* ================= 六、采购策略阶梯（钢贸真实动作） ================= */
  const STRATEGY = [
    { dim: '采购渠道结构', stable: '钢厂订货 70% + 市场现货 30%', online: '钢厂订货降至 50%，市场现货为主', up: '用足钢厂额度 + 市场端抢货', down: '停止钢厂预订，只走市场现货' },
    { dim: '钢厂打款 / 订货', stable: '按月度正常额度打款', online: '额度用 50%，改为分旬打款', up: '用满额度，争取保价协议与追加量', down: '暂停打款；已打款争取延后提货或转下月' },
    { dim: '定价方式', stable: '随行就市', online: '分批点价，不一次性锁定', up: '锁价 / 保价协议 / 期货买入保值', down: '一单一议，压价采购，严禁锁价' },
    { dim: '建议限价锚', stable: '主流规格基价 − 10', online: '平台 25 分位基价', up: '可接受基价 + 30（保供优先于价格）', down: '期货主力价 + 常态基差 − 20，且不高于电炉成本 + 20' },
    { dim: '建议备货天数', stable: '10 ~ 15 天', online: '5 ~ 8 天', up: '20 ~ 30 天（旺季 / 冬储可再放宽）', down: '≤ 3 天（背靠背，有订单才采）' },
    { dim: '规格结构', stable: '主流规格为主', online: '集中主流规格，减少偏门规格', up: '主流 + 差价处于低位的细规格一并锁量', down: '仅补在手订单对应规格；规格差价异常扩大的偏紧规格可例外' },
    { dim: '基差策略', stable: '常态区间，无特别动作', online: '观察基差方向，暂不囤货', up: '基差走强可囤货；深贴水时优先期货点价', down: '现货升水偏高时严禁囤货，等基差修复到常态再补' },
    { dim: '套期保值', stable: '不需要', online: '在途货可做部分卖出保值', up: '买入保值锁定采购成本', down: '库存卖出保值，建议比例 30% ~ 50%' },
    { dim: '提醒级别', stable: '绿 · 常规提示', online: '黄 · 关注提示', up: '橙 · 警示', down: '红 · 强警示' },
    { dim: '推送对象', stable: '采购员', online: '采购员 + 采购主管', up: '采购主管 + 总经理', down: '采购主管 + 总经理' }
  ];
  const TARGET_DAYS = { stable: 12, online: 6, accel_up: 25, accel_down: 3 };
  const CHANNEL = { stable: '钢厂订货 70% + 市场 30%', online: '钢厂 50%，市场为主', accel_up: '用足钢厂额度 + 市场抢货', accel_down: '停钢厂预订，只走市场现货' };
  const PRICING_WAY = { stable: '随行就市', online: '分批点价', accel_up: '锁价 / 保价协议 / 买入保值', accel_down: '一单一议压价，严禁锁价' };
  const HEDGE = { stable: '不需要', online: '在途货部分卖出保值', accel_up: '买入保值锁定成本', accel_down: '库存卖出保值 30%~50%' };
  const PUSH = { stable: '采购员', online: '采购员 + 采购主管', accel_up: '采购主管 + 总经理', accel_down: '采购主管 + 总经理' };

  /* ================= 七、品类行情上下文 ================= */
  const CATEGORY = {
    '螺纹钢': {
      base: 3470, baseGrade: 'HRB400E', baseSpec: 'Φ20', baseMill: '沙钢', baseRegion: '上海',
      fut: 'RB2610', futLast: 3386, fut3d: -78, normalBasis: 40, curBasis: 84,
      spot3d: -96, maxDaily: -42, millAdj: -110, settle: -50,
      merchantChg: 124, priceRange: 78, reprice: 3.6, socStock: 2.3, apparent: -6.2,
      stageBase: 3406, stageBaseFormula: '期货主力 3,386 + 常态基差 40 − 安全垫 20',
      costFloor: 3380, costFloorName: '电炉平电成本'
    },
    '盘螺': {
      base: 3620, baseGrade: 'HRB400E', baseSpec: 'Φ8', baseMill: '沙钢', baseRegion: '上海',
      fut: 'RB2610', futLast: 3386, fut3d: -78, normalBasis: 190, curBasis: 234,
      spot3d: -72, maxDaily: -32, millAdj: -80, settle: -40,
      merchantChg: 62, priceRange: 54, reprice: 2.4, socStock: 1.8, apparent: -4.8,
      stageBase: 3555, stageBaseFormula: '平台 25 分位基价（3,620 − 65）',
      costFloor: 3430, costFloorName: '电炉成本 + 盘螺加工费'
    },
    '热轧卷': {
      base: 3540, baseGrade: 'Q235B', baseSpec: '3.0×1250×C', baseMill: '日照', baseRegion: '上海',
      fut: 'HC2610', futLast: 3452, fut3d: -64, normalBasis: 60, curBasis: 88,
      spot3d: -74, maxDaily: -30, millAdj: -70, settle: -30,
      merchantChg: 58, priceRange: 52, reprice: 2.2, socStock: 1.4, apparent: -3.6,
      stageBase: 3492, stageBaseFormula: '平台 25 分位基价（3,540 − 48）',
      costFloor: 3396, costFloorName: '长流程成本 + 热轧加工费'
    },
    '中厚板': {
      base: 4120, baseGrade: 'Q355B', baseSpec: '20mm', baseMill: '鞍钢', baseRegion: '天津',
      fut: 'HC2610（参考）', futLast: 3452, fut3d: -64, normalBasis: 640, curBasis: 668,
      spot3d: -22, maxDaily: -14, millAdj: 20, settle: 10,
      merchantChg: -9, priceRange: 26, reprice: .7, socStock: -0.6, apparent: 1.2,
      stageBase: 4110, stageBaseFormula: '主流规格基价 − 10',
      costFloor: 3860, costFloorName: '长流程成本 + 中板加工费',
      noFut: true
    },
    'H型钢': {
      base: 3980, baseGrade: 'Q235B', baseSpec: '200×200', baseMill: '马钢', baseRegion: '上海',
      fut: 'RB2610（参考）', futLast: 3386, fut3d: -78, normalBasis: 560, curBasis: 594,
      spot3d: -96, maxDaily: -42, millAdj: -120, settle: -60,
      merchantChg: 96, priceRange: 72, reprice: 3.4, socStock: 2.1, apparent: -5.4,
      stageBase: 3928, stageBaseFormula: '型材成本支撑 3,908 + 20，与「基价 − 3日跌幅×0.6」取孰低',
      costFloor: 3908, costFloorName: '长流程成本 + 型材加工费',
      noFut: true
    },
    '镀锌卷': {
      base: 4620, baseGrade: 'DX51D', baseSpec: '1.0×1000×C', baseMill: '本钢', baseRegion: '广州',
      fut: 'HC2610（参考）', futLast: 3452, fut3d: -64, normalBasis: 1120, curBasis: 1168,
      spot3d: 112, maxDaily: 48, millAdj: 130, settle: 40,
      merchantChg: -48, priceRange: 64, reprice: 3.2, socStock: -3.4, apparent: 8.6,
      stageBase: 4650, stageBaseFormula: '主流规格基价 + 30（保供优先）',
      costFloor: 4180, costFloorName: '热卷成本 + 镀锌加工费',
      noFut: true
    },
    '冷轧卷': {
      base: 4580, baseGrade: 'SPCC', baseSpec: '1.0×1250×C', baseMill: '柳钢', baseRegion: '乐从',
      fut: 'HC2610（参考）', futLast: 3452, fut3d: -64, normalBasis: 1080, curBasis: 1128,
      spot3d: -42, maxDaily: -22, millAdj: -40, settle: -20,
      merchantChg: 34, priceRange: 44, reprice: 1.8, socStock: 0.8, apparent: -2.2,
      stageBase: 4532, stageBaseFormula: '平台 25 分位基价（4,580 − 48）',
      costFloor: 4260, costFloorName: '热卷成本 + 冷轧加工费',
      noFut: true
    }
  };

  /* ================= 八、定价结构：规格差价 / 材质升水 / 品牌溢价 / 区域价差 ================= */
  /* 规格差价：[规格, 当前差价, 3日前差价, 30日均值, 30日分位%] */
  const SPEC_DIFF = {
    '螺纹钢': [
      ['Φ12', 190, 158, 165, 82], ['Φ14', 130, 108, 118, 68], ['Φ16', 40, 36, 32, 61],
      ['Φ18', 10, 10, 8, 55], ['Φ20', 0, 0, 0, 50], ['Φ22', 0, 2, 2, 48],
      ['Φ25', 10, 12, 12, 45], ['Φ28', 50, 40, 38, 74], ['Φ32', 90, 62, 62, 88]
    ],
    '盘螺': [['Φ8', 0, 0, 0, 50], ['Φ10', -14, -12, -12, 46]],
    '热轧卷': [['2.75×1250×C', 30, 26, 24, 64], ['3.0×1250×C', 0, 0, 0, 50], ['4.0×1500×C', -10, -8, -8, 46], ['5.75×1500×C', -30, -26, -28, 44]],
    '中厚板': [['14mm', 60, 56, 54, 62], ['16mm', 20, 18, 18, 54], ['20mm', 0, 0, 0, 50], ['25mm', 30, 22, 20, 76]],
    'H型钢': [['150×150', 60, 54, 52, 66], ['200×200', 0, 0, 0, 50], ['300×300', 120, 96, 94, 84]],
    '镀锌卷': [['0.5×1000×C', 240, 196, 202, 86], ['0.8×1000×C', 110, 82, 88, 78], ['1.0×1000×C', 0, 0, 0, 50], ['1.2×1250×C', -30, -22, -26, 42]],
    '冷轧卷': [['0.8×1250×C', 40, 36, 34, 62], ['1.0×1250×C', 0, 0, 0, 50], ['1.5×1250×C', -20, -18, -18, 47]]
  };
  /* 材质升水（相对该品类基准材质） */
  const GRADE_PREMIUM = {
    '螺纹钢': [['HRB400E', 0, '基准 · 抗震钢筋'], ['HRB400', -30, '非抗震，价差常年 25~35'], ['HRB500E', 180, '高强钢筋，用量少溢价高']],
    '盘螺': [['HRB400E', 0, '基准']],
    '热轧卷': [['Q235B', 0, '基准'], ['Q355B', 190, '低合金，价差 170~210']],
    '中厚板': [['Q235B', -180, '普碳'], ['Q355B', 0, '基准 · 低合金']],
    'H型钢': [['Q235B', 0, '基准'], ['Q355B', 210, '低合金型材']],
    '镀锌卷': [['DX51D', 0, '基准']],
    '冷轧卷': [['SPCC', 0, '基准']]
  };
  /* 钢厂品牌溢价 */
  const MILL_PREMIUM = {
    '沙钢': 0, '中天': -10, '永钢': -10, '民营小厂': -50,
    '日照': 0, '本钢': 20, '柳钢': -20, '鞍钢': 0, '马钢': 0
  };
  /* 区域价差（相对上海） */
  const REGION_DIFF = { '上海': 0, '无锡': -10, '杭州': -20, '南京': -30, '天津': -40, '广州': 60, '乐从': 40 };

  /* ================= 九、规格清单 ================= */
  /* [品类, 材质, 规格, 钢厂, 区域, 在库(吨), 月均用量(吨), 我方成本] */
  const RAW = [
    ['螺纹钢', 'HRB400E', 'Φ12', '沙钢', '上海', 30, 220, 3690],
    ['螺纹钢', 'HRB400E', 'Φ14', '沙钢', '上海', 45, 320, 3624],
    ['螺纹钢', 'HRB400E', 'Φ16', '沙钢', '上海', 860, 620, 3572],
    ['螺纹钢', 'HRB400E', 'Φ18', '沙钢', '上海', 1140, 780, 3580],
    ['螺纹钢', 'HRB400E', 'Φ20', '沙钢', '上海', 4260, 1200, 3598],
    ['螺纹钢', 'HRB400E', 'Φ22', '沙钢', '上海', 920, 640, 3576],
    ['螺纹钢', 'HRB400E', 'Φ25', '永钢', '杭州', 1870, 900, 3552],
    ['螺纹钢', 'HRB400E', 'Φ28', '永钢', '杭州', 55, 260, 3596],
    ['螺纹钢', 'HRB400E', 'Φ32', '永钢', '杭州', 30, 180, 3628],
    ['螺纹钢', 'HRB400', 'Φ20', '中天', '无锡', 640, 480, 3518],
    ['螺纹钢', 'HRB400', 'Φ25', '中天', '无锡', 60, 260, 3530],
    ['螺纹钢', 'HRB500E', 'Φ20', '沙钢', '上海', 20, 140, 3746],
    ['盘螺', 'HRB400E', 'Φ8', '沙钢', '上海', 55, 300, 3664],
    ['盘螺', 'HRB400E', 'Φ10', '沙钢', '上海', 340, 280, 3646],
    ['热轧卷', 'Q235B', '2.75×1250×C', '日照', '无锡', 90, 520, 3592],
    ['热轧卷', 'Q235B', '3.0×1250×C', '日照', '无锡', 2980, 1100, 3605],
    ['热轧卷', 'Q235B', '4.0×1500×C', '日照', '无锡', 620, 420, 3586],
    ['热轧卷', 'Q235B', '5.75×1500×C', '日照', '无锡', 340, 260, 3564],
    ['热轧卷', 'Q355B', '3.0×1250×C', '日照', '无锡', 40, 240, 3792],
    ['热轧卷', 'Q355B', '5.75×1500×C', '日照', '无锡', 220, 180, 3756],
    ['中厚板', 'Q235B', '14mm', '鞍钢', '天津', 130, 420, 3948],
    ['中厚板', 'Q235B', '20mm', '鞍钢', '天津', 190, 560, 3902],
    ['中厚板', 'Q355B', '16mm', '鞍钢', '天津', 720, 480, 4086],
    ['中厚板', 'Q355B', '20mm', '鞍钢', '天津', 2210, 900, 4098],
    ['中厚板', 'Q355B', '25mm', '鞍钢', '天津', 120, 320, 4142],
    ['H型钢', 'Q235B', '150×150', '马钢', '上海', 40, 280, 4048],
    ['H型钢', 'Q235B', '200×200', '马钢', '上海', 1520, 560, 4072],
    ['H型钢', 'Q235B', '300×300', '马钢', '上海', 320, 220, 4152],
    ['镀锌卷', 'DX51D', '0.5×1000×C', '本钢', '广州', 90, 320, 4708],
    ['镀锌卷', 'DX51D', '0.8×1000×C', '本钢', '广州', 120, 400, 4562],
    ['镀锌卷', 'DX51D', '1.0×1000×C', '本钢', '广州', 890, 1450, 4506],
    ['镀锌卷', 'DX51D', '1.2×1250×C', '本钢', '广州', 80, 260, 4520],
    ['冷轧卷', 'SPCC', '0.8×1250×C', '柳钢', '乐从', 40, 300, 4638],
    ['冷轧卷', 'SPCC', '1.0×1250×C', '柳钢', '乐从', 1120, 620, 4616],
    ['冷轧卷', 'SPCC', '1.5×1250×C', '柳钢', '乐从', 280, 220, 4652]
  ];

  /* ---------------- 打分 ---------------- */
  function scoreOne(v, t) {
    const a = Math.abs(v);
    if (a < t[0]) return 30 * (a / t[0]);
    if (a < t[1]) return 30 + 40 * (a - t[0]) / (t[1] - t[0]);
    return 70 + 30 * Math.min(1, (a - t[1]) / t[1]);
  }
  function bandOf(v, t) { const a = Math.abs(v); return a >= t[1] ? 'accel' : a >= t[0] ? 'online' : 'stable'; }
  function stageOf(score, dir) {
    if (score >= 62) return dir >= 0 ? 'accel_up' : 'accel_down';
    if (score >= 30) return 'online';
    return 'stable';
  }

  /* ---------------- 构建 SKU ---------------- */
  const SKUS = RAW.map((r, idx) => {
    const [cat, grade, spec, mill, region, onHand, monthlyUse, myCost] = r;
    const C = CATEGORY[cat];
    const sd = (SPEC_DIFF[cat] || []).find(x => x[0] === spec) || [spec, 0, 0, 0, 50];
    const gp = (GRADE_PREMIUM[cat] || []).find(x => x[0] === grade) || [grade, 0, ''];
    const mp = MILL_PREMIUM[mill] || 0;
    const rd = REGION_DIFF[region] || 0;

    /* 到位价 = 品类基价 + 规格差价 + 材质升水 + 品牌溢价 + 区域价差 */
    const specDiff = sd[1], specDiff3d = sd[2], specDiffMa = sd[3], specDiffPct = sd[4];
    const gradePrem = gp[1];
    const spotPrice = C.base + specDiff + gradePrem + mp + rd;

    /* 该规格自身的 3 日涨跌 = 品类基价 3 日涨跌 + 规格差价 3 日变动 */
    const specDiffChg = specDiff - specDiff3d;
    const spot3d = C.spot3d + specDiffChg;
    const maxDaily = Math.round(C.maxDaily * (Math.abs(spot3d) / Math.abs(C.spot3d || 1)));

    const ind = {
      spot3d: spot3d, maxDaily: maxDaily, fut3d: C.fut3d,
      basisDev: C.curBasis - C.normalBasis, millAdj: C.millAdj, settle: C.settle,
      merchantChg: C.merchantChg, priceRange: C.priceRange, reprice: C.reprice,
      socStock: C.socStock, apparent: C.apparent
    };

    /* 打分（线上报价类指标按规格流动性微调：偏紧规格抛压小） */
    const tight = specDiffChg > 8;
    if (tight) { ind.merchantChg = Math.round(C.merchantChg * .35); ind.priceRange = Math.round(C.priceRange * .6); ind.reprice = +(C.reprice * .6).toFixed(1); }

    let total = 0;
    const detail = ALL_IND.map(m => {
      const v = ind[m.k];
      const s = scoreOne(v, m.t);
      total += s * m.w / 100;
      return { k: m.k, name: m.name, unit: m.unit, val: m.fmt(v) + ' ' + m.unit, band: bandOf(v, m.t), w: m.w, contrib: +(s * m.w / 100).toFixed(1) };
    });
    /* 限产利多：对下跌方向扣 6 分 */
    if (spot3d < 0) total -= 6;
    total = Math.max(2, +total.toFixed(1));
    const stage = stageOf(total, spot3d);
    const S = STAGES[stage];

    /* 阶段基准价（按品类），再叠加本规格的结构性价差 */
    const stageBase = C.stageBase;
    const limitPrice = Math.round(stageBase + specDiff + gradePrem + mp + rd);

    /* 库存与建议量 */
    const dailyUse = monthlyUse / 30;
    let targetDays = TARGET_DAYS[stage];
    if (stage === 'accel_down') targetDays = Math.round(targetDays * 1.5);   /* 旺季前窗口放宽 50% */
    if (tight) targetDays = Math.max(targetDays, 8);                         /* 规格差价扩大＝资源偏紧，例外放宽 */
    const coverDays = +(onHand / dailyUse).toFixed(1);
    const capQty = Math.round(monthlyUse * (stage === 'accel_up' ? .5 : stage === 'stable' ? .3 : stage === 'online' ? .15 : .08));
    const suggestQty = Math.min(capQty, Math.max(0, Math.round((targetDays - coverDays) * dailyUse)));

    /* 判定理由（钢铁口径） */
    const reasons = [];
    if (stage === 'accel_down') {
      reasons.push(`3 日累计下跌 <b>${spot3d} 元/吨</b>，单日最大跌幅 ${Math.abs(maxDaily)} 元，已越过 80 元的加速门槛`);
      reasons.push(`${C.fut} 主力 3 日跌 ${Math.abs(C.fut3d)} 元；现货升水期货 ${C.curBasis} 元，高于常态 ${C.normalBasis} 元 <b>${C.curBasis - C.normalBasis} 元</b> —— 基差修复的方向是现货补跌`);
      reasons.push(`钢厂旬价累计下调 ${Math.abs(C.millAdj)} 元/吨，上一期结算让利 ${Math.abs(C.settle)} 元，钢厂对后市态度偏空`);
      reasons.push(`平台挂牌商户数 3 日 +${ind.merchantChg.toFixed(0)}%，同规格报价极差拉大到 ${ind.priceRange} 元，撤牌率同步下降`);
      reasons.push(`当前到位价 ${spotPrice}，距 ${C.costFloorName} ${C.costFloor} 还有 <b>${spotPrice - C.costFloor} 元/吨</b>空间${spotPrice - C.costFloor < 120 ? '，已接近成本地板，可分批试探' : '，尚未触及支撑'}`);
    } else if (stage === 'accel_up') {
      reasons.push(`3 日累计上涨 <b>+${spot3d} 元/吨</b>，单日最大涨幅 ${Math.abs(maxDaily)} 元，越过 80 元加速门槛`);
      reasons.push(`平台挂牌商户数 3 日 ${ind.merchantChg.toFixed(0)}%，货源持续收缩，撤牌率上升（挂出来很快被拿走）`);
      reasons.push(`钢厂旬价累计上调 ${C.millAdj} 元/吨，结算追补 +${C.settle} 元，且部分规格已限量接单`);
      reasons.push(`社会库存周环比 ${C.socStock.toFixed(1)}%（去库），表观消费 +${C.apparent.toFixed(1)}%，供需实质性转紧`);
      reasons.push(`该规格差价 ${specDiff >= 0 ? '+' : ''}${specDiff} 元，处于 30 日 ${specDiffPct} 分位${specDiffPct > 75 ? '，规格本身偏紧，涨价弹性更大' : ''}`);
    } else if (stage === 'online') {
      reasons.push(`3 日累计${spot3d < 0 ? '下跌' : '上涨'} <b>${Math.abs(spot3d)} 元/吨</b>，在 30~80 元区间，尚未突破加速门槛`);
      reasons.push(`<b>线上报价开始分化</b>：同规格报价极差 ${ind.priceRange} 元，商户日均调价 ${ind.reprice} 次 —— 有人急着出、有人还在扛价，试探性报价增多`);
      if (tight) reasons.push(`该规格差价由 ${specDiff3d} 扩至 <b>${specDiff}</b> 元（30 日均值 ${specDiffMa}，处 ${specDiffPct} 分位），资源偏紧，跌幅明显小于主流规格`);
      reasons.push(`${C.fut} 主力 3 日${C.fut3d < 0 ? '跌' : '涨'} ${Math.abs(C.fut3d)} 元，基差偏离常态 ${C.curBasis - C.normalBasis} 元，方向尚未确认`);
      reasons.push(`方向未明时核心是切小单次采购量、缩短敞口周期，钢厂额度用一半、分旬打款`);
    } else {
      reasons.push(`3 日累计${spot3d >= 0 ? '上涨' : '下跌'} ${Math.abs(spot3d)} 元/吨，单日波动 ${Math.abs(maxDaily)} 元，处于窄幅盘整`);
      reasons.push(`同规格报价极差仅 ${ind.priceRange} 元，商户日均调价 ${ind.reprice} 次，线上报价高度集中，市场无明显分歧`);
      reasons.push(`钢厂旬价调整 ${Math.abs(C.millAdj)} 元/吨，成本端稳定；社会库存周环比 ${C.socStock.toFixed(1)}%`);
      reasons.push(`当前库存可供 ${coverDays} 天，${coverDays > targetDays ? '已超出目标备货天数 ' + targetDays + ' 天，不必补货' : '低于目标 ' + targetDays + ' 天，可按需补至安全水位'}`);
    }

    /* 动作 */
    let action;
    if (stage === 'accel_down') action = suggestQty > 0 ? `仅按在手订单背靠背采购 ${suggestQty} 吨` : '暂停采购';
    else if (stage === 'accel_up') action = suggestQty > 0 ? `用足钢厂额度并市场抢货，补至 ${targetDays} 天` : '库存已充足，不追高';
    else if (stage === 'online') action = suggestQty > 0 ? `小批量分批点价，单次不超过 ${capQty} 吨` : '库存超配，本期不采';
    else action = suggestQty > 0 ? `按需采购，补至 ${targetDays} 天安全库存` : '库存充足，随用随买';

    /* 价格序列（元/吨，从当前价按日变动倒推） */
    const rnd = seeded(2100 + idx);
    const dayChg = spot3d / 3;
    const spotSeries = new Array(30); spotSeries[29] = spotPrice;
    let v = spotPrice;
    for (let i = 28; i >= 0; i--) {
      const rate = i >= 26 ? dayChg : i >= 20 ? dayChg * .55 : dayChg * .18;
      v = v - rate + (rnd() - .5) * 14;
      spotSeries[i] = Math.round(v);
    }
    const futSeries = spotSeries.map((p, i) => Math.round(p - C.normalBasis - (C.curBasis - C.normalBasis) * (i / 29)) - (specDiff + gradePrem + mp + rd));
    const basisSeries = spotSeries.map((p, i) => p - futSeries[i] - (specDiff + gradePrem + mp + rd));
    const specDiffSeries = (function () {
      const out = new Array(30); out[29] = specDiff;
      let x = specDiff;
      for (let i = 28; i >= 0; i--) { x -= (i >= 26 ? specDiffChg / 3 : (specDiff - specDiffMa) / 40) + (rnd() - .5) * 3; out[i] = Math.round(x); }
      return out;
    })();

    const bandFrom = stage === 'accel_down' || stage === 'accel_up' ? 24 : stage === 'online' ? 20 : 0;
    const bands = bandFrom > 0
      ? [{ from: 0, to: bandFrom, stage: stage === 'stable' ? 'stable' : 'online' }, { from: bandFrom, to: 29, stage: stage }]
      : [{ from: 0, to: 29, stage: stage }];

    return {
      id: cat + '|' + grade + '|' + spec, cat, grade, spec, mill, region,
      stage, score: total, scoreDetail: detail, ind, tight,
      price: {
        catBase: C.base, specDiff, specDiff3d, specDiffMa, specDiffPct, specDiffChg,
        gradePrem, gradeNote: gp[2], millPrem: mp, regionDiff: rd,
        spot: spotPrice, limit: limitPrice, stageBase, stageBaseFormula: C.stageBaseFormula,
        fut: C.futLast, futName: C.fut, noFut: !!C.noFut,
        basis: C.curBasis, normalBasis: C.normalBasis,
        costFloor: C.costFloor, costFloorName: C.costFloorName, myCost
      },
      stock: { onHand, monthlyUse, dailyUse: +dailyUse.toFixed(1), coverDays, targetDays, capQty, suggestQty },
      advice: {
        action, targetDays, capQty, suggestQty, limitPrice,
        channel: CHANNEL[stage], way: PRICING_WAY[stage], hedge: HEDGE[stage], push: PUSH[stage], reasons
      },
      spotSeries, futSeries, basisSeries, specDiffSeries, bands,
      label: grade + ' ' + spec
    };
  });

  /* ================= 十、钢厂旬度政策日历 ================= */
  const MILL_CALENDAR = [
    { date: '08-01', type: '旬价', mill: '沙钢', content: '8 月上旬螺纹出厂价 3,530 元/吨（持平）', delta: 0, state: 'past' },
    { date: '07-31', type: '结算', mill: '沙钢', content: '7 月下旬结算：让利 50 元/吨', delta: -50, state: 'past' },
    { date: '08-10', type: '政策', mill: '唐山', content: '发布秋冬季错峰生产预案（供给端利多）', delta: null, state: 'past' },
    { date: '08-11', type: '旬价', mill: '沙钢', content: '8 月中旬螺纹出厂价 3,470 元/吨（下调 60）', delta: -60, state: 'past' },
    { date: '08-13', type: '旬价', mill: '中天 / 永钢', content: '跟随下调 50~60 元/吨', delta: -55, state: 'past' },
    { date: '08-17', type: '今日', mill: '—', content: '距下旬调价窗口还有 4 天，当前处于旬中观望期', delta: null, state: 'today' },
    { date: '08-21', type: '旬价', mill: '沙钢等主流钢厂', content: '下旬调价窗口 · 模型预测下调 40 ~ 70 元/吨（概率 68%）', delta: -55, state: 'future' },
    { date: '08-31', type: '结算', mill: '主流钢厂', content: '8 月结算窗口 · 预计继续让利 40 ~ 60 元/吨', delta: -50, state: 'future' }
  ];

  /* ================= 十一、季节性与供需 ================= */
  const SEASON = {
    now: '8 月中旬 · 传统淡季尾声',
    detail: '高温多雨，工地开工受限，建材需求处于年内低位。距「金九银十」旺季约 15 天，市场已开始交易旺季预期。',
    windows: [
      { name: '金三银四', period: '3 - 4 月', type: '旺季', now: false },
      { name: '梅雨高温淡季', period: '6 - 8 月', type: '淡季', now: true },
      { name: '金九银十', period: '9 - 10 月', type: '旺季', now: false, near: true },
      { name: '冬储窗口', period: '11 月 - 次年 1 月', type: '囤货', now: false }
    ],
    supply: [
      ['螺纹社会库存', '428.6 万吨', '+2.3%', 'up'],
      ['螺纹钢厂库存', '186.2 万吨', '+1.8%', 'up'],
      ['螺纹表观消费', '218.4 万吨', '-6.2%', 'down'],
      ['247 家钢厂高炉开工率', '82.4%', '-0.6pct', 'down'],
      ['电炉产能利用率', '51.2%', '-3.4pct', 'down']
    ],
    read: '累库 + 表需下滑，供需边际转弱，是本轮加速下跌的基本面依据。但电炉产能利用率已降至 51.2%，说明部分电炉厂在成本线附近减产 —— <b>供给端开始自发收缩，跌幅的持续性会受限</b>。'
  };

  /* ================= 十二、阶段切换预警 ================= */
  const TRANSITIONS = [
    { time: '09:05', id: '螺纹钢|HRB400E|Φ20', from: 'online', to: 'accel_down',
      trigger: '3 日累计跌幅由 62 元扩大至 96 元/吨，越过 80 元加速门槛；RB2610 夜盘跌 32 元，现货升水扩至 84（常态 40）',
      push: '采购主管 + 总经理', act: '已拦截一笔 3,000 吨采购申请，限价由 3,460 下调至 3,406' },
    { time: '09:05', id: '螺纹钢|HRB400E|Φ18', from: 'online', to: 'accel_down',
      trigger: '同品类主流规格联动确认，3 日跌 96 元', push: '采购主管 + 总经理', act: '限价下调至 3,416' },
    { time: '09:41', id: 'H型钢|Q235B|200×200', from: 'online', to: 'accel_down',
      trigger: '3 日跌 88 元，挂牌商户 3 日 +88%，报价极差拉大到 66 元', push: '采购主管 + 总经理', act: '暂停型材钢厂预订' },
    { time: '10:22', id: '镀锌卷|DX51D|1.0×1000×C', from: 'online', to: 'accel_up',
      trigger: '3 日累计涨 112 元/吨，货源 3 日 −48%，钢厂累计上调 130 元并限量接单',
      push: '采购主管 + 总经理', act: '建议用足本钢额度并签 1~3 个月保价协议' },
    { time: '11:16', id: '螺纹钢|HRB400E|Φ32', from: 'accel_down', to: 'online',
      trigger: '规格差价由 62 扩至 90 元（30 日 88 分位），大规格资源偏紧，自身 3 日跌幅收敛至 68 元',
      push: '采购员 + 采购主管', act: '该规格备货天数由 3 天放宽至 8 天' },
    { time: '13:30', id: '螺纹钢|HRB400E|Φ28', from: 'accel_down', to: 'online',
      trigger: '规格差价由 40 扩至 50 元（30 日 74 分位），自身 3 日跌幅收敛至 86 元，抛压明显小于主流规格',
      push: '采购员 + 采购主管', act: '备货天数由 5 天放宽至 8 天，可小量补 15 吨' },
    { time: '14:12', id: '螺纹钢|HRB400E|Φ12', from: 'accel_down', to: 'online',
      trigger: '细规格资源紧张，差价由 158 扩至 190 元（30 日 82 分位），3 日跌幅仅 64 元',
      push: '采购员 + 采购主管', act: '维持小批量补货，限价 3,596' }
  ];

  /* ================= 十三、回测 ================= */
  const BACKTEST = {
    months: ['3月', '4月', '5月', '6月', '7月', '8月'],
    followed: [62, 71, 78, 84, 88, 91],
    saved: [12.4, 26.8, 21.3, 48.6, 63.2, 57.4],
    gapVsMarket: [-6, -11, -9, -22, -31, -28],
    gapVsMill: [-14, -22, -18, -41, -56, -49]
  };

  global.Pricing = {
    STAGES, STAGE_ORDER, IND_GROUPS, ALL_IND, OVERRIDES, STRATEGY,
    FUTURES, SPOT_BENCH, BASIS, SPREAD, COST, CATEGORY,
    SPEC_DIFF, GRADE_PREMIUM, MILL_PREMIUM, REGION_DIFF,
    SKUS, MILL_CALENDAR, SEASON, TRANSITIONS, BACKTEST
  };
})(window);
