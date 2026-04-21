# duizhangpingtai

统一维护的业财一体化仓库，包含：

- 前端管理台：Vite + React + Ant Design
- 后端 API：Fastify + TypeScript + Prisma
- 对账、文件识别、AI 会话、模板分析等业务能力

后续以 `wuhai511-ui/duizhangpingtai` 作为唯一主仓库维护，原 `wuhai511-ui/yewu-yitihua` 中已并入的后端能力不再单独演进。

## 目录结构

```text
.
├─ src/                  # 前端源码
├─ public/               # 前端静态资源
├─ backend/              # 后端 API / Prisma / tests
├─ docs/                 # 项目文档
├─ .github/workflows/    # GitHub Actions
└─ dist/                 # 前端构建产物（忽略）
```

## 技术栈

### 前端

- React 18
- Vite 5
- TypeScript
- Ant Design
- TanStack Query

### 后端

- Node.js 20+
- Fastify
- TypeScript
- Prisma
- SQLite / PostgreSQL
- Vitest

## 本地开发

### 1. 安装前端依赖

```bash
npm install
```

### 2. 安装后端依赖

```bash
npm run install:backend
```

### 3. 配置后端环境变量

复制 `backend/.env.example` 为 `backend/.env`，按实际环境填写：

```bash
cd backend
cp .env.example .env
```

关键变量：

- `DATABASE_URL`
- `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`
- `PORT`

### 4. 生成 Prisma Client

```bash
cd backend
npx prisma generate
```

### 5. 启动开发环境

前端：

```bash
npm run dev:frontend
```

后端：

```bash
npm run dev:backend
```

说明：

- 前端默认运行在 `http://localhost:5173`
- 后端默认运行在 `http://localhost:3000`
- 前端接口基址为 `/api/v1`
- `vite.config.ts` 当前已配置 `/api` 代理

## 构建

前端构建：

```bash
npm run build:frontend
```

后端构建：

```bash
npm run build:backend
```

全部构建：

```bash
npm run build:all
```

## 测试

后端测试：

```bash
npm run test:backend
```

## 常用脚本

根目录 `package.json` 已统一提供：

- `npm run dev`
- `npm run dev:frontend`
- `npm run dev:backend`
- `npm run build`
- `npm run build:frontend`
- `npm run build:backend`
- `npm run build:all`
- `npm run install:backend`
- `npm run test:backend`
- `npm run db:migrate:backend`

## 部署说明

生产部署请看：

- [docs/deployment.md](D:\codex\yewu-admin\docs\deployment.md)

建议使用：

- Nginx 托管前端 `dist/`
- PM2 运行 `backend`
- PostgreSQL 作为生产数据库

## 生产结构建议

```text
/opt/duizhangpingtai
├─ .git
├─ backend
├─ src
├─ public
└─ dist
```

前端静态资源建议发布到：

```text
/var/www/yewu-admin
```

后端建议由 PM2 托管：

```bash
pm2 start backend/ecosystem.config.cjs --env production
```

## 当前仓库状态

- 已并入原 `yewu-yitihua` 后端代码
- 已统一前后端构建入口
- 已忽略构建产物、数据库文件、依赖目录
- 后续统一维护仓库：`wuhai511-ui/duizhangpingtai`

## 补充

历史记录见：

- [2026-04-20-更新记录.md](D:\codex\yewu-admin\docs\2026-04-20-更新记录.md)
