#!/usr/bin/env bash
# Vercel build entry — env'i yaz + tree-shake/optimize flag'leriyle export et.
set -euo pipefail

# Public env'leri .env'e yaz (build sırasında EXPO_PUBLIC_* burayı okur)
{
  echo "EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-}"
  echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}"
  echo "EXPO_PUBLIC_GOOGLE_PLACES_KEY=${EXPO_PUBLIC_GOOGLE_PLACES_KEY:-}"
  echo "EXPO_PUBLIC_VAPID_PUBLIC_KEY=${EXPO_PUBLIC_VAPID_PUBLIC_KEY:-}"
} > .env

# Metro experimental — tree-shake + graph optimize + custom require
export EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
export EXPO_UNSTABLE_TREE_SHAKING=1
export EXPO_USE_METRO_REQUIRE=1

# Metro web export bellek yoğun — heap limitini yükselt (yoksa OOM/SIGABRT 134).
# Mevcut NODE_OPTIONS'ı koru, üstüne ekle.
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=8192"

# ── KALICI KORUMA 1: Metro transform cache'ini sıfırla ───────────────────────
# Bayat Metro cache, eski (ölü-env) bir build'den supabase modülünü cache'leyip
# .env düzelse bile ÖLÜ Supabase URL'ini bundle'a gömüyordu (2026-06-03 ve
# 2026-07-28'de yaşandı → "Uygulama yanlış Supabase projesine bağlı" banner'ı).
# Her prod build'i temiz cache ile başlat; yeni .env her zaman geçerli olsun.
rm -rf .expo node_modules/.cache "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/metro-cache 2>/dev/null || true

npm run build:web

# ── KALICI KORUMA 2: Ölü Supabase URL'i bundle'a sızmışsa build'i DURDUR ──────
# `https://fukaxeppklvtegnjuwih` yalnız gerçek URL kullanımında eşleşir; runtime
# guard'ın DEAD_SUPABASE_REFS dizisi (tırnak içinde, https:// yok) tetiklemez.
# Bulunursa kırık bundle'ı asla deploy etme — gürültülü hata ver.
DEAD_URL="https://fukaxeppklvtegnjuwih"
if grep -rqF "$DEAD_URL" dist/_expo/static/js/web/ 2>/dev/null; then
  echo "════════════════════════════════════════════════════════════════════════"
  echo "FATAL: Ölü Supabase URL'i ($DEAD_URL) bundle'a gömülmüş!"
  echo "Muhtemelen bayat Metro cache. Build DURDURULDU (kırık bundle deploy edilmez)."
  echo "Çözüm: cache temizlendi olmalı; EXPO_PUBLIC_SUPABASE_URL env'ini kontrol et."
  echo "════════════════════════════════════════════════════════════════════════"
  exit 1
fi
echo "✓ Supabase URL doğrulandı: bundle'da ölü URL yok."
