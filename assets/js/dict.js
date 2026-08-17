/* ==========================================================================
   数据字典 —— 14 类数据源的字段级输入 / 校验 / 输出规范
   字段行格式：[字段名, 类型, 必填(1/0), 业务口径与说明, 示例]
   输出行格式：[字段名, 类型, 说明, 消费方]
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 通用规范                                                            */
  /* ------------------------------------------------------------------ */
  const COMMON = {
    layers: [
      { code: 'ODS', name: '贴源层', desc: '与源系统字段一一对应，原样落地不做加工，仅加采集时间与批次号，用于问题回溯与重跑', keep: '明细 2 年' },
      { code: 'DWD', name: '明细层', desc: '完成清洗、口径统一、规格编码标准化、主数据映射，一行一业务事实', keep: '明细 2 年' },
      { code: 'DWS', name: '汇总层', desc: '按「规格-区域-时间」「客户-账期」等维度聚合，产出可直接看的指标', keep: '聚合 5 年' },
      { code: 'FEA', name: '特征层', desc: '模型直接消费的宽表，含派生特征与滑窗统计，带特征版本号', keep: '按模型版本' },
      { code: 'VEC', name: '向量层', desc: '非结构化文本切片与向量，供 RAG 检索', keep: '长期' }
    ],
    caliber: [
      ['重量口径', '统一按【磅计】（实际过磅重量）', '平台商户按理计报价的，按品种理计/磅计系数换算后再比价。螺纹钢理计与磅计差约 1.5%~3%，不换算直接比价会得出完全错误的价差结论', '理计 300 吨 × 0.982 = 磅计 294.6 吨'],
      ['价格口径', '统一按【不含税、提货价、元/吨】', '含税价 ÷ (1 + 税率) 转不含税；送到价扣减对应区域运费基准转提货价。三者任一不统一，同业比价就是错的', '含税送到价 3,920 → 不含税提货价 3,428'],
      ['税率', '默认 13%，以单据实际税率为准', '票据数据里如出现 9% / 6% 需按单据取值，不得用默认值覆盖', 'tax_rate = 0.13'],
      ['金额单位', '数据层一律用【元】，展示层再换算', '内部报表习惯用万元，但入湖统一元，避免万/元混用导致量级错误', '10,800,000 元'],
      ['数量精度', 'decimal(18,3)，单位吨', '钢材过磅到公斤级，保留三位小数', '294.615'],
      ['金额精度', 'decimal(18,2)，单位元', '', '3,428.57'],
      ['时间口径', 'Asia/Shanghai，ISO 8601 带时区', '平台数据流为准实时，时区不统一会导致「近3日」窗口错位', '2026-08-17T09:20:11+08:00'],
      ['账期起算', '统一按【发货日】起算', 'ERP 若按对账日或开票日记账，需在 DWD 层换算，否则逾期天数系统性偏小', 'due_date = ship_date + credit_days'],
      ['币种', 'CNY', '', 'CNY']
    ],
    keys: [
      ['customer_key', '客户主键', '优先取统一社会信用代码（uscc）；无 uscc 时取 md5(标准化企业名称)。ERP 客户编码只作为业务侧别名保留', '失信检测 API 靠 uscc 匹配，没有它整条客户风险链路都跑不通'],
      ['supplier_key', '供应商主键', '同 customer_key 规则', '同一家公司既是客户又是供应商时，两个身份指向同一 key'],
      ['merchant_id ↔ supplier_key/customer_key', '平台商户与我方往来单位的关联', '通过 uscc 把平台入驻商户与我方客户、供应商打通', '这是「客户同时是平台商户，可观察其抛售行为」这条能力的技术前提'],
      ['sku_std_code', '规格标准编码', '结构：品类-材质-规格-长度-钢厂，如 RB-400E-020-9000-SG', 'ERP 物料码与平台挂牌规格都映射到它，是所有市场类特征的连接键'],
      ['batch_key', '库存批次主键', 'warehouse_code + batch_no', '钢贸按批次核算成本与库龄，不能只到 SKU 粒度'],
      ['event_id', '风险事件主键', '失信 API 返回的事件唯一 ID，用于幂等去重', '同一事件多次巡检重复返回，靠它避免重复上调风险']
    ],
    quality: [
      { lv: 'L1', name: '阻断级', color: 'red', act: '拒绝入湖，进异常队列并告警', rules: ['主键缺失或重复', '必填字段为空', '规格无法映射到 sku_std_code', '客户无法匹配 customer_key', '价格/数量为负数或零'] },
      { lv: 'L2', name: '告警级', color: 'orange', act: '允许入湖但标记 low_confidence，模型降权使用', rules: ['值域越界（如钢材价格不在 1,000~30,000 元/吨）', '理计与磅计偏差 > 5%', '同规格报价偏离全平台中位数 ±20%', '行情指数样本数 < 20', '规格映射置信度 < 85%'] },
      { lv: 'L3', name: '记录级', color: 'yellow', act: '正常入湖，仅记录数据质量日志', rules: ['非关键字段缺失（如垛位、质保书号）', '文本字段超长被截断', '枚举值出现新取值（自动进入待扩充字典）'] }
    ]
  };

  /* ------------------------------------------------------------------ */
  /* 数据源明细                                                          */
  /* ------------------------------------------------------------------ */
  const SOURCES = [

    /* ===================== 一、企业内部结构化 ===================== */
    {
      id: 'inv', group: 'in', groupName: '企业内部 · 结构化', name: 'ERP 库存台账', table: 'ods_erp_inventory → dwd_inventory_batch',
      meta: { way: 'DB 直连（只读从库）/ CDC 增量', freq: '每 15 分钟', pk: 'warehouse_code + batch_no', inc: '按 update_time 增量，每日 02:00 全量对账', vol: '约 1,200 行/日变更', role: '库存呆滞与跌价预测的事实基础' },
      input: [
        ['inv_id', 'string(32)', 1, 'ERP 库存记录 ID', 'INV-2026063000812'],
        ['batch_no', 'string(32)', 1, '批次号。钢贸按批次核算成本与库龄，必须到批次，不能只给 SKU 汇总', 'PC-20260630-008'],
        ['erp_sku_code', 'string(64)', 1, 'ERP 物料编码，用于映射标准规格码', '螺纹钢HRB400E-20-沙钢-9M'],
        ['sku_name', 'string(128)', 1, '品名', '螺纹钢'],
        ['material', 'string(32)', 1, '材质牌号。映射规格码的关键字段之一，不能写在品名里混着给', 'HRB400E'],
        ['spec', 'string(64)', 1, '规格。棒材给直径，板卷给「厚×宽×长/C」', 'Φ20 / 3.0*1250*C'],
        ['length', 'string(16)', 0, '定尺长度，米。棒材必填', '9M'],
        ['mill', 'string(32)', 1, '钢厂。同规格不同钢厂价差可达 30~80 元/吨，缺失将导致比价失真', '沙钢'],
        ['origin', 'string(32)', 0, '产地', '江苏张家港'],
        ['warehouse_code', 'string(32)', 1, '仓库编码', 'WH-SH-002'],
        ['location', 'string(32)', 0, '垛位号', 'A-12-03'],
        ['qty_theory', 'decimal(18,3)', 1, '理计数量（吨）。理论重量', '300.000'],
        ['qty_actual', 'decimal(18,3)', 1, '过磅数量（吨）。实际重量，作为统一口径基准', '294.615'],
        ['piece_count', 'int', 0, '件数 / 支数', '120'],
        ['unit_cost', 'decimal(18,2)', 1, '加权移动平均成本单价，元/吨。必须标明是否含税', '3598.00'],
        ['cost_tax_included', 'boolean', 1, '成本单价是否含税。缺失将无法与平台不含税报价对比', 'false'],
        ['tax_rate', 'decimal(6,4)', 1, '税率', '0.1300'],
        ['inbound_date', 'date', 1, '入库日期，库龄计算起点。分批入库的批次取最早一次', '2026-06-30'],
        ['inbound_doc_no', 'string(32)', 0, '入库单号', 'IN-20260630-0042'],
        ['quality_cert_no', 'string(64)', 0, '质保书号。带质保与不带质保市场价差明显', 'SG20260612-3381'],
        ['status', 'enum', 1, '在库 / 在途 / 已售未发 / 锁定 / 质押', '在库'],
        ['pledge_flag', 'boolean', 0, '是否已质押融资。质押货不可自由处置，处置方案测算必须排除', 'false'],
        ['update_time', 'datetime', 1, '记录更新时间，增量同步水位线', '2026-08-17T09:15:00+08:00']
      ],
      rules: [
        'L1：batch_no + warehouse_code 唯一；material / spec / mill 任一为空拒绝入湖（无法映射规格码）',
        'L1：qty_actual ≤ 0 拒绝入湖',
        'L2：|qty_actual − qty_theory| / qty_theory > 5% 标记磅差异常，人工复核',
        'L2：unit_cost 不在 [1000, 30000] 区间标记异常',
        'L1：inbound_date > 当前日期 拒绝（未来日期）',
        '口径转换：cost_tax_included = true 时，unit_cost_ex_tax = unit_cost / (1 + tax_rate)',
        'pledge_flag = true 的批次在处置方案测算中排除可售数量'
      ],
      output: [
        ['batch_key', 'string', 'warehouse_code + batch_no 拼接主键', '全部下游'],
        ['sku_std_code', 'string', '标准规格编码（映射产出），连接平台市场数据的键', '市场类特征、比价'],
        ['stock_qty_t', 'decimal(18,3)', '在库量（吨），统一取磅计口径', '呆滞模型 / 库存看板'],
        ['unit_cost_ex_tax', 'decimal(18,2)', '不含税成本单价（元/吨），与平台报价同口径', '浮亏测算 / 比价'],
        ['stock_amount', 'decimal(18,2)', '批次货值 = stock_qty_t × unit_cost_ex_tax', '风险敞口汇总'],
        ['age_days', 'int', '库龄天数 = 统计日 − inbound_date', '呆滞模型（重要特征）'],
        ['age_bucket', 'enum', '库龄分桶：0-15 / 16-30 / 31-60 / 61-90 / 90+', '看板 / 分层策略'],
        ['outbound_qty_30d', 'decimal(18,3)', '近 30 日该批次出库量', '周转速度特征'],
        ['turnover_rate_90d', 'decimal(6,4)', '近 90 日周转率', '呆滞模型'],
        ['days_of_supply', 'decimal(8,2)', '按近 30 日出库速度可供销售天数', '呆滞模型 / 采购建议'],
        ['sellable_qty_t', 'decimal(18,3)', '可处置数量 = 在库 − 已售未发 − 锁定 − 质押', '处置方案测算'],
        ['is_low_confidence', 'boolean', '是否命中 L2 质量规则', '模型降权']
      ],
      sample: {
        batch_key: 'WH-SH-002#PC-20260630-008', sku_std_code: 'RB-400E-020-9000-SG',
        stock_qty_t: 1820.450, unit_cost_ex_tax: 3184.07, stock_amount: 5798247.32,
        age_days: 47, age_bucket: '31-60', outbound_qty_30d: 186.200, turnover_rate_90d: 0.54,
        days_of_supply: 293.4, sellable_qty_t: 1820.450, is_low_confidence: false
      },
      consumers: ['库存呆滞&跌价预测模型', '库存风控智能体', '库存风险看板', 'GET /v1/risk/inventory', 'POST /v1/advice/allocation']
    },

    {
      id: 'order', group: 'in', groupName: '企业内部 · 结构化', name: '采购 / 销售订单', table: 'ods_erp_order → dwd_order_line',
      meta: { way: 'DB 直连 + 业务事件实时上送', freq: '每 15 分钟 / 事件级实时', pk: 'order_no + line_no', inc: '按 update_time 增量', vol: '约 1,284 单/月', role: '周转速度、采购集中度、在手敞口的来源' },
      input: [
        ['order_no', 'string(32)', 1, '订单号', 'SO-20260817-0244'],
        ['line_no', 'int', 1, '行号。一单多规格必须拆行给，不能合并成一行', '1'],
        ['order_type', 'enum', 1, 'PO 采购订单 / SO 销售订单', 'SO'],
        ['order_date', 'date', 1, '下单日期', '2026-08-17'],
        ['customer_code', 'string(32)', 0, '客户编码，SO 必填', 'C10086'],
        ['supplier_code', 'string(32)', 0, '供应商编码，PO 必填', 'S2043'],
        ['erp_sku_code', 'string(64)', 1, 'ERP 物料编码', '螺纹钢HRB400E-20-沙钢-9M'],
        ['batch_no', 'string(32)', 0, '批次号。SO 发货后必填，用于回溯配货是否按建议执行', 'PC-20260630-008'],
        ['qty_t', 'decimal(18,3)', 1, '订单数量（吨）', '300.000'],
        ['weight_basis', 'enum', 1, '计重方式：理计 / 磅计。缺失无法与平台报价同口径对比', '磅计'],
        ['unit_price', 'decimal(18,2)', 1, '单价，元/吨', '3560.00'],
        ['price_tax_included', 'boolean', 1, '单价是否含税', 'true'],
        ['price_basis', 'enum', 1, '价格基准：提货价 / 送到价。送到价含运费，不区分会高估我方售价', '提货价'],
        ['amount', 'decimal(18,2)', 1, '行金额', '1068000.00'],
        ['payment_type', 'enum', 1, '结算方式：cash 款到发货 / credit 赊销 / advance 预付', 'credit'],
        ['credit_days', 'int', 0, '账期天数，赊销必填', '60'],
        ['prepay_ratio', 'decimal(5,4)', 0, '预付比例，PO 预付时必填。用于计算预付款损失敞口', '0.4000'],
        ['delivery_date', 'date', 0, '约定交货日期', '2026-08-28'],
        ['shipped_qty', 'decimal(18,3)', 0, '已发数量', '0.000'],
        ['settle_qty', 'decimal(18,3)', 0, '结算数量。钢材按实际过磅结算，与订单量常有差异', '0.000'],
        ['status', 'enum', 1, '待审 / 已审 / 部分执行 / 完成 / 作废', '已审'],
        ['update_time', 'datetime', 1, '更新时间', '2026-08-17T10:02:00+08:00']
      ],
      rules: [
        'L1：order_type = SO 时 customer_code 必填；= PO 时 supplier_code 必填',
        'L1：payment_type = credit 且 credit_days 为空拒绝入湖（账龄无法计算）',
        'L2：unit_price 偏离同期同规格平台均价 ±20% 标记异常报价',
        'L1：qty_t ≤ 0 或 amount 与 qty_t × unit_price 偏差 > 1% 拒绝',
        '口径转换：统一换算为不含税提货价磅计口径后再参与比价',
        '作废单据（status = 作废）不参与任何统计，但保留用于分析异常撤单行为'
      ],
      output: [
        ['sku_std_code', 'string', '标准规格编码', '市场比价'],
        ['unit_price_std', 'decimal(18,2)', '统一口径单价（不含税/提货/磅计）', '价格偏离度特征'],
        ['price_deviation_vs_market', 'decimal(6,4)', '与平台同规格同期均价的偏离度', '报价风控 / 呆滞模型'],
        ['sales_qty_30d', 'decimal(18,3)', '按 SKU 汇总的近 30 日销量', '周转速度'],
        ['open_po_qty / open_po_amount', 'decimal', '在手未交付采购量与金额（按供应商汇总）', '供应链风险子模型'],
        ['supplier_concentration', 'decimal(5,4)', '单一供应商采购占比（近 12 个月）', '供应链风险子模型'],
        ['prepay_exposure', 'decimal(18,2)', '预付款敞口 = 未交付订单金额 × 预付比例', '供应商风险告警'],
        ['allocation_followed', 'boolean', '发货批次是否与配货建议一致', '数据飞轮效果归因']
      ],
      sample: {
        order_no: 'SO-20260817-0244', sku_std_code: 'RB-400E-020-9000-SG', qty_t: 300.000,
        unit_price_std: 3150.44, price_deviation_vs_market: 0.0253,
        payment_type: 'credit', credit_days: 60, allocation_followed: true
      },
      consumers: ['库存呆滞模型', '供应链风险预测子模型', '采购审批风控', 'POST /v1/risk/purchase/check']
    },

    {
      id: 'ar', group: 'in', groupName: '企业内部 · 结构化', name: '应收台账', table: 'ods_erp_ar → dwd_ar_detail',
      meta: { way: 'DB 直连 + 回款事件实时上送', freq: '每 1 小时 / 回款事件实时', pk: 'ar_id', inc: '按 update_time 增量，每日全量对账', vol: '42 家客户 / 约 860 笔在途', role: '坏账概率模型的核心事实表' },
      input: [
        ['ar_id', 'string(32)', 1, '应收记录 ID', 'AR-20260612-0331'],
        ['customer_code', 'string(32)', 1, '客户编码', 'C10086'],
        ['order_no', 'string(32)', 0, '关联销售订单号', 'SO-20260612-0119'],
        ['invoice_no', 'string(32)', 0, '关联发票号', 'FP-20260615-0088'],
        ['ar_amount', 'decimal(18,2)', 1, '应收金额（含税）', '1068000.00'],
        ['ship_date', 'date', 1, '发货日期。统一账期起算基准，必须提供', '2026-06-12'],
        ['billing_date', 'date', 0, '开票日期', '2026-06-15'],
        ['reconcile_date', 'date', 0, '对账日期。若 ERP 按对账日起算账期，需同时给出用于换算', '2026-06-30'],
        ['period_base', 'enum', 1, '本单账期起算口径：发货日 / 对账日 / 开票日', '发货日'],
        ['credit_days', 'int', 1, '账期天数', '60'],
        ['due_date', 'date', 1, '到期日。若与 ship_date + credit_days 不符需说明原因', '2026-08-11'],
        ['received_amount', 'decimal(18,2)', 1, '已收金额', '682000.00'],
        ['balance', 'decimal(18,2)', 1, '应收余额 = ar_amount − received_amount', '386000.00'],
        ['settle_method', 'enum', 1, '结算方式：电汇 / 银行承兑 / 商业承兑 / 现金 / 抵货', '银行承兑'],
        ['last_payment_date', 'date', 0, '最近一次回款日期', '2026-07-28'],
        ['write_off_flag', 'boolean', 0, '是否已核销坏账。模型训练的正样本标签来源', 'false'],
        ['write_off_amount', 'decimal(18,2)', 0, '核销金额', null],
        ['update_time', 'datetime', 1, '更新时间', '2026-08-17T09:00:00+08:00']
      ],
      rules: [
        'L1：balance ≠ ar_amount − received_amount 时拒绝入湖（账实不符）',
        'L1：due_date < ship_date 拒绝',
        'L2：period_base ≠ 发货日时，在 DWD 层统一换算为发货日口径并记录换算日志。不换算会导致逾期天数系统性偏小 10~20 天',
        'L2：settle_method = 商业承兑 时单独标记（商承兑付风险显著高于银承）',
        'write_off_flag = true 的记录作为坏账模型的正样本标签，需保留至少 24 个月'
      ],
      output: [
        ['customer_key', 'string', '客户主键（uscc）', '全部下游'],
        ['ar_balance', 'decimal(18,2)', '客户应收余额合计', '坏账模型 / 应收看板'],
        ['overdue_amount', 'decimal(18,2)', '逾期金额 = 已过 due_date 未收部分', '坏账模型（重要特征）'],
        ['overdue_days_max', 'int', '最长逾期天数（统一按发货日口径）', '坏账模型'],
        ['aging_bucket_amount', 'json', '账龄分桶金额：未到期 / 1-30 / 31-60 / 61-90 / 90+', '应收看板'],
        ['on_time_payment_rate_12m', 'decimal(5,4)', '近 12 期回款准时率', '坏账模型（重要特征）'],
        ['avg_collection_days', 'decimal(8,2)', '平均回款周期 DSO', '坏账模型'],
        ['acceptance_ratio', 'decimal(5,4)', '承兑结算占比', '坏账模型（隐性风险）'],
        ['commercial_acceptance_ratio', 'decimal(5,4)', '商业承兑占比。占比走高常先于逾期出现', '坏账模型（隐性风险）'],
        ['bad_debt_label', 'boolean', '坏账标签（训练用）', '模型训练']
      ],
      sample: {
        customer_key: '91310000MA1XXXXX8N', ar_balance: 10800000.00, overdue_amount: 3860000.00,
        overdue_days_max: 63, on_time_payment_rate_12m: 0.5833, avg_collection_days: 78.4,
        acceptance_ratio: 0.62, commercial_acceptance_ratio: 0.28,
        aging_bucket_amount: { '未到期': 6940000, '1-30': 0, '31-60': 1240000, '61-90': 2620000, '90+': 0 }
      },
      consumers: ['应收坏账概率预测模型', '客户应收风控智能体', '应收看板', 'GET /v1/risk/customer', 'POST /v1/risk/customer/batch']
    },

    {
      id: 'credit', group: 'in', groupName: '企业内部 · 结构化', name: '客户授信档案', table: 'ods_erp_credit → dwd_customer_profile',
      meta: { way: 'DB 直连', freq: '每 1 小时', pk: 'customer_code', inc: '全量小表', vol: '42 家赊销客户 / 316 家往来客户', role: '客户主数据与行业标签的唯一来源' },
      input: [
        ['customer_code', 'string(32)', 1, 'ERP 客户编码', 'C10086'],
        ['customer_name', 'string(128)', 1, '企业全称。必须是工商全称，不能用简称或业务习惯称呼，否则失信 API 匹配不到', '宏基建设集团有限公司'],
        ['uscc', 'string(18)', 1, '统一社会信用代码。强烈要求必填 —— 这是失信检测 API 的匹配键，也是与平台商户打通的关联键', '91310000MA1XXXXX8N'],
        ['industry_code', 'string(16)', 1, '下游行业分类。行业联动推演（建材抛货→地产客户批量上调）完全依赖它，不能空', 'F-房建工程'],
        ['region_code', 'string(16)', 1, '所在区域', 'SH-上海'],
        ['credit_limit', 'decimal(18,2)', 1, '授信额度（元）', '12000000.00'],
        ['credit_days_std', 'int', 1, '标准账期天数', '60'],
        ['guarantee_type', 'enum', 0, '担保方式：信用 / 保证金 / 抵押 / 第三方担保 / 实控人连带', '信用'],
        ['guarantee_amount', 'decimal(18,2)', 0, '担保金额', null],
        ['cooperation_start_date', 'date', 1, '合作起始日期', '2021-04-18'],
        ['sales_owner', 'string(32)', 1, '业务归属人。风险推送的接收人', '李娜'],
        ['legal_person', 'string(64)', 0, '法定代表人', '王建国'],
        ['registered_capital', 'decimal(18,2)', 0, '注册资本', '50000000.00'],
        ['is_platform_merchant', 'boolean', 0, '是否为自有资源平台入驻商户', 'true'],
        ['merchant_id', 'string(32)', 0, '平台商户 ID。填了才能观察其挂牌抛售行为', 'M0421'],
        ['related_party', 'json', 0, '关联方名单（同一实控人的其他企业）。关联方风险传导的判断依据', '["宏基置业有限公司"]'],
        ['status', 'enum', 1, '正常 / 暂停合作 / 黑名单', '正常']
      ],
      rules: [
        'L1：uscc 为空或未通过 18 位校验码校验 → 拒绝入湖并推送待补录清单（该客户所有风险能力失效）',
        'L1：industry_code 不在行业字典内 → 拒绝入湖',
        'L2：customer_name 与 uscc 工商登记名称不一致 → 告警，以工商名称为准',
        'L2：credit_limit = 0 但存在赊销订单 → 告警',
        'is_platform_merchant = true 但 merchant_id 为空 → 通过 uscc 自动补齐'
      ],
      output: [
        ['customer_key', 'string', '客户主键 = uscc', '全部下游'],
        ['industry_l1 / industry_l2', 'string', '标准化行业一级 / 二级分类', '全局中枢行业联动推演'],
        ['credit_limit', 'decimal(18,2)', '原始授信额度', '授信校验'],
        ['risk_adjusted_limit', 'decimal(18,2)', '风险调整后建议授信额度（模型输出）', 'GET /v1/credit/available'],
        ['credit_utilization', 'decimal(5,4)', '授信使用率 = ar_balance / credit_limit', '坏账模型'],
        ['cooperation_months', 'int', '合作月数', '坏账模型'],
        ['historical_max_ar', 'decimal(18,2)', '历史最高应收余额', '异常放量识别'],
        ['is_platform_merchant / merchant_id', 'boolean/string', '平台商户身份与 ID', '挂牌抛售行为特征'],
        ['related_party_keys', 'array', '关联方 uscc 列表', '关联方风险传导']
      ],
      sample: {
        customer_key: '91310000MA1XXXXX8N', customer_name: '宏基建设集团有限公司',
        industry_l1: '建筑业', industry_l2: '房建工程', region_code: 'SH-上海',
        credit_limit: 12000000.00, risk_adjusted_limit: 3000000.00, credit_utilization: 0.9000,
        cooperation_months: 64, is_platform_merchant: true, merchant_id: 'M0421',
        related_party_keys: ['91310000MA1YYYYY3K']
      },
      consumers: ['应收坏账模型', '经营全局风控中枢（行业筛查）', '失信检测 API 调用入参', 'GET /v1/credit/available']
    },

    {
      id: 'bill', group: 'in', groupName: '企业内部 · 结构化', name: '财务票据数据', table: 'ods_erp_bill → dwd_bill_detail',
      meta: { way: '接口 / 文件（票据系统）', freq: '每日', pk: 'bill_no', inc: '按 update_time 增量', vol: '约 862 张/月', role: '承兑敞口与隐性资金风险特征' },
      input: [
        ['bill_no', 'string(64)', 1, '票据号码', '3100005120260812345678'],
        ['bill_type', 'enum', 1, '银行承兑汇票 / 商业承兑汇票 / 增值税专用发票 / 普通发票', '商业承兑汇票'],
        ['direction', 'enum', 1, '收 / 付', '收'],
        ['customer_code', 'string(32)', 0, '关联客户（收票时必填）', 'C10086'],
        ['supplier_code', 'string(32)', 0, '关联供应商（付票时必填）', null],
        ['amount', 'decimal(18,2)', 1, '票面金额', '2000000.00'],
        ['issue_date', 'date', 1, '出票日期', '2026-06-12'],
        ['due_date', 'date', 1, '到期日期', '2026-12-12'],
        ['acceptor_name', 'string(128)', 0, '承兑人名称。商承必填 —— 承兑人是谁决定了兑付风险高低', '宏基建设集团有限公司'],
        ['acceptor_uscc', 'string(18)', 0, '承兑人统一社会信用代码。用于对承兑人单独做失信检测', '91310000MA1XXXXX8N'],
        ['endorse_count', 'int', 0, '背书次数。背书链过长的商票兑付风险显著上升', '4'],
        ['status', 'enum', 1, '在手 / 已背书 / 已贴现 / 已托收 / 已兑付 / 拒付', '在手'],
        ['dishonor_date', 'date', 0, '拒付日期', null],
        ['tax_rate', 'decimal(6,4)', 0, '发票税率（票据类型为发票时必填）', '0.1300'],
        ['update_time', 'datetime', 1, '更新时间', '2026-08-17T08:30:00+08:00']
      ],
      rules: [
        'L1：due_date ≤ issue_date 拒绝入湖',
        'L1：bill_type = 商业承兑汇票 且 acceptor_name 为空 → 拒绝（无法评估兑付主体）',
        'L2：endorse_count > 5 标记高背书风险',
        'L2：acceptor_uscc 不在客户主数据内 → 自动发起失信检测建档',
        'status = 拒付 的票据触发实时风险重算并推送高风险预警'
      ],
      output: [
        ['acceptance_exposure', 'decimal(18,2)', '在手承兑敞口合计（按客户）', '坏账模型'],
        ['commercial_acceptance_ratio', 'decimal(5,4)', '商承占该客户结算比例', '坏账模型（隐性风险特征）'],
        ['acceptor_risk_level', 'enum', '承兑人风险等级（对承兑人单独跑失信检测）', '坏账模型'],
        ['avg_endorse_count', 'decimal(5,2)', '平均背书次数', '坏账模型'],
        ['dishonor_count_24m', 'int', '近 24 个月拒付次数', '坏账模型（强特征）'],
        ['bill_due_within_30d', 'decimal(18,2)', '30 天内到期票据金额', '资金计划 / 回款预测']
      ],
      sample: {
        customer_key: '91310000MA1XXXXX8N', acceptance_exposure: 6700000.00,
        commercial_acceptance_ratio: 0.28, acceptor_risk_level: 'high',
        avg_endorse_count: 4.2, dishonor_count_24m: 0, bill_due_within_30d: 2000000.00
      },
      consumers: ['应收坏账模型', '客户应收风控智能体']
    },

    /* ===================== 二、企业内部非结构化 ===================== */
    {
      id: 'chat', group: 'un', groupName: '企业内部 · 非结构化', name: '业务员沟通纪要', table: 'ods_crm_chat → vec_chat_chunk',
      meta: { way: '企微会话存档 API / CRM 同步', freq: '每日 T+1', pk: 'msg_id', inc: '按 occurred_at 增量', vol: '6,842 篇 / 约 41,260 切片', role: '隐性风险语义挖掘（二期）' },
      input: [
        ['msg_id', 'string(64)', 1, '消息 / 会话 ID', 'WX-20260812-99271'],
        ['customer_code', 'string(32)', 1, '关联客户编码。没有关联关系的会话无法归因，属无效数据', 'C10086'],
        ['staff_id', 'string(32)', 1, '业务员 ID', 'E0231'],
        ['channel', 'enum', 1, '企微 / 电话转写 / 邮件 / 现场拜访记录', '企微'],
        ['direction', 'enum', 1, 'in 客户发出 / out 我方发出', 'in'],
        ['content', 'text', 1, '文本内容。语音需先转写为文本', '这个月资金还在走审批流程，下周一定安排一笔'],
        ['occurred_at', 'datetime', 1, '发生时间', '2026-08-12T15:22:10+08:00'],
        ['attachment_urls', 'array', 0, '附件地址', '[]'],
        ['is_group', 'boolean', 0, '是否群聊', 'false']
      ],
      rules: [
        'L1：customer_code 为空 → 不入向量库（无法归因到客户，产生噪声）',
        '脱敏：入库前对手机号、银行账号、身份证号做掩码处理，原文不落库',
        '权限：向量检索结果按业务归属过滤，业务员只能检索到自己名下客户的会话',
        '切片：按语义段落切片，chunk 长度 300~500 字，重叠 80 字',
        'L3：单条超过 5,000 字截断并记录日志'
      ],
      output: [
        ['doc_id / chunk_id', 'string', '文档与切片 ID', '向量检索'],
        ['embedding', 'vector(1024)', '文本向量', 'RAG 检索'],
        ['customer_key', 'string', '客户主键', '特征关联'],
        ['delay_phrase_count_30d', 'int', '近 30 日拖延话术命中次数（如「走审批」「下周一定」「资金紧张」）', '坏账模型（隐性特征）'],
        ['promise_break_count', 'int', '承诺回款未兑现次数', '坏账模型（强特征）'],
        ['sentiment_score', 'decimal(5,4)', '沟通情绪分（-1 ~ 1）', '坏账模型'],
        ['risk_keyword_tags', 'array', '命中的风险关键词标签', '应收 Agent 推理素材'],
        ['last_promise_date / last_promise_amount', 'date/decimal', '最近一次口头承诺回款的时间与金额', '回款跟进策略']
      ],
      sample: {
        customer_key: '91310000MA1XXXXX8N', delay_phrase_count_30d: 14,
        promise_break_count: 3, sentiment_score: -0.42,
        risk_keyword_tags: ['资金紧张', '走审批流程', '下周一定', '老板不在'],
        last_promise_date: '2026-08-12', last_promise_amount: 500000.00
      },
      consumers: ['应收坏账模型（隐性特征）', '客户应收风控智能体 RAG', '向量知识库']
    },

    {
      id: 'meeting', group: 'un', groupName: '企业内部 · 非结构化', name: '谈判记录 / 内部研判会议记录', table: 'ods_doc_meeting → vec_meeting_chunk',
      meta: { way: '录音转写 + 文档上传', freq: '每日 T+1', pk: 'doc_id', inc: '新增文件触发', vol: '2,322 篇 / 约 6,340 切片', role: '学习公司经营风格与决策偏好（二期）' },
      input: [
        ['doc_id', 'string(64)', 1, '文档 ID', 'MT-20260805-0031'],
        ['doc_type', 'enum', 1, '客户谈判 / 供应商谈判 / 内部研判会 / 经营例会', '内部研判会'],
        ['title', 'string(256)', 1, '标题', '8月建材品类库存处置研判会'],
        ['occurred_at', 'datetime', 1, '发生时间', '2026-08-05T14:00:00+08:00'],
        ['participants', 'array', 1, '参与人列表', '["陈总","张伟","王强"]'],
        ['related_customer_code', 'string(32)', 0, '关联客户', null],
        ['related_sku_code', 'string(64)', 0, '关联品类 / 物料', '中板Q345B-20-鞍钢'],
        ['content', 'text', 1, '会议正文（录音转写文本或纪要）', '……'],
        ['decision_points', 'array', 0, '决策结论条目。有结构化结论的优先给，检索质量显著高于纯文本', '["暂不降价，观察两周"]'],
        ['file_url', 'string(512)', 0, '原始文件地址', null]
      ],
      rules: [
        'L1：content 为空或转写置信度 < 0.7 → 进人工复核队列',
        'L2：无 related_customer_code 且无 related_sku_code → 标记为泛化知识，检索时降权',
        '权限：内部研判会议记录仅管理层角色可检索',
        '切片：按议题分段，保留 decision_points 作为独立高权重切片'
      ],
      output: [
        ['embedding', 'vector(1024)', '文本向量', 'RAG 检索'],
        ['decision_style_tags', 'array', '决策偏好标签（如「宁可持货不降价」「重视现金流」）', 'Agent 生成方案时对齐公司风格'],
        ['historical_judgement', 'json', '历史研判结论与后续实际结果的配对', '数据飞轮 / 微调样本'],
        ['related_sku_std_code', 'string', '关联标准规格码', '按品类检索'],
        ['is_judgement_correct', 'boolean', '事后回填：当时研判是否正确', '微调数据集筛选']
      ],
      sample: {
        doc_id: 'MT-20260805-0031', related_sku_std_code: 'MP-Q345B-200-ANG',
        decision_style_tags: ['宁可持货不降价', '重视区域供给变化'],
        historical_judgement: { judgement: '暂不降价，观察两周', ai_advice: '建议降价40元/吨清30%', result: '市场回升90元/吨，人工判断正确' },
        is_judgement_correct: true
      },
      consumers: ['三大 Agent 的 RAG 检索', '微调数据集构建', '向量知识库']
    },

    {
      id: 'contract', group: 'un', groupName: '企业内部 · 非结构化', name: '合同扫描件', table: 'ods_doc_contract → dwd_contract_terms',
      meta: { way: 'OCR 解析 + 大模型条款抽取', freq: '按需 / 新增即触发', pk: 'contract_no', inc: '新增文件触发', vol: '1,904 份 / 约 22,180 切片', role: '账期与担保条款核对（二期）' },
      input: [
        ['contract_no', 'string(64)', 1, '合同编号', 'HT-2026-0417'],
        ['contract_type', 'enum', 1, '销售合同 / 采购合同 / 框架协议 / 补充协议', '销售合同'],
        ['party_a_name / party_b_name', 'string(128)', 1, '甲乙方全称', '宏基建设集团有限公司'],
        ['customer_code / supplier_code', 'string(32)', 1, '关联往来单位编码', 'C10086'],
        ['sign_date', 'date', 1, '签订日期', '2026-04-17'],
        ['valid_until', 'date', 0, '有效期至', '2027-04-16'],
        ['file_url', 'string(512)', 1, '扫描件地址（PDF / 图片）', 's3://contracts/HT-2026-0417.pdf'],
        ['ocr_text', 'text', 0, 'OCR 文本。若源系统已做 OCR 可直接给，否则由风控侧处理', '……'],
        ['ocr_confidence', 'decimal(5,4)', 0, 'OCR 平均置信度', '0.9420']
      ],
      rules: [
        'L1：file_url 不可访问 → 拒绝入湖',
        'L2：ocr_confidence < 0.85 → 条款抽取结果标记待人工复核，不直接用于风控判断',
        'L1：抽取出的合同账期与 ERP 应收台账 credit_days 不一致 → 生成数据核对告警（实践中高发，常导致逾期判定失真）',
        '权限：合同全文仅法务与管理层可检索，业务员仅可见抽取后的关键条款'
      ],
      output: [
        ['credit_days_contract', 'int', '合同约定账期天数', '与 ERP 账期比对告警'],
        ['penalty_rate', 'decimal(6,4)', '逾期违约金率（日）', '催收策略'],
        ['guarantee_clause', 'text', '担保 / 保证条款摘要', '应收 Agent 处置方案'],
        ['quality_objection_days', 'int', '质量异议期（天）', '合同履约风险'],
        ['price_adjust_clause', 'text', '价格调整条款（是否可随行就市调价）', '库存处置方案可行性'],
        ['dispute_resolution', 'enum', '争议解决方式：诉讼 / 仲裁及管辖地', '催收路径设计'],
        ['term_mismatch_flag', 'boolean', '与 ERP 台账口径是否存在不一致', '数据质量告警']
      ],
      sample: {
        contract_no: 'HT-2026-0417', customer_key: '91310000MA1XXXXX8N',
        credit_days_contract: 30, penalty_rate: 0.0005, quality_objection_days: 7,
        dispute_resolution: '诉讼-上海市浦东新区人民法院', term_mismatch_flag: true,
        mismatch_detail: '合同约定账期 30 天，ERP 台账登记 60 天，逾期天数被低估 30 天'
      },
      consumers: ['应收坏账模型', '客户应收风控智能体', '数据质量告警']
    },

    /* ===================== 三、自有平台（核心增量） ===================== */
    {
      id: 'listing', group: 'plat', groupName: '自有平台 · 核心增量', name: '500+ 商家资源 & 价格数据流', table: 'ods_plat_listing → dwd_listing_ts → dws_market_agg', hot: true,
      meta: { way: '平台 API 拉取 + Kafka 推送', freq: '热门规格小时级 / 长尾规格每日全量快照', pk: 'listing_id + version', inc: '增量 + 每日全量快照对账', vol: '41,628 条/日，时序点位 2.14 亿', role: '市场抛压、同业比价、供需信号的唯一来源' },
      input: [
        ['listing_id', 'string(64)', 1, '挂牌记录 ID', 'L-20260817-0099231'],
        ['version', 'int', 1, '版本号。同一挂牌每次改价产生新版本，用于还原报价变动轨迹', '3'],
        ['merchant_id', 'string(32)', 1, '商户 ID', 'M0421'],
        ['merchant_name', 'string(128)', 1, '商户名称', '瑞泰钢材经营部'],
        ['merchant_uscc', 'string(18)', 1, '商户统一社会信用代码。与我方客户/供应商打通、以及做商户失信检测都靠它', '91320000MA1ZZZZZ7P'],
        ['category', 'string(32)', 1, '品类：螺纹钢 / 热轧卷 / 中厚板 / 型材 / 管材 / 镀锌 / 冷轧', '螺纹钢'],
        ['material', 'string(32)', 1, '材质牌号', 'HRB400E'],
        ['spec', 'string(64)', 1, '规格', 'Φ20'],
        ['length', 'string(16)', 0, '定尺长度', '9M'],
        ['mill', 'string(32)', 1, '钢厂', '沙钢'],
        ['region_code', 'string(16)', 1, '资源所在区域', 'SH-上海'],
        ['warehouse_name', 'string(64)', 0, '仓库名称', '上海宝山某库'],
        ['listing_price', 'decimal(18,2)', 1, '挂牌单价，元/吨', '3452.00'],
        ['price_tax_included', 'boolean', 1, '是否含税。必填 —— 含税与不含税差约 13%，不区分则比价完全失效', 'true'],
        ['price_basis', 'enum', 1, '价格基准：提货价 / 送到价', '提货价'],
        ['weight_basis', 'enum', 1, '计重方式：理计 / 磅计。必填 —— 螺纹钢理计磅计差 1.5%~3%', '理计'],
        ['listing_qty', 'decimal(18,3)', 1, '挂牌余量（吨）', '320.000'],
        ['min_order_qty', 'decimal(18,3)', 0, '起订量', '20.000'],
        ['action', 'enum', 1, 'new 新挂牌 / update 调价改量 / withdraw 撤牌 / sold 已成交', 'update'],
        ['has_quality_cert', 'boolean', 0, '是否带质保书', 'true'],
        ['listing_time', 'datetime', 1, '本次动作发生时间', '2026-08-17T14:52:07+08:00'],
        ['valid_until', 'datetime', 0, '报价有效期', '2026-08-17T18:00:00+08:00']
      ],
      rules: [
        'L1：material / spec / mill / region_code 任一为空 → 无法映射标准规格码，进待映射队列不入特征层',
        'L1：price_tax_included / price_basis / weight_basis 任一为空 → 拒绝入湖（口径不明的报价不可用于比价）',
        'L1：listing_price ≤ 0 或 listing_qty ≤ 0 拒绝',
        'L2：listing_price 不在 [1000, 30000] 区间 → 标记异常',
        'L2：偏离同规格同区域当日中位价 ±20% → 标记为异常报价，聚合时剔除（防止个别错标价格拉偏均价）',
        'L2：同一商户同一规格 1 分钟内改价 ≥ 3 次 → 标记试探性报价，聚合时降权',
        'L2：规格映射置信度 < 85% → 入 DWD 但不进入特征层聚合',
        '口径转换（必须在聚合前完成）：不含税价 = 含税价 / (1+0.13)；提货价 = 送到价 − 区域运费基准；磅计量 = 理计量 × 品种系数'
      ],
      output: [
        ['sku_std_code', 'string', '标准规格编码，与我方库存 SKU 的连接键', '全部市场类特征'],
        ['price_std', 'decimal(18,2)', '统一口径单价（不含税 / 提货 / 磅计）', '同业比价'],
        ['listing_merchant_cnt', 'int', '按 sku_std_code + region + 日期 聚合的挂牌商户数', '抛压指数（权重最高特征）'],
        ['merchant_cnt_chg_3d / _7d', 'decimal(6,4)', '挂牌商户数 3 日 / 7 日环比变化', '呆滞模型（新增特征 18.6%）'],
        ['listing_qty_total', 'decimal(18,3)', '挂牌总量（吨）', '市场货源体量 / 采购风控'],
        ['listing_qty_chg_3d', 'decimal(6,4)', '挂牌总量 3 日环比', '抛压指数'],
        ['price_avg / price_median / price_min / price_p25', 'decimal(18,2)', '均价 / 中位价 / 最低价 / 25 分位价', '同业比价、报价定价建议'],
        ['price_chg_1d / _3d / _7d', 'decimal(6,4)', '价格变动率', '抛压指数 / 呆滞模型'],
        ['price_std_dev', 'decimal(18,2)', '报价离散度。离散度突然放大常是市场分歧加剧的先兆', '呆滞模型'],
        ['withdraw_rate', 'decimal(6,4)', '撤牌速率 = 撤牌量 / 挂牌量。撤牌率骤降说明「挂了也撤不掉」', '抛压指数（新增特征 8.7%）'],
        ['new_listing_rate', 'decimal(6,4)', '上新速率', '抛压指数'],
        ['price_vs_my_cost', 'decimal(18,2)', '同业均价 − 我方批次成本（同口径）', '浮亏敞口测算'],
        ['pressure_score', 'int', '市场抛压指数 0~100（派生指标）', '抛压等级 L1~L5'],
        ['merchant_dumping_flag', 'boolean', '单商户维度：挂牌量异常放量且持续压价', '客户/供应商隐性风险特征']
      ],
      sample: {
        sku_std_code: 'RB-400E-020-9000-SG', region_code: 'SH-上海', stat_date: '2026-08-16',
        listing_merchant_cnt: 83, merchant_cnt_chg_3d: 1.2432, listing_qty_total: 56200.000,
        listing_qty_chg_3d: 1.4800, price_avg: 3072.57, price_median: 3070.80, price_min: 3044.25,
        price_chg_3d: -0.0342, price_std_dev: 24.60, withdraw_rate: 0.0600, new_listing_rate: 0.3100,
        price_vs_my_cost: -111.50, pressure_score: 91, sample_merchant_cnt: 83
      },
      consumers: ['库存呆滞&跌价预测模型', '供应链风险子模型', '库存风控智能体', '经营全局风控中枢', 'POST /v1/market/price/compare', 'POST /v1/risk/purchase/check']
    },

    {
      id: 'index', group: 'plat', groupName: '自有平台 · 核心增量', name: '平台行情指数 API', table: 'ods_plat_index → dwd_market_index', hot: true,
      meta: { way: 'REST API 拉取', freq: '每日 2 次（09:30 / 15:30）', pk: 'index_code + trade_date', inc: '按 trade_date 增量', vol: '6 类指数 × 7 区域 × 每日', role: '行情趋势的核心先行指标，优先于第三方行情入模' },
      input: [
        ['index_code', 'string(32)', 1, '指数编码', 'IDX-JC-COMP'],
        ['index_name', 'string(64)', 1, '指数名称', '建材综合行情指数'],
        ['index_type', 'enum', 1, '品类行情指数 / 区域热度指数 / 成交情绪指数', '品类行情指数'],
        ['category_code', 'string(32)', 0, '对应品类（品类指数必填）', '建材'],
        ['region_code', 'string(16)', 0, '对应区域（区域指数必填）', 'SH-上海'],
        ['trade_date', 'date', 1, '指数日期', '2026-08-16'],
        ['index_value', 'decimal(10,4)', 1, '指数值', '92.4000'],
        ['base_period', 'string(16)', 1, '基期。不同基期的指数不可直接比较', '2025-01=100'],
        ['sample_count', 'int', 1, '样本数（参与计算的挂牌/成交笔数）。样本太少的指数不可信', '1284'],
        ['change_1d / change_7d / change_30d', 'decimal(8,4)', 0, '涨跌幅。不给则由风控侧自行计算', '-0.0121'],
        ['publish_time', 'datetime', 1, '发布时间', '2026-08-16T15:30:00+08:00']
      ],
      rules: [
        'L1：index_code + trade_date 重复 → 以 publish_time 最新的一条为准（指数存在盘中修订）',
        'L2：sample_count < 20 → 标记 low_confidence，模型中降权 50%',
        'L2：单日涨跌幅绝对值 > 15% → 标记异常，人工确认是否为口径调整',
        'L1：base_period 变更时必须重新拉取历史序列并做链式衔接，否则时序特征断裂',
        '缺失日（休市 / 未发布）按前值填充，并标记 is_filled = true'
      ],
      output: [
        ['index_value', 'decimal(10,4)', '指数值（基期归一后）', '呆滞模型'],
        ['ma5 / ma10 / ma20', 'decimal(10,4)', '移动均值', '趋势判断'],
        ['slope_7d', 'decimal(8,6)', '7 日斜率。判断「连续下行」的量化依据', '库存 Agent 推理'],
        ['volatility_20d', 'decimal(8,6)', '20 日波动率', '呆滞模型（新增特征 12.4%）'],
        ['down_streak_days', 'int', '连续下行天数', '抛压等级判定'],
        ['sentiment_score', 'decimal(6,2)', '成交情绪指数值 0~100', '行情情绪等级（悲观/偏悲观/中性/乐观）'],
        ['region_heat_score', 'decimal(6,2)', '区域热度指数值', '区域维度风险'],
        ['is_low_confidence', 'boolean', '样本不足标记', '模型降权']
      ],
      sample: {
        index_code: 'IDX-JC-COMP', trade_date: '2026-08-16', index_value: 92.4000,
        ma5: 94.8600, slope_7d: -0.009714, volatility_20d: 0.018200, down_streak_days: 7,
        change_7d: -0.0680, sample_count: 1284, is_low_confidence: false
      },
      consumers: ['库存呆滞&跌价预测模型', '三大 Agent 推理输入', 'GET /v1/market/index', '采购审批风控']
    },

    {
      id: 'credit_api', group: 'plat', groupName: '自有平台 · 核心增量', name: '企业失信风险检测 API', table: 'ods_plat_credit_event → dwd_risk_event', hot: true,
      meta: { way: 'REST API 分层轮询（高风险 4h / 中风险 1d / 低风险 7d / 上游商户 1d）', freq: '分层', pk: 'event_id', inc: '按 since_date 增量拉取', vol: '1,264 次调用/日，约 9 起新增事件/周', role: '坏账与供应链风险的外部征信输入' },
      inputTitle: '请求入参（我方提供）',
      input: [
        ['company_name', 'string(128)', 1, '企业工商全称', '宏基建设集团有限公司'],
        ['uscc', 'string(18)', 1, '统一社会信用代码。强烈建议必传 —— 仅凭名称匹配存在同名企业风险', '91310000MA1XXXXX8N'],
        ['query_scene', 'enum', 1, 'customer 下游赊销客户 / supplier 上游供货商 / merchant 平台商户', 'customer'],
        ['since_date', 'date', 0, '增量起始日期，只取该日期之后的新增事件，控制调用成本与返回体积', '2026-08-10'],
        ['include_related', 'boolean', 0, '是否查询关联方（同一实控人）风险。开启后可捕获风险传导', 'true'],
        ['biz_ref', 'string(64)', 0, '业务引用号，用于调用归因与成本分摊', 'AR-C10086-20260817']
      ],
      outputTitle: '响应字段（平台返回）',
      respFields: [
        ['match_status', 'enum', 1, 'matched 精确匹配 / ambiguous 多个候选 / not_found 未查到', 'matched'],
        ['matched_uscc / matched_name', 'string', 1, '实际匹配到的主体', '91310000MA1XXXXX8N'],
        ['risk_score', 'int', 0, '平台侧综合风险分 0~100', '78'],
        ['events[].event_id', 'string(64)', 1, '事件唯一 ID。幂等去重键，同一事件多次巡检不得重复计入', 'EV-2026081400921'],
        ['events[].event_type', 'enum', 1, '失信被执行 / 被执行 / 立案 / 开庭 / 股权冻结 / 经营异常 / 行政处罚 / 法定代表人变更 / 注册资本变更 / 清算 / 破产重整', '被执行'],
        ['events[].event_date', 'date', 1, '事件发生日期', '2026-08-14'],
        ['events[].amount', 'decimal(18,2)', 0, '涉案金额。区分「小额官司」与「大额执行」的关键依据', '12400000.00'],
        ['events[].case_no', 'string(64)', 0, '案号', '(2026)沪0115执12345号'],
        ['events[].court', 'string(128)', 0, '执行法院 / 处罚机关', '上海市浦东新区人民法院'],
        ['events[].role', 'enum', 0, '主体角色：被告 / 被执行人 / 关联方 / 担保人', '被执行人'],
        ['events[].related_company', 'string(128)', 0, '关联方名称（role = 关联方 时必填）', '宏基置业有限公司'],
        ['events[].source_url', 'string(512)', 0, '数据来源链接，供人工核实', 'https://...'],
        ['events[].raw_text', 'text', 0, '事件原文摘要。大模型据此判定严重等级，缺失会显著降低解读质量', '……']
      ],
      rules: [
        'L1：event_id 缺失 → 拒绝入湖（无法幂等，会导致同一事件反复上调风险）',
        'L1：match_status = ambiguous → 不自动采信，进人工确认队列（同名企业误判会造成严重业务事故）',
        'L2：match_status = not_found 且该客户存在赊销余额 → 告警，提示核对 uscc',
        'L2：event_date 早于 since_date → 丢弃（平台返回历史数据）',
        '同一事件多渠道重复上报按 case_no + event_type + event_date 二次去重',
        '调用成本控制：高风险客户 4h、中风险 1d、低风险 7d、上游商户 1d；出现任一事件立即升频'
      ],
      output: [
        ['event_key', 'string', '事件主键（幂等）', '全部下游'],
        ['subject_key', 'string', '主体 uscc，关联到客户 / 供应商 / 平台商户', '风险归因'],
        ['severity_level', 'enum', '大模型判定的严重等级：low 小额纠纷 / mid 传导型或股东层风险 / high 资金链断裂级', '坏账模型（新增特征 21.3%）'],
        ['prob_delta', 'decimal(6,4)', '该事件带来的坏账概率增量', '风险重算'],
        ['ai_read', 'text', '大模型对事件影响力的解读文本', '看板展示 / Agent 推理'],
        ['event_cnt_30d / _90d', 'int', '近 30 / 90 日事件数', '坏账模型'],
        ['max_execution_amount', 'decimal(18,2)', '最大被执行金额', '坏账模型'],
        ['amount_vs_credit_limit', 'decimal(8,4)', '涉案金额 / 我方授信额度。超过 1 是判定资金链断裂的关键阈值', '严重等级判定'],
        ['has_dishonest_flag', 'boolean', '是否已被列为失信被执行人', '强规则触发'],
        ['related_party_risk_flag', 'boolean', '关联方风险传导标记', '坏账模型（新增特征 6.2%）'],
        ['trigger_action', 'enum', '触发的自动动作：风险重算 / 等级上调 / 推送高管 / 冻结新单', '业务执行层']
      ],
      sample: {
        event_key: 'EV-2026081400921', subject_key: '91310000MA1XXXXX8N', event_type: '被执行',
        event_date: '2026-08-14', amount: 12400000.00, severity_level: 'high', prob_delta: 0.2300,
        amount_vs_credit_limit: 1.0333,
        ai_read: '被执行金额已超过我方授信额度，叠加法代变更与合同纠纷，判定为资金链断裂级信号，非孤立小额诉讼',
        has_dishonest_flag: true, related_party_risk_flag: false, trigger_action: '等级上调+推送高管'
      },
      consumers: ['应收坏账模型', '供应链风险子模型', '客户应收风控智能体', 'GET /v1/risk/customer/{code}/events', 'Webhook risk.customer.credit_event']
    },

    /* ===================== 四、第三方补充 ===================== */
    {
      id: 'mill', group: 'ext', groupName: '第三方补充', name: '外部钢厂调价', table: 'ods_ext_mill_price → dwd_mill_price',
      meta: { way: '第三方数据服务 API', freq: '每日', pk: 'mill_code + category + adjust_date', inc: '按 adjust_date 增量', vol: '32 家钢厂', role: '供给端成本锚，判断价格底部支撑' },
      input: [
        ['mill_code', 'string(32)', 1, '钢厂编码', 'MILL-SG'],
        ['mill_name', 'string(64)', 1, '钢厂名称', '沙钢'],
        ['category', 'string(32)', 1, '调价品类', '螺纹钢'],
        ['spec_range', 'string(64)', 0, '适用规格范围', 'Φ16-25'],
        ['adjust_date', 'date', 1, '调价公布日期', '2026-08-15'],
        ['effective_date', 'date', 1, '生效日期。与公布日期常有 3~10 天差，直接影响传导时点判断', '2026-08-16'],
        ['adjust_amount', 'decimal(18,2)', 1, '调整幅度，元/吨，正为上调负为下调', '-50.00'],
        ['new_price', 'decimal(18,2)', 0, '调整后价格', '3480.00'],
        ['policy_type', 'enum', 1, '出厂价 / 结算价 / 政策补差 / 锁价优惠', '出厂价'],
        ['region_scope', 'string(64)', 0, '适用区域', '华东'],
        ['source', 'string(64)', 1, '数据来源渠道', '第三方数据服务A']
      ],
      rules: [
        'L1：adjust_amount 与 new_price 同时缺失 → 拒绝入湖',
        'L2：|adjust_amount| > 300 元/吨 → 标记异常，人工确认（可能是口径变更或补差政策）',
        'L2：effective_date < adjust_date → 告警',
        '政策补差类调价不计入价格趋势特征，仅作为成本口径调整'
      ],
      output: [
        ['mill_price_std', 'decimal(18,2)', '钢厂出厂价（不含税口径）', '成本锚'],
        ['adjust_direction_7d', 'enum', '近 7 日钢厂调价方向：上调 / 下调 / 持稳', '呆滞模型（特征 6.1%）'],
        ['adjust_amount_sum_30d', 'decimal(18,2)', '近 30 日累计调价幅度', '趋势判断'],
        ['mill_vs_market_gap', 'decimal(18,2)', '钢厂出厂价与平台同规格均价价差。倒挂说明贸易环节在亏钱出货', '库存 Agent 推理'],
        ['cost_support_level', 'decimal(18,2)', '成本支撑位估算', '处置方案定价参考']
      ],
      sample: {
        mill_code: 'MILL-SG', category: '螺纹钢', adjust_date: '2026-08-15', effective_date: '2026-08-16',
        adjust_amount: -50.00, adjust_direction_7d: '下调', adjust_amount_sum_30d: -130.00,
        mill_vs_market_gap: 7.43, cost_support_level: 3060.00
      },
      consumers: ['库存呆滞模型', '库存风控智能体', '采购建议']
    },

    {
      id: 'operating', group: 'ext', groupName: '第三方补充', name: '下游开工数据', table: 'ods_ext_operating → dwd_industry_prosperity',
      meta: { way: '第三方数据服务 API', freq: '每周', pk: 'industry_code + region_code + stat_date', inc: '按 stat_date 增量', vol: '5 大下游行业 × 7 区域', role: '需求端景气度，全局中枢做需求推断的依据' },
      input: [
        ['industry_code', 'string(16)', 1, '行业编码。必须与客户档案 industry_code 使用同一套字典，否则无法关联到具体客户', 'F-房建工程'],
        ['industry_name', 'string(64)', 1, '行业名称', '房建工程'],
        ['region_code', 'string(16)', 1, '区域编码', 'SH-上海'],
        ['stat_date', 'date', 1, '统计周期截止日', '2026-08-15'],
        ['stat_period', 'enum', 1, '统计周期：周 / 月', '周'],
        ['operating_rate', 'decimal(6,4)', 1, '开工率', '0.6120'],
        ['yoy', 'decimal(8,4)', 0, '同比变化', '-0.1830'],
        ['mom', 'decimal(8,4)', 0, '环比变化', '-0.1130'],
        ['sample_size', 'int', 0, '样本数量', '186'],
        ['source', 'string(64)', 1, '数据来源', '第三方数据服务B']
      ],
      rules: [
        'L1：industry_code 不在与客户档案共用的行业字典内 → 拒绝入湖（无法做行业联动）',
        'L2：operating_rate 不在 [0, 1] 区间 → 拒绝',
        'L2：sample_size < 30 → 标记 low_confidence',
        '周度数据在日度特征中按前值填充，并标记 is_filled'
      ],
      output: [
        ['industry_prosperity_index', 'decimal(6,2)', '行业景气度指数（开工率与同环比合成）', '全局中枢需求推断'],
        ['demand_trend_30d', 'enum', '需求趋势：走强 / 平稳 / 走弱', '联动推演触发条件'],
        ['industry_risk_factor', 'decimal(6,4)', '行业系统性风险因子。批量上调同行业客户坏账概率时的加成系数', '坏账模型（新增特征 9.8%）'],
        ['affected_customer_keys', 'array', '该行业下我方赊销客户主键列表', '批量风险上调']
      ],
      sample: {
        industry_code: 'F-房建工程', region_code: 'SH-上海', stat_date: '2026-08-15',
        operating_rate: 0.6120, mom: -0.1130, industry_prosperity_index: 42.60,
        demand_trend_30d: '走弱', industry_risk_factor: 0.1200,
        affected_customer_keys: ['91310000MA1XXXXX8N', '91310000MA1WWWWW2C']
      },
      consumers: ['经营全局风控中枢（跨链条推演）', '应收坏账模型（行业因子）', '库存呆滞模型']
    },

    {
      id: 'news', group: 'ext', groupName: '第三方补充', name: '行业舆情资讯', table: 'ods_ext_news → vec_news_chunk',
      meta: { way: '订阅 + 定向爬取', freq: '实时', pk: 'news_id', inc: '按 publish_time 增量', vol: '5,462 篇 / 约 24,880 切片', role: '突发事件与政策信号，供 RAG 检索' },
      input: [
        ['news_id', 'string(64)', 1, '资讯 ID', 'NW-20260816-01182'],
        ['title', 'string(256)', 1, '标题', '唐山地区启动秋冬季错峰生产'],
        ['content', 'text', 1, '正文', '……'],
        ['publish_time', 'datetime', 1, '发布时间', '2026-08-16T09:12:00+08:00'],
        ['source', 'string(64)', 1, '来源媒体', '某钢铁资讯网'],
        ['url', 'string(512)', 0, '原文链接', 'https://...'],
        ['category_tags', 'array', 0, '品类标签', '["螺纹钢","热轧卷"]'],
        ['region_tags', 'array', 0, '区域标签', '["唐山","华北"]'],
        ['entity_tags', 'array', 0, '涉及企业标签。命中我方客户或供应商时需触发定向关注', '["某某钢铁集团"]'],
        ['author_credibility', 'decimal(5,4)', 0, '来源可信度评分', '0.8600']
      ],
      rules: [
        'L1：content 长度 < 50 字 → 丢弃（多为标题党或无效推送）',
        'L2：同一事件多来源重复 → 按标题相似度 > 0.9 去重，保留可信度最高的一条',
        'L2：author_credibility < 0.6 → 入库但检索时降权',
        'entity_tags 命中我方客户 / 供应商 / 平台商户 → 触发定向风险关注并推送',
        '切片：按段落切片，chunk 长度 300~500 字'
      ],
      output: [
        ['embedding', 'vector(1024)', '文本向量', 'RAG 检索'],
        ['event_type', 'enum', '事件类型：限产 / 环保 / 政策 / 安全事故 / 需求刺激 / 企业风险', '全局中枢推理'],
        ['sentiment', 'decimal(5,4)', '资讯情绪倾向（-1 利空 ~ 1 利多）', '行情研判参考'],
        ['impact_category_codes', 'array', '影响品类的标准编码', '定向关联到我方库存'],
        ['impact_direction', 'enum', '对价格的方向性影响：利多 / 利空 / 中性', 'Agent 推理素材'],
        ['hit_related_party', 'boolean', '是否命中我方往来单位', '定向风险关注']
      ],
      sample: {
        news_id: 'NW-20260816-01182', event_type: '限产', sentiment: 0.6200,
        impact_category_codes: ['RB', 'HR'], impact_direction: '利多',
        region_tags: ['唐山', '华北'], hit_related_party: false, author_credibility: 0.8600
      },
      consumers: ['向量知识库 RAG', '经营全局风控中枢', '库存风控智能体']
    }
  ];

  global.Dict = { COMMON, SOURCES };
})(window);
