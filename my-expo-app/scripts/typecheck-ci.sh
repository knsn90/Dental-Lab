#!/usr/bin/env bash
# TypeScript hata sayısını mevcut baseline ile karşılaştırır.
# Yeni hata girilirse CI fail olur; mevcut hatalar tolere edilir.
# Hedef: Her sprint bu sayıyı düşürmek (46 → 0).

BASELINE=46
CURRENT=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)

echo "TypeScript hataları: $CURRENT (baseline: $BASELINE)"

if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo ""
  echo "HATA: $((CURRENT - BASELINE)) yeni TypeScript hatası eklendi!"
  echo "Hataları görmek için: npx tsc --noEmit"
  exit 1
fi

if [ "$CURRENT" -lt "$BASELINE" ]; then
  echo "Harika: $((BASELINE - CURRENT)) hata düzeltildi! scripts/typecheck-ci.sh dosyasındaki BASELINE=$BASELINE değerini $CURRENT olarak güncelleyin."
fi

exit 0
