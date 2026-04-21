# 业财一体化 MVP（旅购通）

## 项目路径
`/home/admin/.openclaw/workspace-dev/业财一体化-mvp/`

## 项目概述
基于拉卡拉备付金分账生态的 AI 驱动业财一体化增值服务平台。

## 技术栈
- 后端：Node.js 22 + Fastify + TypeScript
- ORM：Prisma（SQLite 开发 / PostgreSQL 生产）
- 数据库：PostgreSQL 16
- AI：OpenAI / DeepSeek（通过 LLM API）
- 测试：Vitest

## 数据库货币规范
**所有货币金额统一使用 INTEGER（分）**，不允许 Float/Double。

## 核心功能
- AI 自然语言查询交易/分账数据
- 自动对账（11种对账文件自动解析）
- AI 主动询问开票/分账/凭证
- 财务凭证自动生成（CFCA 签名）
- 五流合一：资金流/发票流/业务流/合同流/信息流

---

## 系统架构

### 分层结构

```
src/
├── api/                    # API 入口层（路由注册、Fastify 实例）
│   ├── index.ts            # 服务启动入口
│   └── routes/
│       ├── auth.ts         # 登录认证（POST /auth/login, GET /auth/me）
│       ├── file.ts         # 文件上传（POST /files/upload）
│       ├── health.ts       # 健康检查
│       ├── invoice.ts       # 电子发票
│       ├── merchant.ts      # 商户管理
│       ├── reconciliation.ts # 对账管理
│       ├── template.ts     # 对账模板
│       ├── transaction.ts   # 交易流水
│       └── user.ts         # 用户路由
│
├── bff/                    # BFF 层：对接钱账通（独立可部署）
│   ├── adapters/
│   │   └── qzt.adapter.ts  # 钱账通数据格式转换
│   ├── routes/
│   │   └── bff.routes.ts   # POST /bff/files/ingest（钱账通文件接收）
│   └── services/
│       └── bff-file.service.ts # BFF 文件处理逻辑
│
├── business/               # 业务后台（核心逻辑层）
│   ├── repositories/       # 数据访问层（Repository 模式，可 mock）
│   │   ├── index.ts
│   │   ├── invoice.repo.ts
│   │   ├── merchant.repo.ts
│   │   ├── settlement.repo.ts
│   │   └── transaction.repo.ts
│   ├── routes/             # 业务路由（实际处理逻辑）
│   │   ├── ai.ts
│   │   ├── file.ts
│   │   ├── invoice.ts
│   │   ├── merchant.ts
│   │   ├── reconciliation.ts
│   │   ├── template.ts
│   │   ├── transaction.ts
│   │   └── user.ts
│   └── services/          # 业务服务
│       ├── file-processor.ts   # 文件解析引擎（支持 11 种文件）
│       ├── invoice-ocr.ts      # 发票 OCR 识别
│       ├── llm.ts             # LLM 对话
│       └── reconciliation-engine.ts # 对账引擎
│
├── shared/                 # 共享基础设施
│   ├── db/
│   │   └── pool.ts         # PostgreSQL 连接池（生产用）
│   └── types/
│       └── database.ts     # 共享类型定义
│
├── db/                     # 数据库基础设施
│   ├── migrate.ts          # 迁移脚本
│   ├── pool.ts            # 连接池
│   ├── prisma.ts          # Prisma Client
│   └── query.ts           # 查询工具
│
├── parser/                 # 解析器（11 种对账文件）
│   ├── jy-parser.ts        # JY_ 交易明细
│   ├── js-parser.ts        # JS_ 结算明细
│   ├── jz-parser.ts        # JZ_ 钱包结算
│   ├── acc-parser.ts       # ACC_ 账户结算
│   ├── sep-parser.ts       # SEP_ 分账明细
│   ├── dw-parser.ts        # DW_ 提现对账
│   ├── d0-parser.ts        # D0_ D0提现
│   ├── jy-fq-parser.ts     # JY_FQ_ 分期交易
│   ├── business-order-parser.ts # 业务订单
│   ├── base-parser.ts      # 解析器基类
│   └── file-parser.ts      # 文件识别 + 路由
│
├── scheduler/              # 定时任务
│   └── daily-scheduler.ts  # 每日对账调度
│
└── utils/                  # 工具函数
    ├── currency.ts         # 货币转换（分↔元）
    └── prompt-sanitizer.ts  # LLM prompt 清理
```

---

## 数据模型

| 模型 | 说明 |
|------|------|
| `Merchant` | 商户表 |
| `User` | 用户表（手机号登录，可选绑定 merchantId） |
| `JyTransaction` | 交易明细（JY_） |
| `JsSettlement` | 结算明细（JS_） |
| `JzWalletSettlement` | 钱包结算（JZ_） |
| `AccAccountSettlement` | 账户结算（ACC_） |
| `SepTransaction` | 分账明细（SEP_） |
| `SepSummary` | 分账汇总（SEP_SUM_） |
| `DwWithdrawal` | 提现对账（DW_） |
| `D0Withdrawal` | D0提现（D0_） |
| `JyInstallment` | 分期交易（JY_FQ_） |
| `BusinessOrder` | 业务订单（来自 ERP/门店系统） |
| `Invoice` | 电子发票 |
| `ReconciliationBatch` | 对账批次 |
| `ReconciliationDetail` | 对账明细 |
| `BillTemplate` | 对账模板定义 |

---

## 对账文件规范（11种）

| 文件前缀 | 说明 | 产出时间 |
|----------|------|---------|
| JY_ | 交易明细 | D+1 0:00 |
| JS_ | 结算明细 | D+1 12:00 |
| JZ_ | 钱包结算 | D+1 7:00 |
| ACC_ | 账户结算 | D+1 10:00 |
| SEP_ | 分账明细 | D+1 6:00 |
| SEP_SUM_ | 分账汇总 | D+1 6:00 |
| DW_ | 提现对账 | D+1 12:00 |
| DW_RD_ | 提现退票 | D+1 12:00 |
| D0_ | D0提现 | D+1 12:00 |
| JY_FQ_ | 分期交易 | D+1 6:00 |
| PNG | 电子签购单 | D+1 |

---

## API 路由

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/login` | 手机号 + 密码登录 |
| GET | `/api/v1/auth/me` | 获取当前用户信息 |

### BFF（钱账通对接）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/bff/files/ingest` | 接收钱账通文件（需 X-Merchant-Id） |
| GET | `/api/v1/bff/health` | BFF 层健康检查 |

### 商户/用户
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/merchants/available` | 获取可选商户列表 |
| GET | `/api/v1/users/me` | 获取当前用户信息 |
| POST | `/api/v1/users/me/bind-merchant` | 绑定商户到当前用户 |
| GET | `/api/v1/users/me/merchant` | 获取当前绑定商户 |

### 文件
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/files/upload` | 上传文件并解析 |
| GET | `/api/v1/files` | 文件列表 |

### 交易/结算
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/transactions/jy` | 交易流水查询 |
| GET | `/api/v1/transactions/settlements` | 结算记录查询 |

### 对账
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/reconciliation/batches` | 对账批次列表 |
| GET | `/api/v1/reconciliation/batches/:id/details` | 对账明细 |
| POST | `/api/v1/reconciliation/reconcile` | 执行对账 |

### 发票
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/invoices` | 发票列表 |
| POST | `/api/v1/invoices/upload` | 上传发票文件 |

### AI
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/ai/chat` | AI 自然语言对话 |
| POST | `/api/v1/ai/file/ask` | 上传文件并提问 |

---

## 关键设计决策

### 1. merchantId 非强绑定
用户初始 `merchantId = null`，通过 `/users/me/bind-merchant` 自主绑定。文件处理时从请求头 `X-Merchant-Id` 获取。

### 2. BFF 与 Business 分离
- **BFF 层**（`src/bff/`）：专门对接钱账通，接收文件 → 格式转换 → Repository 写入
- **Business 层**（`src/business/`）：处理所有业务逻辑
- 钱账通接口变更不影响业务层，两者可独立部署

### 3. Repository 数据访问层
所有数据访问经由 `src/business/repositories/` 中的 Repository 类，不直接调用 Prisma。便于单元测试 mock。

### 4. 统一数据库货币单位
所有金额字段使用 `BigInt`（INTEGER），单位为**分**，避免浮点精度问题。

---

## 环境变量

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db   # 生产数据库
OPENAI_API_KEY=sk-xxx                              # OpenAI API Key
DEEPSEEK_API_KEY=sk-xxx                            # DeepSeek API Key
PORT=3000                                           # 服务端口
```

---

## 开发

```bash
# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 推送 schema 到数据库
npx prisma db push

# 编译
npm run build

# 开发（监听模式）
npm run dev

# 种子数据（创建测试用户 15801852984 / 123456）
npx tsx prisma/seed.ts

# 启动服务
node dist/api/index.js
```

---

## 项目状态

- [x] 可行性分析完成
- [x] 系统设计完成
- [x] PPT 汇报材料完成
- [x] 表结构接入（11种文件完整字段）
- [x] MVP 技术方案制定
- [x] **BFF 与业务后台分层拆分**（2026-04-17）
- [ ] Sprint 1 基础设施 + 工具层（TDD）
- [ ] Sprint 2 数据库 + 迁移
- [ ] Sprint 3-4 解析引擎（11种文件）
- [ ] Sprint 5 对账核心
- [ ] Sprint 6 API 路由 + AI 对话
- [ ] Sprint 7 端到端 + 性能
- [ ] Sprint 8 部署 + 上线

---

## 文档

- 技术方案：`docs/superpowers/specs/2026-04-17-bff-business-split-design.md`
- 实现计划：`docs/superpowers/plans/2026-04-17-bff-business-split-impl-plan.md`
- 部署方案：`docs/deployment.md`
