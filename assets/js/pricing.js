/* ==========================================================================
   采购智能定价预警 —— 行情阶段识别与采购策略阶梯
   三阶段：平稳期 / 波动期（线上报价分化）/ 加速涨跌期（分上涨、下跌两个方向）
   粒度：品类 → 材质 → 规格，逐个规格独立判定
   ========================================================================== */
(function (global) {
  'use strict';
  const walk = global.Mock.walk, days = global.Mock.days;

  /* ---------------- 阶段定义 ---------------- */
  const STAGES = {
    stable: {
      key: 'stable', name: '平稳期', short: '平稳', sub: '窄幅整理，多空力量均衡',
      color: '#34d399', tag: 'tag-green', level: '绿 · 常规提示', levelTag: 'tag-green',
      feature: '线上报价窄幅整理，挂牌商户数与挂牌量基本持平，报价高度集中（离散度低），钢厂无明显调价动作。市场没有方向性观点，成交按刚需节奏进行。',
      risk: '这个阶段最大的风险不是价格，而是<b>惯性囤货</b> —— 因为价格不动，采购容易凭手感多备，等波动来了才发现库存已经超配。'
    },
    volatile: {
      key: 'volatile', name: '波动期', short: '波动', sub: '线上报价开始分化，方向未明',
      color: '#fbbf24', tag: 'tag-yellow', level: '黄 · 关注提示', levelTag: 'tag-yellow',
      feature: '线上同规格报价开始分化，<b>离散度明显放大</b>（有人急着出、有人还在扛价），挂牌商户数出现单向变化，钢厂开始小幅调价。价格有波动但尚未形成趋势。',
      risk: '方向未明时最忌讳一次性大单和长周期锁价。此阶段的核心动作是<b>把单次采购切小、把敞口周期缩短</b>，用时间换确定性。'
    },
    accel_up: {
      key: 'accel_up', name: '加速上涨期', short: '急涨', sub: '货源收缩、报价快速抬升',
      color: '#fb923c', tag: 'tag-orange', level: '橙 · 警示', levelTag: 'tag-orange',
      feature: '平台货源持续减少（挂牌商户数与挂牌量同步下降），撤牌率上升（挂出来很快被拿走），报价快速抬升且<b>3 日均速显著快于 10 日均速</b>，钢厂连续上调出厂价。',
      risk: '这个阶段还按「随用随买」的节奏，等于每天都在用更高的价格补货。应<b>提前锁量锁价</b>，并接受合理溢价 —— 犹豫的成本比溢价更高。'
    },
    accel_down: {
      key: 'accel_down', name: '加速下跌期', short: '急跌', sub: '商户集中抛售、报价连续下探',
      color: '#f4586e', tag: 'tag-red', level: '红 · 强警示', levelTag: 'tag-red',
      feature: '平台商户集中挂牌抛售（挂牌商户数大幅增加），<b>撤牌率骤降</b>（挂出来撤不掉，说明接盘方少），报价连续下探且跌幅在加速，钢厂连续下调出厂价。',
      risk: '这是采购最容易踩坑的阶段：看着比上周便宜就进货，结果下周更便宜。应<b>暂停备货、只做背靠背</b>，且绝不预付 —— 上游此时抛货往往是为了回笼现金。'
    }
  };
  const STAGE_ORDER = ['stable', 'volatile', 'accel_up', 'accel_down'];

  /* ---------------- 判定指标与阈值 ---------------- */
  const THRESHOLDS = [
    { name: '7 日涨跌幅 |Δ7d|', w: 20, stable: '< 1.0%', volatile: '1.0% ~ 3.0%', accel: '> 3.0%',
      src: '平台商户报价流', why: '最直接的趋势强度度量，决定阶段的基础判断' },
    { name: '加速度（3日均速 ÷ 10日均速）', w: 18, stable: '< 1.2', volatile: '1.2 ~ 1.8', accel: '> 1.8',
      src: '平台商户报价流', why: '区分「跌得多」与「跌得快」。同样跌 3%，慢跌是波动，急跌是趋势，采购动作完全不同' },
    { name: '20 日波动率 σ20', w: 15, stable: '< 0.8%', volatile: '0.8% ~ 1.8%', accel: '> 1.8%',
      src: '平台行情指数', why: '衡量价格不确定性，直接决定备货天数与敞口容忍度' },
    { name: '线上报价离散度 σ ÷ 均价', w: 14, stable: '< 0.8%', volatile: '0.8% ~ 1.5%', accel: '> 1.5%',
      src: '平台商户报价流', why: '同规格各商户报价的分歧程度。离散度放大通常<b>早于价格转折</b>出现，是最有价值的先行信号' },
    { name: '挂牌商户数环比（3 日）', w: 13, stable: '±15% 以内', volatile: '±15% ~ 40%', accel: '> +40%（跌）/ < −25%（涨）',
      src: '平台商户报价流', why: '量能配合。集中挂牌 = 抛压，集中撤牌 = 惜售，没有量的价格变化不可信' },
    { name: '钢厂近 7 日累计调价', w: 12, stable: '< 30 元/吨', volatile: '30 ~ 80 元/吨', accel: '> 80 元/吨',
      src: '上游钢厂调价', why: '供给端成本锚。钢厂大幅调价往往决定后续 1~2 周的价格中枢' },
    { name: '成交情绪指数', w: 8, stable: '45 ~ 65', volatile: '30~45 或 65~80', accel: '< 30 或 > 80',
      src: '平台行情指数', why: '本商圈真实交易情绪，用于验证前面几项指标是否得到成交端印证' }
  ];

  /* ---------------- 采购策略阶梯 ---------------- */
  const STRATEGY = [
    { dim: '采购节奏', stable: '按需采购、随用随买', volatile: '小批量多批次，缩短单次采购周期', up: '提前锁量锁价，适度超备', down: '暂停备货，只做背靠背（有订单再采）' },
    { dim: '建议备货天数', stable: '8 ~ 12 天', volatile: '5 ~ 8 天', up: '15 ~ 20 天', down: '0 ~ 3 天（仅覆盖在手订单）' },
    { dim: '单次采购量上限', stable: '月均用量的 30%', volatile: '月均用量的 15%', up: '月均用量的 50%', down: '仅按在手销售订单配货' },
    { dim: '建议限价锚', stable: '平台中位价 − 10 元/吨', volatile: '平台 25 分位价（抢低价资源）', up: '可接受中位价 + 20 元/吨', down: '近 30 日最低价 − 20，且不高于成本支撑位' },
    { dim: '预付比例上限', stable: '30%', volatile: '20%', up: '40%（用预付换锁价）', down: '0 —— 现货现结' },
    { dim: '账期要求', stable: '常规账期', volatile: '缩短账期', up: '可适度让步以换取锁价', down: '必须现结，或大幅压价' },
    { dim: '锁价 / 框架协议', stable: '可签 3 个月框架', volatile: '不建议长周期锁价', up: '建议签 1~3 个月锁价', down: '严禁锁价' },
    { dim: '与库存联动', stable: '维持安全库存', volatile: '库存超配的品类优先消化', up: '可提前补至上限', down: '优先出清，采购让位于去库存' },
    { dim: '提醒级别', stable: '绿 · 常规提示', volatile: '黄 · 关注提示', up: '橙 · 警示', down: '红 · 强警示' },
    { dim: '推送对象', stable: '采购员', volatile: '采购员 + 采购主管', up: '采购主管 + 总经理', down: '采购主管 + 总经理' }
  ];

  const TARGET_DAYS = { stable: 10, volatile: 6, accel_up: 18, accel_down: 2 };
  const CAP_RATIO = { stable: .30, volatile: .15, accel_up: .50, accel_down: 0 };
  const PREPAY = { stable: '30%', volatile: '20%', accel_up: '40%', accel_down: '0（现货现结）' };
  const LOCK = { stable: '可签 3 个月框架', volatile: '不建议长周期锁价', accel_up: '建议签 1~3 个月锁价', accel_down: '严禁锁价' };
  const TERM = { stable: '常规账期', volatile: '缩短账期', accel_up: '可让步换锁价', accel_down: '必须现结或压价' };
  const PUSH = { stable: '采购员', volatile: '采购员 + 采购主管', accel_up: '采购主管 + 总经理', accel_down: '采购主管 + 总经理' };

  /* ---------------- 规格清单（材质 × 规格） ---------------- */
  /* 字段：[id, 品类, 材质, 规格, 钢厂, 区域, 阶段, 已持续天数, 前一阶段,
            中位价, 7日涨跌, 波动率, 加速度, 离散度, 商户数环比, 钢厂7日调价, 情绪,
            在库(吨), 月均用量(吨), 我方成本] */
  const RAW = [
    ['RB-400E-016', '螺纹钢', 'HRB400E', 'Φ16', '沙钢', '上海', 'accel_down', 4, 'volatile', 3486, -.0298, .0196, 1.92, .0154, .96, -110, 33, 860, 620, 3572],
    ['RB-400E-018', '螺纹钢', 'HRB400E', 'Φ18', '沙钢', '上海', 'accel_down', 5, 'volatile', 3478, -.0321, .0204, 2.04, .0161, 1.08, -120, 31, 1140, 780, 3580],
    ['RB-400E-020', '螺纹钢', 'HRB400E', 'Φ20', '沙钢', '上海', 'accel_down', 6, 'volatile', 3472, -.0342, .0212, 2.14, .0168, 1.24, -130, 27, 4260, 1200, 3598],
    ['RB-400E-022', '螺纹钢', 'HRB400E', 'Φ22', '沙钢', '上海', 'accel_down', 4, 'volatile', 3480, -.0311, .0198, 1.96, .0157, 1.02, -130, 30, 920, 640, 3576],
    ['RB-400E-025', '螺纹钢', 'HRB400E', 'Φ25', '永钢', '杭州', 'volatile', 8, 'stable', 3490, -.0186, .0142, 1.54, .0121, .42, -70, 38, 1870, 900, 3552],
    ['RB-400E-028', '螺纹钢', 'HRB400E', 'Φ28', '永钢', '杭州', 'volatile', 6, 'stable', 3512, -.0142, .0128, 1.38, .0106, .31, -70, 41, 420, 260, 3540],
    ['RB-400E-032', '螺纹钢', 'HRB400E', 'Φ32', '永钢', '杭州', 'stable', 12, 'volatile', 3596, -.0042, .0064, 1.06, .0058, .08, -20, 52, 260, 180, 3584],
    ['RB-400-020', '螺纹钢', 'HRB400', 'Φ20', '中天', '无锡', 'accel_down', 3, 'volatile', 3462, -.0286, .0188, 1.86, .0149, .88, -110, 34, 640, 480, 3548],
    ['WR-400E-008', '盘螺', 'HRB400E', 'Φ8', '沙钢', '上海', 'volatile', 7, 'stable', 3628, -.0164, .0136, 1.44, .0114, .36, -60, 40, 380, 300, 3664],
    ['WR-400E-010', '盘螺', 'HRB400E', 'Φ10', '沙钢', '上海', 'volatile', 7, 'stable', 3614, -.0158, .0132, 1.41, .0111, .33, -60, 41, 340, 280, 3646],

    ['HR-Q235B-275', '热轧卷', 'Q235B', '2.75×1250×C', '日照', '无锡', 'volatile', 9, 'stable', 3562, -.0164, .0148, 1.52, .0128, .48, -60, 36, 780, 520, 3592],
    ['HR-Q235B-300', '热轧卷', 'Q235B', '3.0×1250×C', '日照', '无锡', 'volatile', 11, 'stable', 3548, -.0182, .0156, 1.61, .0134, .58, -70, 34, 2980, 1100, 3605],
    ['HR-Q235B-400', '热轧卷', 'Q235B', '4.0×1500×C', '日照', '无锡', 'volatile', 6, 'stable', 3574, -.0138, .0139, 1.42, .0118, .39, -60, 39, 620, 420, 3586],
    ['HR-Q355B-300', '热轧卷', 'Q355B', '3.0×1250×C', '日照', '无锡', 'stable', 15, 'volatile', 3746, -.0058, .0071, 1.09, .0064, .11, -20, 50, 340, 240, 3738],
    ['HR-Q355B-500', '热轧卷', 'Q355B', '5.0×1500×C', '日照', '无锡', 'stable', 14, 'volatile', 3782, -.0041, .0066, 1.04, .0059, .06, -20, 51, 280, 200, 3770],

    ['MP-Q235B-140', '中厚板', 'Q235B', '14mm', '鞍钢', '天津', 'stable', 18, 'volatile', 4048, .0036, .0058, 1.02, .0052, -.06, 20, 56, 640, 420, 4032],
    ['MP-Q345B-160', '中厚板', 'Q345B', '16mm', '鞍钢', '天津', 'stable', 16, 'volatile', 4124, .0048, .0061, 1.07, .0055, -.09, 20, 57, 720, 480, 4086],
    ['MP-Q345B-200', '中厚板', 'Q345B', '20mm', '鞍钢', '天津', 'stable', 21, 'volatile', 4152, .0062, .0064, 1.11, .0057, -.12, 30, 58, 2210, 900, 4098],
    ['MP-Q345B-250', '中厚板', 'Q345B', '25mm', '鞍钢', '天津', 'volatile', 5, 'stable', 4186, .0124, .0116, 1.34, .0098, -.22, 40, 63, 480, 320, 4142],

    ['HB-Q235B-150', 'H型钢', 'Q235B', '150×150', '马钢', '上海', 'volatile', 9, 'stable', 4022, -.0176, .0151, 1.58, .0131, .52, -70, 36, 380, 280, 4048],
    ['HB-Q235B-200', 'H型钢', 'Q235B', '200×200', '马钢', '上海', 'accel_down', 3, 'volatile', 3980, -.0312, .0193, 1.88, .0152, .88, -110, 33, 1520, 560, 4072],
    ['HB-Q235B-300', 'H型钢', 'Q235B', '300×300', '马钢', '上海', 'stable', 13, 'volatile', 4238, -.0036, .0068, 1.05, .0061, .09, -20, 49, 320, 220, 4226],

    ['GI-DX51D-050', '镀锌卷', 'DX51D', '0.5×1000×C', '本钢', '广州', 'accel_up', 5, 'volatile', 4842, .0326, .0201, 1.94, .0146, -.34, 110, 76, 260, 320, 4708],
    ['GI-DX51D-080', '镀锌卷', 'DX51D', '0.8×1000×C', '本钢', '广州', 'accel_up', 6, 'volatile', 4716, .0348, .0208, 2.06, .0151, -.42, 120, 78, 340, 400, 4562],
    ['GI-DX51D-100', '镀锌卷', 'DX51D', '1.0×1000×C', '本钢', '广州', 'accel_up', 7, 'volatile', 4620, .0362, .0214, 2.18, .0156, -.48, 130, 79, 890, 760, 4506],
    ['GI-DX51D-120', '镀锌卷', 'DX51D', '1.2×1250×C', '本钢', '广州', 'volatile', 4, 'stable', 4586, .0186, .0143, 1.52, .0122, -.26, 70, 68, 220, 260, 4520],

    ['CR-SPCC-080', '冷轧卷', 'SPCC', '0.8×1250×C', '柳钢', '乐从', 'volatile', 8, 'stable', 4612, -.0132, .0134, 1.43, .0116, .34, -50, 44, 380, 300, 4638],
    ['CR-SPCC-100', '冷轧卷', 'SPCC', '1.0×1250×C', '柳钢', '乐从', 'volatile', 10, 'stable', 4578, -.0158, .0141, 1.49, .0124, .42, -60, 42, 1120, 620, 4616],
    ['CR-SPCC-150', '冷轧卷', 'SPCC', '1.5×1250×C', '柳钢', '乐从', 'stable', 16, 'volatile', 4664, -.0048, .0069, 1.06, .0062, .10, -20, 50, 280, 220, 4652],

    ['SM-20-089', '无缝管', '20#', '89×4', '衡阳', '无锡', 'stable', 19, 'volatile', 5892, -.0032, .0057, 1.03, .0051, .05, -20, 53, 220, 160, 5876],
    ['SM-20-108', '无缝管', '20#', '108×4.5', '衡阳', '无锡', 'volatile', 6, 'stable', 5748, -.0118, .0112, 1.31, .0094, .28, -40, 45, 640, 380, 5810],
    ['SM-20-159', '无缝管', '20#', '159×6', '衡阳', '无锡', 'stable', 22, 'stable', 6042, .0028, .0054, 1.01, .0049, -.04, 20, 55, 180, 140, 6018]
  ];

  /* ---------------- 打分与派生 ---------------- */
  /* 单项得分：带内线性插值，保证「全部落平稳档 → 总分 ≤ 30」「全部落加速档 → 总分 ≥ 70」 */
  function scoreOne(v, t) {
    if (v < t[0]) return 30 * (v / t[0]);
    if (v < t[1]) return 30 + 40 * (v - t[0]) / (t[1] - t[0]);
    return 70 + 30 * Math.min(1, (v - t[1]) / t[1]);
  }
  function bandOf(v, t) { return v >= t[1] ? 'accel' : v >= t[0] ? 'volatile' : 'stable'; }
  function buildScore(d) {
    const rows = [
      { i: 0, v: Math.abs(d.chg7d), t: [.010, .030], fmt: x => (x * 100).toFixed(2) + '%' },
      { i: 1, v: d.accel, t: [1.2, 1.8], fmt: x => x.toFixed(2) },
      { i: 2, v: d.vol20, t: [.008, .018], fmt: x => (x * 100).toFixed(2) + '%' },
      { i: 3, v: d.disp, t: [.008, .015], fmt: x => (x * 100).toFixed(2) + '%' },
      { i: 4, v: Math.abs(d.merchantChg), t: [.15, d.chg7d < 0 ? .40 : .25], fmt: x => (x * 100).toFixed(0) + '%' },
      { i: 5, v: Math.abs(d.millAdj), t: [30, 80], fmt: x => x.toFixed(0) + ' 元/吨' },
      { i: 6, v: Math.abs(d.sentiment - 55), t: [12, 25], fmt: () => d.sentiment.toFixed(0) }
    ];
    let total = 0;
    const detail = rows.map(r => {
      const s = scoreOne(r.v, r.t);
      const w = THRESHOLDS[r.i].w;
      total += s * w / 100;
      return {
        name: THRESHOLDS[r.i].name, val: r.fmt(r.v), band: bandOf(r.v, r.t),
        score: +s.toFixed(1), w: w, contrib: +(s * w / 100).toFixed(1), src: THRESHOLDS[r.i].src
      };
    });
    return { total: +total.toFixed(1), detail: detail };
  }

  const SKUS = RAW.map((r, idx) => {
    const [id, cat, material, spec, mill, region, stage, stageDays, prevStage,
      median, chg7d, vol20, accel, disp, merchantChg, millAdj, sentiment,
      onHand, monthlyUse, myCost] = r;

    const ind = { chg7d, vol20, accel, disp, merchantChg, millAdj, sentiment };
    const sc = buildScore(ind);

    /* 价格锚 */
    const p25 = Math.round(median * (1 - (disp * 1.35)));
    const min30 = Math.round(median * (1 - Math.abs(chg7d) * 1.15 - .004));
    const max30 = Math.round(median * (1 + (chg7d > 0 ? Math.abs(chg7d) * .3 : .012)));
    const millPrice = Math.round(median + (chg7d < 0 ? 8 : -14));
    const support = Math.round(millPrice * .982);

    /* 库存与用量 */
    const dailyUse = monthlyUse / 30;
    const coverDays = +(onHand / dailyUse).toFixed(1);
    const targetDays = TARGET_DAYS[stage];
    const capQty = Math.round(monthlyUse * CAP_RATIO[stage]);
    let suggestQty = Math.max(0, Math.round((targetDays - coverDays) * dailyUse));
    suggestQty = Math.min(suggestQty, capQty);

    /* 建议限价 */
    let limitPrice;
    if (stage === 'stable') limitPrice = median - 10;
    else if (stage === 'volatile') limitPrice = p25;
    else if (stage === 'accel_up') limitPrice = median + 20;
    else limitPrice = Math.min(min30 - 20, support);
    limitPrice = Math.round(limitPrice);

    /* 建议动作文案 */
    let action, actionTone;
    if (stage === 'accel_down') { action = suggestQty > 0 ? '仅按在手订单背靠背采购' : '暂停采购'; actionTone = 'red'; }
    else if (stage === 'accel_up') { action = suggestQty > 0 ? '提前锁量锁价，补至 ' + targetDays + ' 天' : '库存已充足，维持不追高'; actionTone = 'orange'; }
    else if (stage === 'volatile') { action = suggestQty > 0 ? '小批量多批次，单次不超过 ' + capQty + ' 吨' : '库存超配，本期不采'; actionTone = 'yellow'; }
    else { action = suggestQty > 0 ? '按需采购，补至 ' + targetDays + ' 天安全库存' : '库存充足，随用随买'; actionTone = 'green'; }

    /* 判定理由 */
    const reasons = [];
    if (stage === 'accel_down') {
      reasons.push(`7 日跌幅 ${(chg7d * 100).toFixed(2)}%，且 3 日均速已是 10 日均速的 ${accel.toFixed(2)} 倍，属于加速下跌而非慢跌`);
      reasons.push(`平台挂牌商户数 3 日环比 +${(merchantChg * 100).toFixed(0)}%，撤牌率同步下降，说明挂出来接盘方少`);
      reasons.push(`钢厂近 7 日累计下调 ${Math.abs(millAdj)} 元/吨，成本锚下移，短期缺乏支撑`);
      reasons.push(`现价 ${median} 已${median < myCost ? '低于' : '接近'}我方库存成本 ${myCost}，此时补货会拉低而非摊薄整体成本的判断并不成立`);
    } else if (stage === 'accel_up') {
      reasons.push(`7 日涨幅 +${(chg7d * 100).toFixed(2)}%，加速度 ${accel.toFixed(2)}，涨势在走强而非见顶回落`);
      reasons.push(`平台挂牌商户数 3 日环比 ${(merchantChg * 100).toFixed(0)}%，货源持续收缩，撤牌率上升（挂出来很快被拿走）`);
      reasons.push(`钢厂近 7 日累计上调 ${millAdj} 元/吨，成本锚上移`);
      reasons.push(`成交情绪指数 ${sentiment}，处于偏乐观区间，短期回落概率低`);
    } else if (stage === 'volatile') {
      reasons.push(`7 日${chg7d < 0 ? '跌' : '涨'}幅 ${(Math.abs(chg7d) * 100).toFixed(2)}%，尚未突破 3% 的加速阈值`);
      reasons.push(`线上报价离散度 ${(disp * 100).toFixed(2)}%，较平稳期明显放大 —— 有人急着出货，有人还在扛价，分歧加大`);
      reasons.push(`挂牌商户数环比 ${(merchantChg * 100).toFixed(0)}%，量能变化尚未形成单边趋势`);
      reasons.push(`方向未明，此阶段的核心是缩小单次采购量、缩短敞口周期`);
    } else {
      reasons.push(`7 日振幅仅 ${(Math.abs(chg7d) * 100).toFixed(2)}%，20 日波动率 ${(vol20 * 100).toFixed(2)}%，处于窄幅整理`);
      reasons.push(`线上报价高度集中（离散度 ${(disp * 100).toFixed(2)}%），市场无明显分歧`);
      reasons.push(`钢厂近 7 日调价 ${Math.abs(millAdj)} 元/吨，成本端稳定`);
      reasons.push(`当前库存可供 ${coverDays} 天，${coverDays > targetDays ? '已超出目标备货天数，不必补货' : '低于目标备货天数，可按需补至安全水位'}`);
    }

    /* 价格序列：从当前中位价按日变化率倒推，保证末点收敛于 median 且与 7 日涨跌幅一致 */
    const rnd = global.Mock.seeded(900 + idx);
    const rCur = chg7d / 7;
    const rPrev = prevStage === 'stable' ? 0 : rCur * .30;
    const series = new Array(30);
    series[29] = median;
    let v = median;
    for (let i = 28; i >= 0; i--) {
      const rate = i >= 22 ? rCur : (i >= 30 - stageDays ? rCur * .70 : rPrev);
      const noise = (rnd() - .5) * .0022;
      v = v / (1 + rate + noise);
      series[i] = Math.round(v);
    }

    const bands = [];
    if (stageDays < 29) bands.push({ from: 0, to: 29 - stageDays, stage: prevStage });
    bands.push({ from: Math.max(0, 29 - stageDays), to: 29, stage: stage });

    /* 阶段转换概率（未来3日） */
    const nextProb = stage === 'accel_down' ? { keep: 62, to: 'volatile', p: 31, other: 7 }
      : stage === 'accel_up' ? { keep: 58, to: 'volatile', p: 34, other: 8 }
        : stage === 'volatile' ? { keep: 47, to: chg7d < 0 ? 'accel_down' : 'accel_up', p: 34, other: 19 }
          : { keep: 71, to: 'volatile', p: 24, other: 5 };

    return {
      id, cat, material, spec, mill, region, stage, stageDays, prevStage,
      ind, score: sc.total, scoreDetail: sc.detail,
      price: { median, p25, min30, max30, mill: millPrice, support, myCost, limitPrice },
      stock: { onHand, monthlyUse, dailyUse: +dailyUse.toFixed(1), coverDays, targetDays, capQty, suggestQty },
      advice: {
        action, actionTone, limitPrice, suggestQty, targetDays, capQty,
        prepay: PREPAY[stage], term: TERM[stage], lock: LOCK[stage], push: PUSH[stage], reasons
      },
      series, bands, nextProb,
      label: material + ' ' + spec
    };
  });

  /* ---------------- 今日阶段切换 ---------------- */
  const TRANSITIONS = [
    { time: '09:12', id: 'RB-400E-020', from: 'volatile', to: 'accel_down', trigger: '7 日跌幅由 2.4% 扩大至 3.42%，加速度 2.14 突破阈值，挂牌商户数 3 日 +124%', push: '采购主管 + 总经理', act: '已自动拦截一笔 3,000 吨采购申请' },
    { time: '09:12', id: 'RB-400E-018', from: 'volatile', to: 'accel_down', trigger: '同品类联动确认：跌幅 3.21%，加速度 2.04', push: '采购主管 + 总经理', act: '限价由 3,520 下调至 3,354' },
    { time: '10:36', id: 'GI-DX51D-100', from: 'volatile', to: 'accel_up', trigger: '7 日涨幅 3.62%，挂牌商户数 3 日 −48%，钢厂累计上调 130 元/吨', push: '采购主管 + 总经理', act: '建议锁价 1~3 个月，补至 18 天备货' },
    { time: '10:36', id: 'GI-DX51D-080', from: 'volatile', to: 'accel_up', trigger: '涨幅 3.48%，货源收缩 −42%', push: '采购主管 + 总经理', act: '建议同步锁量' },
    { time: '11:48', id: 'HB-Q235B-200', from: 'volatile', to: 'accel_down', trigger: '跌幅 3.12%，挂牌商户 47 家（+22），撤牌率降至 6%', push: '采购主管 + 总经理', act: '暂停型材备货采购' },
    { time: '13:20', id: 'MP-Q345B-250', from: 'stable', to: 'volatile', trigger: '离散度由 0.55% 升至 0.98%，钢厂上调 40 元/吨', push: '采购员 + 采购主管', act: '单次采购量上限收紧至 48 吨' },
    { time: '14:05', id: 'RB-400E-032', from: 'volatile', to: 'stable', trigger: '连续 2 期跌幅收敛至 0.42%，离散度回落至 0.58%', push: '采购员', act: '恢复常规按需采购节奏' }
  ];

  /* ---------------- 回测效果 ---------------- */
  const BACKTEST = {
    months: ['3月', '4月', '5月', '6月', '7月', '8月'],
    followed: [62, 71, 78, 84, 88, 91],          // 建议采纳率 %
    saved: [12.4, 26.8, 21.3, 48.6, 63.2, 57.4], // 节省采购成本 万元
    avgCostGap: [-6, -11, -9, -22, -31, -28]      // 采购均价 vs 市场均价（元/吨，负数为低于市场）
  };

  global.Pricing = { STAGES, STAGE_ORDER, THRESHOLDS, STRATEGY, SKUS, TRANSITIONS, BACKTEST };
})(window);
