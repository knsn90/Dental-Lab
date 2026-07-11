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

npm run build:web
