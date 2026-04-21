# 部署说明

本文档描述 `duizhangpingtai` 统一仓库的生产部署方式。

## 目标结构

服务器建议目录：

```text
/opt/duizhangpingtai
/var/www/yewu-admin
/var/log/yewu-api
```

说明：

- `/opt/duizhangpingtai`：Git 仓库目录
- `/var/www/yewu-admin`：前端静态资源目录
- `/var/log/yewu-api`：PM2 日志目录

## 运行时要求

- Node.js 20+
- npm 10+
- PM2
- Nginx
- PostgreSQL

## 环境变量

在 `backend/.env` 中至少配置：

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/dbname
DEEPSEEK_API_KEY=your-key
```

可选：

```bash
OPENAI_API_KEY=your-key
LOG_LEVEL=info
```

## 首次部署

### 1. 拉取仓库

```bash
mkdir -p /opt/duizhangpingtai
cd /opt/duizhangpingtai
git clone git@github.com:wuhai511-ui/duizhangpingtai.git .
```

### 2. 安装依赖

```bash
npm ci
npm --prefix backend ci
```

### 3. 配置后端环境

```bash
cp backend/.env.example backend/.env
vim backend/.env
```

### 4. 生成 Prisma Client 并执行迁移

```bash
cd /opt/duizhangpingtai/backend
npx prisma generate
npm run db:migrate
```

### 5. 构建前后端

```bash
cd /opt/duizhangpingtai
npm run build:frontend
npm run build:backend
```

### 6. 发布前端静态资源

```bash
mkdir -p /var/www/yewu-admin
rsync -av --delete dist/ /var/www/yewu-admin/
```

### 7. 启动后端

```bash
mkdir -p /var/log/yewu-api
cd /opt/duizhangpingtai
pm2 start backend/ecosystem.config.cjs --env production
pm2 save
```

## 日常更新

推荐使用仓库内脚本：

```bash
cd /opt/duizhangpingtai
bash scripts/deploy-server.sh
```

脚本会执行：

- `git pull --ff-only`
- 前后端依赖安装
- Prisma generate / migrate
- 前后端构建
- 同步前端资源到 `/var/www/yewu-admin`
- `pm2 reload yewu-api`

## Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name 47.253.226.91;

    root /var/www/yewu-admin;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果站点走 HTTPS，请在证书配置块中保留同样的 `/api/` 转发规则。

## 健康检查

前端：

```bash
curl -I http://127.0.0.1/
```

后端：

```bash
curl -i http://127.0.0.1:3000/api/v1/health
curl -i http://127.0.0.1:3000/api/v1/ai/health
```

## 常见问题

### 1. 前端能打开但接口 404

优先检查：

- Nginx 是否转发 `/api/`
- 后端是否监听 `3000`
- 前端是否请求 `/api/v1`

### 2. Prisma Client 不匹配

重新执行：

```bash
cd /opt/duizhangpingtai/backend
npx prisma generate
```

### 3. PM2 启动路径错乱

现在仓库里的 `backend/ecosystem.config.cjs` 已改成相对当前目录运行，不再写死旧仓库路径。

### 4. 数据库迁移失败

先确认：

- `DATABASE_URL` 正确
- PostgreSQL 可连通
- 账号具备建表权限

## 相关文件

- [README.md](D:\codex\yewu-admin\README.md)
- [ecosystem.config.cjs](D:\codex\yewu-admin\backend\ecosystem.config.cjs)
- [deploy-server.sh](D:\codex\yewu-admin\scripts\deploy-server.sh)
