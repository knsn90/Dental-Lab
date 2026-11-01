# Nexadent AI Telefon Asistanı — Sistem Belgesi

> Son güncelleme: 15 Ekim 2026
> Kapsam: gelen aramalara cevap veren AI asistan, Siman "Telefon Talepleri" modülü ve giden (pazarlama) arama altyapısı.
> Bu belgede **hiçbir şifre / API anahtarı yoktur**. Gizli değerler yalnız sunucudaki `.env` dosyasında ve Supabase secrets'ta durur.

---

## 1. Genel bakış

Nexadent'in sanal sabit hattı **0216 606 66 11** (Netgsm) aranınca çağrıyı bir AI asistan karşılar. Asistan gerçek zamanlı dinler, düşünür ve konuşur. Kayıt alıp sonra işleme gibi bir akış yoktur, her şey canlı akışla çalışır. Görüşme bitince konuşma özetlenir ve Siman'a "Telefon Talebi" olarak düşer. Yöneticilere de bildirim ve e-posta gider.

Aynı altyapı **dışarıyı arayabilir**. Amaç, potansiyel kliniklerle randevu ayarlayan bir pazarlama araması yapmak. Bu kısım şimdilik test aşamasında: yalnızca izin listesindeki numara aranabiliyor.

```
            Gelen arama                                   Giden arama
Arayan ──► Netgsm (185.88.7.189) ──SIP──► Asterisk ◄── çağrı dosyası (köprü yazar)
                                             │
                                     AudioSocket (TCP 127.0.0.1:4010, 8 kHz ses)
                                             │
                                     Köprü (Node.js, voice-bridge)
                     ┌───────────────┬───────┴────────┬─────────────────────┐
              ElevenLabs STT    Claude (LLM)     ElevenLabs TTS       Siman (Supabase)
              (Scribe v2 RT)   (Opus/Sonnet)   (eleven_v4_turbo)   talep kaydı + iş sorgusu
```

### Temel kararlar (kullanıcı kararları)
| Konu | Karar |
|---|---|
| Diller | Türkçe ana dil + İngilizce. Farsça/Arapça kaldırıldı. |
| Selamlama | "Nexadent, iyi günler, buyurun." "Yapay zeka destekli" denmez. |
| Hitap | "Kaan Bey", "Ayşe Hanım"; hekime "Hocam". Ad başta bir kez sorulur. |
| AI olduğunu söylemek | Kendiliğinden söylemez; içtenlikle sorulursa inkâr etmez ("Nexadent'in dijital asistanıyım"). |
| İş durumu sorgusu | **Yalnız Siman'da kayıtlı klinik/hekim numarasından arayanlara**. PIN yok. |
| Hasta gizliliği | TC, yaş, doğum tarihi, adres, telefon, sağlık geçmişi **asla** söylenmez (bot bu verilere hiç erişmez). |
| Telefon talepleri | Siman'a + e-posta (tam konuşma dökümüyle). musa@nexadentlab.com'a **gitmez**. |
| KVKK saklama | Talepler 90 gün sonra anonimleştirilir. |
| Modül | Siman'da lab bazında açılıp kapanan satılabilir modül (`phone_assistant`). |
| Giden aramalar | **Siman'a yazılmaz.** Sunucudaki lead sistemine (nexa-intel) kurulacak. |

---

## 2. Sunucu (VPS)

| Öğe | Değer |
|---|---|
| Sağlayıcı | Hostinger VPS |
| IP | 93.127.213.200 |
| Erişim | `ssh -i ~/.ssh/nexa_vps root@93.127.213.200` |
| Kurulum dizini | `/opt/voice-agent` |
| Yedekler | `/root/backup-voice-agent/` (ör. `pre-outbound-20261009-165942.tgz`) |

**Aynı sunucuda dokunulmayan diğer servisler:** `nexa-caddy`, `nexa-postgres`, `nexa-redis`, `nexa-n8n`, `nexa-n8n-worker`, `nexa-discovery` (lead sistemi, `/opt/nexadent`).

### 2.1 Docker servisleri (`/opt/voice-agent/docker-compose.yml`)
| Konteyner | İmaj | Ağ | Bellek | Görev |
|---|---|---|---|---|
| `voice-asterisk` | `andrius/asterisk:22` | host | 512 MB | SIP kayıt, çağrı, RTP, AudioSocket |
| `voice-bridge` | yerel build (`./app`) | host | 256 MB | STT + LLM + TTS + iş mantığı |

Docker logları: json-file, 10 MB × 3 dosya.

**Bağlamalar:**
- asterisk: `pjsip.conf`, `extensions.conf`, `rtp.conf` (salt-okunur), `generated/` (SIP kimliği), `spool/outgoing` → `/var/spool/asterisk/outgoing`, `spool/done` → `/var/spool/asterisk/outgoing_done`
- bridge: `app/knowledge` (salt-okunur), `logs` → `/logs`, `spool` → `/spool`

### 2.2 Güvenlik duvarı (UFW)
- `5060/udp` yalnız **185.88.7.189**'dan (Netgsm)
- `10000:10100/udp` RTP (ses)
- AudioSocket (4010) yalnız `127.0.0.1` üzerinde dinler, dışarıya kapalı.

### 2.3 Dosya düzeni
```
/opt/voice-agent/
├── docker-compose.yml
├── .env                      (600 — gizli değerler; yedekler: .env.bak-*)
├── render-sip.sh             (.env'den SIP kimlik dosyasını üretir, parolayı yazdırmaz)
├── asterisk/
│   ├── pjsip.conf            (gelen uç noktası, IP ile tanıma)
│   ├── extensions.conf       (dialplan: from-netgsm, outbound-ai)
│   ├── rtp.conf              (10000–10100, strictrtp)
│   └── generated/pjsip-auth.conf   (1000:1000, 600 — kimlik + kayıt + giden uç nokta)
├── app/                      (köprü kaynak kodu + Dockerfile + knowledge/nexadent.md)
├── logs/bridge.jsonl         (700/600, uid 1000 — konuşma dökümü içerir)
└── spool/{outgoing,done,tmp} (giden arama çağrı dosyaları, 1000:1000, 750)
```
Log döndürme: `/etc/logrotate.d/voice-agent`. Günlük döndürülür, 30 gün saklanır, sıkıştırılır (copytruncate).

---

## 3. Telefon hattı (Netgsm + Asterisk)

### 3.1 Netgsm
- Numara: **0216 606 66 11** (SIP kullanıcı adı = numara), alan adı `sip.netgsm.com.tr`, sunucu IP **185.88.7.189** UDP 5060.
- **Kayıt (registration) yöntemiyle** çalışır. SIP trunk yönlendirmesi işe yaramadı, çünkü Netsipp+ uygulaması aynı hesaba kayıtlıydı.
- ⚠️ **Netsipp+ uygulaması kapalı kalmalı.** Açık olursa gelen aramalar bota düşmeyebilir.
- Gelen çağrıda aranan numara `2166066611` (başında +90 yok), arayan kimliği `05XXXXXXXXX` biçiminde gelir.
- **Giden arama için hatta ses paketi gerekir.** Paket yokken Netgsm her aramayı 1 saniyede `486 User Busy` ile reddetti. 15 Ekim 2026'da paket yüklendi, giden arama çalışıyor.

### 3.2 SIP yapılandırması
- `pjsip.conf` → `[netgsm]` uç noktası: gelen aramalar, `context=from-netgsm`, alaw/ulaw, `direct_media=no`, `rtp_symmetric`, `force_rport`, `rewrite_contact`, rfc4733 DTMF. `[netgsm-identify]` gelen aramaları IP ile tanır (parola yok).
- `generated/pjsip-auth.conf` (`render-sip.sh` üretir):
  - `[netgsm-auth]` kullanıcı adı/parola
  - `[netgsm-reg]` kayıt: `server_uri=sip:185.88.7.189` (pjsip alan adını çözemedi, IP şart), 300 sn yenileme
  - `[netgsm-out]` aor + endpoint: **giden aramalar için ayrı uç nokta**. `outbound_auth`, `from_user`, `from_domain` tanımlı. Gelen tarafa dokunmaz.
- `.env` anahtarları (yalnız adlar): `NETGSM_SIP_USERNAME`, `NETGSM_SIP_PASSWORD`, `NETGSM_SIP_DOMAIN`, opsiyonel `NETGSM_SIP_SERVER_IP`.

### 3.3 Dialplan (`extensions.conf`)
**Gelen (`[from-netgsm]`):** çağrı cevaplanır. Arayan numara `UUID()` değerinin son 12 hanesine gömülür (köprü numarayı oradan okur), sonra `AudioSocket(UUID, 127.0.0.1:4010)` çalışır. Köprü kapalıysa kısa bir bip çalınıp kapatılır.

**Giden (`[outbound-ai]`):** karşı taraf açınca çalışır. UUID **`0ca11000`** önekiyle başlar (köprü bundan giden arama olduğunu anlar). Son 12 hane aranan numaradır.

### 3.4 Ses akışı (AudioSocket)
- Çerçeve: `[tür:1][uzunluk:2 BE][veri]`. `0x01` UUID, `0x10` ses (slin 8 kHz 16-bit, 20 ms = 320 bayt), `0x00` kapatma.
- Asterisk ses tamponlamaz. Köprüdeki **AudioPacer** sesi gerçek zamanlı 20 ms karelerle gönderir (duraklat/devam/temizle desteği var).
- Köprü `0x00` gönderirse çağrı kapanır (giden aramada botun telefonu kapatması bu yolla olur).

---

## 4. Köprü yazılımı (`voice-bridge`)

- **Kaynak:** `~/voice-agent` (yerel git deposu, uzak depo yok). Sunucuya `rsync` ile `/opt/voice-agent/app/` dizinine kopyalanır.
- **Çalışma ortamı:** Node 24, TypeScript type-stripping (derleme yok; constructor parameter properties kullanılamaz, `import type` şart). Bağımlılıklar: `ws`, `@anthropic-ai/sdk`.
- **Testler:** `npm test` → 71 test.
- **Commit geçmişi:**
  - `dd9cddb` ilk sürüm
  - `6938df8` dolgu/ilk parça hızlandırma
  - `76f4928` logrotate
  - `4bda0b9` giden arama altyapısı
  - `e03604e` giden aramada arayan numara
  - `9419224` randevu odaklı talimat, Sonnet, otomatik kapatma

### 4.1 Modüller
| Dosya | Görev |
|---|---|
| `src/main.ts` | Çağrı yönetimi: selamlama, tur akışı, araya girme, erken başlatma, giden mod, talep kaydı |
| `src/telephony/audiosocket.ts` | Çerçeve ayrıştırma/üretme, `callerFromUuid`, `isOutboundUuid`, `hangup` |
| `src/telephony/pacer.ts` | Gerçek zamanlı ses gönderimi (pause/resume/clear/onIdle/onFirstFrame) |
| `src/telephony/vad.ts` | Ses seviyesi (RMS) ve enerji dedektörü (araya girme için) |
| `src/telephony/callfile.ts` | Giden arama: numara normalleştirme, çağrı dosyası, izin listesi |
| `src/stt/scribe.ts` | ElevenLabs Scribe v2 Realtime: ara/kesin metin, yeniden bağlanma, takılma tespiti |
| `src/tts/elevenlabs.ts`, `rest.ts` | ElevenLabs TTS: v4 modelleri REST akışıyla, `pcm_8000` (dönüştürme yok) |
| `src/llm/anthropic.ts` | Claude akışı, araç kullanımı, ısıtma, düşünme ayarı |
| `src/conversation/engine.ts` | Konuşma geçmişi, cümle cümle akış, `[sessiz]` / `[kapat]` işaretleri, araç döngüsü, snapshot/restore |
| `src/conversation/prompt.ts` | Gelen arama talimatı |
| `src/conversation/outboundPrompt.ts` | Giden (randevu) talimatı, açılış cümlesi, telesekreter ve vedalaşma algılama |
| `src/conversation/sentences.ts` | Cümle bölücü (ilk parça erken gönderilir) |
| `src/conversation/speakable.ts` | Türkçe sayı/telefon okuma ("sıfır beşyüz otuz dört…") |
| `src/conversation/speculative.ts` | Erken başlatma (ara metin 250 ms sabit kalırsa LLM başlar) |
| `src/conversation/assembler.ts`, `backchannel.ts`, `honorific.ts` | Söz birleştirme, kısa tepkiler (kapalı), Bey/Hanım filtresi |
| `src/leads/extract.ts`, `intake.ts` | Görüşme sonu özet çıkarma (Claude JSON) ve Siman'a gönderim (yeniden denemeli) |
| `src/tools/orderLookup.ts` | `is_durumu_sorgula` aracı. Arayan numara modelden değil SIP'ten alınır |
| `src/tools/dial.ts` | Test için tek giden arama komutu |
| `src/tools/stt-bench.ts` | STT gecikme ölçümü |
| `src/logging/logger.ts` | JSON log. Gizli alanlar adla maskelenir |
| `knowledge/nexadent.md` | Bilgi tabanı: iletişim, hizmetler, çalışma saatleri ("sabah sekiz – akşam altı"), bilinmeyenler |

### 4.2 Bir görüşme turu
1. Arayanın sesi → Scribe (ara metinler + VAD ile kesin metin, 0,5 sn sessizlik eşiği).
2. Ses seviyesi kapısı: zayıf/uzak sesler (arka plan) atılır (`MIN_UTTERANCE_LEVEL`).
3. **Erken başlatma:** ara metin 250 ms değişmezse LLM önden başlar. Kesin metin aynıysa hazır cevap hemen çalınır (`SPECULATIVE_HIT`), farklıysa iptal edilir ve geçmiş geri yüklenir.
4. Claude cevabı akış halinde gelir. İlk cümle (≥10 karakterde virgül ya da 5 kelime) hemen TTS'e gider. Cevaplar en fazla `MAX_SENTENCES` cümle.
5. TTS sesi pacer ile hatta çalınır.
6. Model `[sessiz]` yazarsa hiçbir şey söylenmez (söz bota söylenmemiş ya da gürültü).
7. Model ilk kelimeyi 1,5 sn içinde vermezse (yalnız gelen aramalarda) kısa bir "Bir saniye." çalınır.

### 4.3 Araya girme (barge-in)
- Bot konuşurken arayan konuşursa: ses eşiği aşıldığında (`BARGE_IN_RMS` 800, `BARGE_IN_MS` 160) bot **anında duraklar**.
- STT'den gerçek bir kelime gelirse (`BARGE_IN_CONFIRM_MS` 700 içinde) konuşma tamamen kesilir ve bot dinlemeye geçer.
- Kelime gelmezse (gitar, kapı, öksürük gibi) bot kaldığı yerden devam eder.
- "Bot aktif" = LLM/TTS çalışıyor **veya** ses hâlâ çalınıyor (indirme bitse de çalma sürer).

### 4.4 Gecikme önlemleri
- Sabit cümleler (selamlama, açılış, "Bir saniye bakıyorum.", hata cümlesi) açılışta önceden sentezlenip bellekte tutulur.
- API bağlantıları çağrı boyunca her 3 sn'de bir ping ile sıcak tutulur, LLM selamlama sırasında ısıtılır.
- TTS ilk bayt ~130–300 ms (eleven_v4_turbo).
- Ölçülen konuşma→ses süresi: ~1,2–1,8 sn (Sonnet). Opus'ta ilk kelime 1,5–4,7 sn.

### 4.5 Gelen arama davranışı (talimat özeti)
- Rol: Nexadent ön büroda işini bilen, sıcak, zeki çalışan. Kısa (1–3 cümle), gündelik Türkçe; santral kalıpları yok.
- Arayan türüne göre davranır:
  - Hekim/klinik → hizmetler, adres, saat, iş durumu, geri arama talebi.
  - Firma/tedarikçi → dinler, teklifi yetkiliye iletir, firma ve kişi adını not alır.
  - Hasta → hekimine yönlendirir.
  - İş başvurusu → adını alır.
- Bilgi tabanı dışında bilgi uydurmaz. Fiyat ve genel teslim süresi söylemez, tıbbi tavsiye vermez. Laboratuvarın iç işleyişini paylaşmaz.
- STT bozulmalarını bağlamdan düzeltir ("krom" → kron, "viner" → veneer).
- Telefon numarasını gruplayarak, saati sözcükle söyler.

### 4.6 İş durumu sorgusu (Siman)
- Araç: `is_durumu_sorgula` (hasta adı ya da iş numarası).
- Edge function `voice-order-lookup`:
  - Arayan numaranın son 10 hanesi `clinics.phone` / `whatsapp_phone` / `doctors.phone` ile eşleşmeli.
  - Eşleşmezse `verified=false` döner ve bot bilgi vermez.
  - En fazla 3 eşleşme döner. Hasta adı en az 3 harf, iş numarası en az 3 hane olmalı.
  - Dönen alanlar: iş no, hasta adı, iş türü, durum, aşama, teslim tarihi, acil / bekletmede bilgisi.
- Hastanın kişisel alanları hiç sorgulanmaz. Loglara hasta verisi yazılmaz.

### 4.7 Görüşme sonu (gelen)
Claude konuşmadan JSON çıkarır: ad, telefon, talep, özet, geri arama isteği, dil. Tedarikçi aramalarında talep "Tedarikçi teklifi: …" olur. Kayıt `voice-lead-intake` edge function'ına gönderilir (gizli başlık + yeniden deneme).

---

## 5. Giden (pazarlama) arama

> Durum: **Aşama 1 kuruldu ve gerçek aramayla test edildi** (15 Ekim 2026). Kampanya ve lead sistemi entegrasyonu sonraki aşamalarda.

### 5.1 Nasıl çalışır
1. Köprü `/spool/tmp`'ye bir **çağrı dosyası** yazar ve `/spool/outgoing`'e taşır (Asterisk yarım dosya okumasın diye).
   ```
   Channel: PJSIP/05XXXXXXXXX@netgsm-out
   CallerID: <2166066611>        ← gizli numara ("Anonymous") Netgsm'de reddediliyordu
   MaxRetries: 0
   WaitTime: 35
   Context: outbound-ai
   Extension: s
   Setvar: OUTNUM=05XXXXXXXXX
   Archive: yes
   ```
2. Asterisk numarayı arar. Karşı taraf açınca `[outbound-ai]` çalışır ve köprüye `0ca11000…` UUID'siyle bağlanır.
3. Bot **önce karşı tarafın konuşmasını bekler** ("Alo"). 3,5 sn sessiz kalınırsa kendisi başlar.
4. İlk söz telesekreter / operatör anonsuysa ("sesli mesaj", "ulaşılamıyor", "sinyal sesinden sonra"…) **hiç konuşmadan kapatır**.
5. Değilse hazır açılış cümlesini çalar: *"Merhaba, iyi günler, Nexadent dijital diş laboratuvarından arıyorum. Hekiminizle kısaca görüşebilir miyim?"*
6. Konuşma randevu talimatıyla sürer.

### 5.2 Randevu talimatı (özet)
- **Tek hedef:** ekiple 15 dakikalık bir tanışma (ziyaret ya da online) için gün ve saat almak. Kesin randevu verilmez: "Ekibimiz arayıp teyit edecek."
- Tanıtım tek cümle, ardından hemen randevu istenir. **İki somut seçenek** sunulur ("Perşembe mi, gelecek hafta başı mı? Sabah mı, öğleden sonra mı?").
- Sekreter açarsa hekimin uygun olduğu zaman sekreterden alınır.
- İtirazlar bir kez karşılanır, sonra yine randevuya dönülür:
  - Fiyat listesi → "görüşmede size özel net fiyat"
  - "Çalıştığımız lab var" → "ikinci seçenek olarak tanışalım"
  - "Mail atın" → gönderilir + "ekip uğrasın"
  - "Meşgulüm" → iki geri arama saati sunulur
- İkinci hayırda ısrar edilmez. **"Beni aramayın" → hemen özür dilenir, listeden çıkarılır, kapatılır.**
- Randevu alınınca kısa özet ve vedalaşma; aynı soru iki kez sorulmaz.
- AI olduğu sorulursa: "Nexadent'in dijital asistanıyım, sizi ekibimizle buluşturmak için arıyorum." Numaranın nereden bulunduğu sorulursa: "herkese açık iletişim bilgilerinden".

### 5.3 Bot telefonu ne zaman kapatır
1. Model cümlenin sonuna `[kapat]` yazarsa (söylenmez), vedalaşma çalındıktan sonra.
2. Bot soru içermeyen bir vedalaşma cümlesiyle bitirirse ("İyi çalışmalar Hocam", "Görüşmek üzere"…).
3. Telesekreter algılanırsa (hemen).
4. Karşı taraf **20 sn** hiç konuşmazsa.
5. Görüşme **5 dakikayı** aşarsa (`OUTBOUND_MAX_SEC`).

### 5.4 Giden aramaya özel ayarlar
| Ayar | Değer | Neden |
|---|---|---|
| Model | `claude-sonnet-5-5`, düşünme kapalı | Opus 1,5–4,7 sn sessizlik yapıyordu |
| "Bir saniye." dolgusu | Kapalı | Her cevaptan önce "Bir saniye" demesi doğal değildi |
| Kayıt | Siman'a **yazılmaz** | Kullanıcı kararı. Döküm şimdilik yalnız `OUTBOUND_CALL_ENDED` logunda |

### 5.5 Güvenlik
- **İzin listesi:** `OUTBOUND_ALLOWLIST` (.env) dışındaki numara aranamaz. Şu an yalnız kullanıcının cep telefonu var.
- Numara normalleştirme: yalnız TR sabit (2xx–4xx) ve cep (5xx). 0800/0850/kısa numaralar reddedilir.
- Test komutu:
  ```bash
  ssh -i ~/.ssh/nexa_vps root@93.127.213.200 'docker exec voice-bridge node src/tools/dial.ts 05XXXXXXXXX'
  ```

### 5.6 Test sonucu (15 Ekim 2026)
Bağlantı kuruldu. Bot sessiz açılışta kendisi başladı, "Kaan Bey" diye hitap etti, fiyat itirazını karşıladı ve "Perşembe saat 12" randevusunu aldı. Sorunlar:
- Opus gecikmesi ve sürekli "Bir saniye": düzeltildi (Sonnet + dolgu kapalı).
- Aynı soruyu iki kez sordu: talimat düzeltildi.
- Görüşme ortasında **ElevenLabs kotası bitti** (35.912 kredi), STT ve TTS durdu.
- Kapatmadı, çünkü vedalaşma aşamasına gelinemedi. Ek kapatma güvenceleri eklendi.

---

## 6. Siman entegrasyonu ("Telefon Talepleri" modülü)

Proje: Supabase `kjwjxqfdsxkxgcgophdy`. İstemci: `my-expo-app` (commit `805c67d`, main). **Web deploy bekliyor.**

### 6.1 Veritabanı (migration'lar, hepsi canlı)
| Migration | İçerik |
|---|---|
| `20261008100000_phone_leads.sql` | `phone_leads` tablosu, RLS, `record_phone_lead` RPC |
| `20261008110000_phone_leads_optout.sql` | Bildirim tercihinde `phone_lead.in_app=false` olanlar atlanır (Musa kapalı) |
| `20261008120000_phone_leads_title.sql` | Bildirim başlığı "Telefon talebi: <talep> – <ad>" |
| `20261009100000_phone_leads_retention.sql` | KVKK: `anonymize_old_phone_leads(90)` + cron `phone-leads-anonymize` her gece 03:30 TR |
| `20261009120000_feature_flags_phone_assistant.sql` | `phone_assistant` modül bayrağı (varsayılan kapalı, Nexadent açık), `lab_feature_enabled()`, bayraklı RLS, `set_phone_lead_status` RPC, realtime |

**`phone_leads` alanları:** call_id, caller_number, contact_name, contact_phone, request, summary, wants_callback, language, transcript (jsonb), duration_sec, status (`new`/`called`/`closed`), note, handled_by/at, anonymized_at, created_at.

**Erişim:** aynı lab + admin/müdür + modül açık. Doğrudan UPDATE kapalı, durum değişikliği yalnız RPC ile yapılır.

**Anonimleştirme (90 gün):** döküm, numara, ad, telefon, özet ve not silinir. Talep konusu, tarih ve durum istatistik için kalır. Bildirim ve e-posta kayıtları da talep konusuna indirgenir.

### 6.2 Edge function'lar
| Fonksiyon | Görev |
|---|---|
| `voice-lead-intake` | Köprüden talep alır (`VOICE_INTAKE_SECRET` başlığı şart, yoksa 401), `record_phone_lead` çağırır |
| `voice-order-lookup` | Kayıtlı numaraya iş durumu (bkz. 4.6) |
| `send-email-notification` | `phone_lead` kategorisinde, güvenilir çağrıda ve aynı labda e-postaya **tam konuşma dökümü** ekler. Konu satırı talebi içerir |

Supabase secrets: `VOICE_INTAKE_SECRET`, `VOICE_LAB_ID`.

### 6.3 Bildirimler
`_notify_channels` üzerinden uygulama içi + e-posta + push + WhatsApp. Lab yöneticisi/müdürleri alır. Bildirim tercihinde kapatan (ör. Musa) almaz. Bildirim bağlantısı `/phone-leads/<id>`.

### 6.4 İstemci
| Dosya | Görev |
|---|---|
| `core/store/featureFlagsStore.ts` | `my_feature_flags()` ile lab modül bayrakları, `useFeature()` |
| `modules/phone-leads/api.ts` | `listPhoneLeads`, `setPhoneLeadStatus`, `formatPhone` |
| `modules/phone-leads/screens/PhoneLeadsScreen.tsx` | Sekmeler, arama, liste, detay (döküm, durum, not, ara bağlantısı), `?id` derin bağlantı, realtime, koyu tema |
| `app/(lab)/phone-leads.tsx`, `app/(admin)/phone-leads.tsx` | Rotalar (lazy) |
| `app/phone-leads/[id].tsx` | Bildirimden gelen bağlantıyı role göre yönlendirir |
| `core/layout/PatternsShell.tsx` | Menü öğesinde `requiresFeature` desteği |
| `(admin)/_layout.tsx`, `(lab)/_layout.tsx` | Menü öğesi (lab'da yalnız müdür) |
| i18n | `nav.items.phoneLeads` tr/en/de/fa + otomatik sözlük |

**Platform paneli:** `admin_set_lab_flag` ile her lab için modül açılır/kapanır. Satılacak lablarda bu modül böyle yönetilir.

---

## 7. Yapılandırma (`.env` anahtar adları — değerler gizli)

| Grup | Anahtarlar |
|---|---|
| Netgsm | `NETGSM_SIP_USERNAME`, `NETGSM_SIP_PASSWORD`, `NETGSM_SIP_DOMAIN` |
| ElevenLabs | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (ses: `xyqF3vGMQlPk3e7yA4DI`) |
| TTS | `TTS_MODEL=eleven_v4_turbo`, `TTS_STABILITY`, `TTS_SIMILARITY`, `TTS_STYLE`, `TTS_SPEED` |
| STT | `STT_LANGUAGE=tr`, `STT_SECONDARY_LANGUAGES=en`, `STT_VAD_SILENCE_SECS=0.5`, `STT_FILTER_BG=false` (+200–300 ms gecikme yaptığı için kapalı), `STT_KEYTERMS` (varsayılan: diş lab terimleri, en çok 50 × 20 karakter) |
| LLM | `ANTHROPIC_API_KEY`, `LLM_MODEL=claude-opus-5-5`, `LLM_EFFORT=low`, `LLM_THINKING=default`, `LLM_MAX_TOKENS=1500` |
| Konuşma | `MAX_SENTENCES=3`, `SPECULATIVE_MS=250`, `SLOW_FILLER_MS=1500`, `MIN_UTTERANCE_LEVEL`, `BACKCHANNEL` (kapalı), `HONORIFICS` (açık) |
| Araya girme | `BARGE_IN_RMS=800`, `BARGE_IN_MS=160`, `BARGE_IN_CONFIRM_MS=700` |
| Siman | `VOICE_INTAKE_URL`, `VOICE_LOOKUP_URL`, `VOICE_INTAKE_SECRET`, `SUPABASE_ANON_KEY` |
| Giden | `OUTBOUND_ALLOWLIST`, `OUTBOUND_MAX_SEC=300`, `OUTBOUND_CALLER_ID` (varsayılan SIP kullanıcı adı), `OUTBOUND_LLM_MODEL=claude-sonnet-5-5`, `OUTBOUND_LLM_THINKING=off`, `OUTBOUND_SLOW_FILLER_MS=0` |

Model notları:
- Opus 5.5'te düşünme kapatılamıyor, yalnızca `effort` ile kısılabiliyor.
- Sonnet 5.5'te `disabled` 400 hatası veriyor, bunun yerine `between_tools` kullanılıyor.
- Opus fast mode bu organizasyonda kapalı (429).
- ElevenLabs WebSocket TTS v4 modellerini reddediyor, bu yüzden REST akışı kullanılıyor.

---

## 8. Güvenlik ve gizlilik özeti
- Şifre ve anahtarlar kodda, git'te, loglarda ve ön yüzde **yok**. Yalnız `.env` (600) ve Supabase secrets'ta.
- Logger gizli alanları **tam adla** maskeler (alt dize eşleşmesi yok; `firstTokenMs` gibi alanlar yanlışlıkla gizlenmesin diye).
- SIP parolası loglanmaz. `render-sip.sh` parolayı ekrana yazmaz.
- İş sorgusu yalnız kayıtlı numaraya. Numara SIP'ten alınır, modelin söylediği numaraya güvenilmez.
- Hasta kişisel verisi sorgulanmaz ve söylenmez.
- Lead kaydı gizli başlıksız 401. RLS lablar arası erişimi engeller (test edildi).
- KVKK: talepler 90 gün sonra anonim. Köprü logları 30 gün tutulur (konuşma dökümü içerir).
- Giden arama: izin listesi, "aramayın" diyene ısrar yok.
- ⚖️ **Hukuki not:** toplu pazarlama aramalarından önce İYS (6563 sayılı kanun) kontrolü ve avukat görüşü önerildi. AI olduğunu baştan söylememek şikâyet riskini artırır.

---

## 9. İşletme / bakım komutları

```bash
# Sunucuya bağlan
ssh -i ~/.ssh/nexa_vps root@93.127.213.200

# Durum
docker ps --format '{{.Names}}\t{{.Status}}'
docker exec voice-asterisk asterisk -rx "pjsip show registrations"     # Registered olmalı
docker exec voice-asterisk asterisk -rx "core show channels count"

# Canlı log
tail -f /opt/voice-agent/logs/bridge.jsonl

# Kod güncelleme (yerelden)
rsync -a -e "ssh -i ~/.ssh/nexa_vps" ~/voice-agent/src ~/voice-agent/tests root@93.127.213.200:/opt/voice-agent/app/

# Köprüyü yeniden kur — TEMİZ ortamda (kabukta .env source edildiyse compose eski değerleri kullanır)
cd /opt/voice-agent
env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin HOME=/root docker compose build -q bridge
env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin HOME=/root docker compose up -d bridge

# SIP kimliği değişince
bash render-sip.sh

# Dialplan değişince
docker exec voice-asterisk asterisk -rx "dialplan reload"
```

**Değişiklikten önce:** `core show channels count` ile aktif çağrı olmadığını kontrol et. Yedek: `tar czf /root/backup-voice-agent/<ad>.tgz --exclude=./logs --exclude=./app/node_modules .`

### Önemli log olayları
- Çağrı: `CALL_STARTED` (direction), `CALL_ENDED`
- Konuşma: `TRANSCRIPT_RECEIVED`, `LLM_REQUEST`, `LLM_RESPONSE` (firstTokenMs), `AI_SPEAKING_STARTED` (msSinceTranscript), `TTS_FIRST_BYTE`
- Akış kontrolü: `SPECULATIVE_HIT/MISS`, `INTERRUPTION`, `BARGE_IN_SUSPECT/FALSE`, `NOISE_IGNORED`, `SLOW_FILLER`
- Kayıt: `LEAD_SAVED/SKIPPED`
- Giden: `OUTBOUND_QUEUED`, `OUTBOUND_HELLO`, `OUTBOUND_VOICEMAIL`, `OUTBOUND_HANGUP`, `OUTBOUND_IDLE`, `OUTBOUND_CALL_ENDED` (döküm)
- Hata: `ERROR` (where: stt / tts_rest / llm / lead …), `STT_RECONNECT`

---

## 10. Bilinen sorunlar ve dikkat edilecekler
| Sorun | Durum / çözüm |
|---|---|
| **ElevenLabs kotası bitti** (35.912 kredi, 15 Ekim) | Bot şu an konuşamıyor/duyamıyor; **gelen aramalar da etkileniyor**. Paket + kullanıma dayalı aşım önerildi (~Pro, ~500 bin kredi/ay). Yükleme sonrası köprü yeniden başlatılmalı (hazır cümleler yeniden üretilir). |
| Her yeniden başlatmada hazır cümleler yeniden sentezleniyor | Kredi harcıyor. Diske önbellekleme önerildi (yapılmadı). |
| Açılış cümlesi uzundu (~9 sn) | Kısaltıldı, tekrar ölçülecek. |
| Opus gecikmesi (gelen aramalar) | Opus deneme olarak açık. Geri dönüş: `.env.bak-before-opus` (Sonnet). |
| Netsipp+ açık kalırsa | Gelen aramalar bota düşmeyebilir. |
| pjsip alan adı çözemiyor | `server_uri` / `contact` IP ile yazılı (185.88.7.189). |
| `.env` kabukta source edilirse | `docker compose` eski değerleri kullanır, temiz ortamda (`env -i`) çalıştır. |
| Opus fast mode | Organizasyonda kapalı (429). |

---

## 11. Yol haritası (bekleyenler)

**Giden arama**
- **Aşama 2 — Lead sisteminde "Telefon Kampanyası" sekmesi** (`/opt/nexadent`, nexa-intel paneli; git deposu değil, önce tam yedek; ayrı modül `src/phone/` + migration `0032`; e-posta outreach koduna dokunulmaz):
  - Filtreyle liste seçimi (bölge, durum, sabit/cep), onaylayınca başlatma
  - Arama saatleri (ör. hafta içi 10–12 ve 14–17), günlük üst sınır, tek hat, numara başına en fazla 3 deneme
  - Sonuç ekranı: randevu (gün/saat), ilgilenmiyor, telesekreter, aranmasın + döküm
  - Randevuda e-posta bildirimi
- **Aşama 3 — Geri yazma:** her arama `touchpoint` olur, lead durumu güncellenir. "Aramayın" → `organization.do_not_contact` + `suppression_reason`. İYS kontrol alanı.
- Lead verisi (nexa Postgres): 1.962 kurum, 1.905'inde telefon, 1.526 diş kliniği; 1.057 cep / 795 sabit hat. En çok kayıt İstanbul, Kadıköy, Ankara, Ataşehir, Antalya, Üsküdar'da.
- Satış anlatımının eğitilmesi (öne çıkarılacak konular, görüşmeyi kimin nasıl yapacağı): kullanıcı "sonra" dedi.

**Gelen arama / Siman**
- Siman web deploy (Telefon Talepleri ekranı).
- Kayıtlı bir klinik numarasıyla iş sorgusunun canlı testi.
- Satış öncesi çok-lab desteği: lab başına numara, ses ve bilgi tabanı.
- Opus denemesinin değerlendirilmesi (gecikme kötüyse Sonnet'e dönüş).
- Bilgi tabanında eksikler: üretim süreleri, açık günler, fiyatlar (bilinçli olarak söylenmiyor).
