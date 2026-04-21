#!/usr/bin/env bash
set -euo pipefail

mkdir -p /opt/duizhangpingtai /var/www/yewu-admin /var/log/yewu-api

cd /opt/duizhangpingtai
git checkout main
git pull --ff-only origin main

if [ -f /home/admin/.openclaw/workspace-dev/业财一体化-mvp/.env ]; then
  cp -f /home/admin/.openclaw/workspace-dev/业财一体化-mvp/.env /opt/duizhangpingtai/.env
fi

if [ -f /opt/duizhangpingtai/.env ]; then
  mkdir -p /opt/duizhangpingtai/backend
  cp -f /opt/duizhangpingtai/.env /opt/duizhangpingtai/backend/.env
fi

npm ci
npm --prefix backend ci

cd /opt/duizhangpingtai/backend
set -a
[ -f ./.env ] && . ./.env
set +a
npx prisma generate
npm run db:migrate || true

cd /opt/duizhangpingtai
npm run build:frontend
npm run build:backend
rsync -av --delete dist/ /var/www/yewu-admin/

pm2 delete yewu-api || true

set -a
[ -f ./.env ] && . ./.env
[ -f ./backend/.env ] && . ./backend/.env
set +a

PM2_LOG_DIR=/var/log/yewu-api pm2 start backend/ecosystem.config.cjs --env production --update-env
pm2 save

systemctl reload nginx || systemctl restart nginx || true

echo "deploy done"
