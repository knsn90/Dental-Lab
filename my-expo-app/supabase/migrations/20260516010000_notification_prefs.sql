-- ════════════════════════════════════════════════════════════════════════════
-- 20260516 — Kullanıcı bildirim tercihleri
--
-- profiles.notification_prefs (JSONB)
--   {
--     master_enabled: true,
--     channels: { in_app: true, browser_push: true, email: false },
--     categories: {
--       new_order:    { in_app: true, browser_push: true, email: false },
--       order_status: { in_app: true, browser_push: false, email: false },
--       chat:         { in_app: true, browser_push: true, email: false },
--       approval:     { in_app: true, browser_push: true, email: false },
--       payment:      { in_app: true, browser_push: false, email: false },
--       stock:        { in_app: true, browser_push: false, email: false },
--       delivery:     { in_app: true, browser_push: false, email: false },
--       paper_order:  { in_app: true, browser_push: true, email: false }
--     }
--   }
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "master_enabled": true,
    "channels": { "in_app": true, "browser_push": false, "email": false },
    "categories": {
      "new_order":    { "in_app": true,  "browser_push": true,  "email": false },
      "order_status": { "in_app": true,  "browser_push": false, "email": false },
      "chat":         { "in_app": true,  "browser_push": true,  "email": false },
      "approval":     { "in_app": true,  "browser_push": true,  "email": false },
      "payment":      { "in_app": true,  "browser_push": false, "email": false },
      "stock":        { "in_app": true,  "browser_push": false, "email": false },
      "delivery":     { "in_app": true,  "browser_push": false, "email": false },
      "paper_order":  { "in_app": true,  "browser_push": true,  "email": false }
    }
  }'::jsonb;

-- Mevcut kayıtların default'a düşmesi için (NOT NULL + default zaten doldurur, ama
-- eski satırlarda NULL olabilir — güvenlik için)
UPDATE public.profiles
SET notification_prefs = '{
    "master_enabled": true,
    "channels": { "in_app": true, "browser_push": false, "email": false },
    "categories": {
      "new_order":    { "in_app": true,  "browser_push": true,  "email": false },
      "order_status": { "in_app": true,  "browser_push": false, "email": false },
      "chat":         { "in_app": true,  "browser_push": true,  "email": false },
      "approval":     { "in_app": true,  "browser_push": true,  "email": false },
      "payment":      { "in_app": true,  "browser_push": false, "email": false },
      "stock":        { "in_app": true,  "browser_push": false, "email": false },
      "delivery":     { "in_app": true,  "browser_push": false, "email": false },
      "paper_order":  { "in_app": true,  "browser_push": true,  "email": false }
    }
  }'::jsonb
WHERE notification_prefs IS NULL;

COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Bildirim tercihleri (kategoriler × kanallar). Frontend localStorage + DB ile senkron tutulur.';
