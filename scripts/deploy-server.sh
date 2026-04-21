#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/duizhangpingtai}"
WEB_DIR="${WEB_DIR:-/var/www/yewu-admin}"
LOG_DIR="${LOG_DIR:-/var/log/yewu-api}"
PM2_APP_NAME="${PM2_APP_NAME:-yewu-api}"

echo "[1/7] enter repo"
cd "$REPO_DIR"

echo "[2/7] update code"
git pull --ff-only origin main

echo "[3/7] install dependencies"
npm ci
npm --prefix backend ci

echo "[4/7] prisma generate and migrate"
(cd backend && npx prisma generate && npm run db:migrate)

echo "[5/7] build frontend and backend"
npm run build:frontend
npm run build:backend

echo "[6/7] publish frontend assets"
mkdir -p "$WEB_DIR"
rsync -av --delete dist/ "$WEB_DIR/"

echo "[7/7] restart pm2"
mkdir -p "$LOG_DIR"
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$PM2_APP_NAME"
else
  PM2_LOG_DIR="$LOG_DIR" pm2 start backend/ecosystem.config.cjs --env production
fi
pm2 save

echo "deploy finished"
