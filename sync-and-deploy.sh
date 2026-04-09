#!/bin/bash
# ─── Dental Lab — Otomatik Sync & Deploy ──────────────────────────────────────
# Worktree'deki değişiklikleri my-expo-app'e kopyalar,
# GitHub'a push eder. Vercel source'dan kendi build'ini yapar.
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Hata varsa dur

WORKTREE="/Users/saber/Desktop/Dental Software/.claude/worktrees/heuristic-allen"
MAIN="/Users/saber/Desktop/Dental Software/my-expo-app"
GIT_ROOT="/Users/saber/Desktop/Dental Software"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Dental Lab — Deploy Başlıyor          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Worktree → my-expo-app senkronizasyon
echo "▶ [1/3] Dosyalar senkronize ediliyor..."
rsync -a --delete \
  --exclude='.vercel' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='dist' \
  --exclude='.expo' \
  --exclude='.claude' \
  "$WORKTREE/" "$MAIN/"

# vercel.json her zaman korunmalı (Vercel build ayarları)
cat > "$MAIN/vercel.json" << 'VERCELJSON'
{
  "buildCommand": "printf 'EXPO_PUBLIC_SUPABASE_URL=%s\\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\\n' \"$EXPO_PUBLIC_SUPABASE_URL\" \"$EXPO_PUBLIC_SUPABASE_ANON_KEY\" > .env && npm run build:web",
  "outputDirectory": "dist",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
VERCELJSON
echo "   ✓ Senkronizasyon tamamlandı"

# 2. Git commit & push → Vercel otomatik build + deploy eder
echo ""
echo "▶ [2/3] GitHub'a gönderiliyor..."
cd "$GIT_ROOT"
echo "▶ [3/3] Değişiklikler kontrol ediliyor..."
git add my-expo-app/
git diff --cached --quiet && echo "   ℹ️  Değişiklik yok, push atlandı" && exit 0
COMMIT_MSG="Deploy: $(date '+%d %b %Y %H:%M')"
git commit -m "$COMMIT_MSG"
git push origin main
echo "   ✓ GitHub'a gönderildi (~30sn sonra online olur)"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Push tamam! Vercel otomatik build başlıyor.     ║"
echo "║  🌐 https://dental-lab-steel.vercel.app             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
