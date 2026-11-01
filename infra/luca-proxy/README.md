# luca-proxy

TÜRMOB Luca e-fatura SOAP servisine giden tüm çağrıların geçtiği küçük proxy.

**Neden:** Luca yalnız whitelist'teki statik IP'den gelen çağrıyı kabul eder ve
**şifre istemez** — yetki = IP + istekteki `CompanyTaxCode` (VKN). Whitelist'teki
IP VPS'imiz (93.127.213.200); Supabase edge function'larının çıkış IP'si sabit
değil. Bu yüzden: edge function → HMAC imzalı istek → `https://simanapp.tech/luca/*`
(Caddy) → bu servis → Luca.

## Kontroller (`app/lib.mjs`, testler `test/`)

- HMAC-SHA256 imza (`ts · yol · SOAPAction · sha256(gövde)`), ±5 dk pencere, tekrar (replay) reddi
- Yalnız izinli işlemler (`SERVICES`) — iptal vb. bilinçli olarak kapalı
- Gövdedeki işlem = SOAPAction; DOCTYPE/ENTITY yasak
- Her `CompanyTaxCode` ortamın VKN izin listesinde olmalı (`LUCA_VKN_TEST` / `LUCA_VKN_PROD`)
- Canlı ortam `LUCA_PROD_ENABLED=true` olana kadar kapalı · 60 istek/dk · 5 MB gövde sınırı

```bash
node --test infra/luca-proxy/test/*.test.mjs
```

## VPS kurulumu (`/opt/luca-proxy`)

```bash
scp -r app tools docker-compose.yml root@93.127.213.200:/opt/luca-proxy/
# .env: .env.example'a göre, chmod 600 (sır ayrıca Supabase secret: LUCA_PROXY_SECRET)
cd /opt/luca-proxy && docker compose up -d --force-recreate
```

Caddy (`/opt/nexadent/caddy/Caddyfile`, tek dosya bind mount → **yerinde** düzenle,
`cp`/`mv` ile değiştirme): `{$DOMAIN}` bloğunda basic-auth'lu `handle`'dan önce

```
handle /luca/* {
	reverse_proxy luca-proxy:8080
}
```

sonra `docker exec nexa-caddy caddy validate --config /etc/caddy/Caddyfile && docker exec nexa-caddy caddy reload --config /etc/caddy/Caddyfile`.

## Deneme

```bash
docker run --rm --network nexa_network --env-file /opt/luca-proxy/.env -v /opt/luca-proxy:/p:ro \
  node:22.12.0-alpine node /p/tools/call.mjs http://luca-proxy:8080 test InvoiceService HealthCheck
docker logs --tail 50 luca-proxy   # JSON satırları: call / deny / upstream_error (gövde loglanmaz)
```
