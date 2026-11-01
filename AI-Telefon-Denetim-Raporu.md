# AI Telefon Asistanı — Teknik Denetim Raporu (Aşama 1)

> Tarih: 15 Ekim 2026 · Kapsam: `~/voice-agent` kaynak kodu (commit `5585929`) + sunucudaki köprü kayıtları
> **Bu aşamada kodda hiçbir değişiklik yapılmadı.** Kayıtlar yerelde analiz edildi, analiz için alınan kopya silindi.

## 0. Veri ve sınırlar

- **Kayıt örneklemi:** 12 çağrı, 92 kesin transkript, 68 LLM turu (8–15 Ekim). Dosyaya kayıt 8 Ekim'de başladı; daha önceki test çağrılarının kayıtları Docker log döndürmesiyle silinmiş.
- **Örneklem küçük.** Aşağıdaki oranlar yön gösterir, istatistiksel kesinlik iddia etmez.
- **Hattan sesin gerçekten duyulup duyulmadığı ölçülemiyor.** Asterisk'e gönderilen kareler bilinir, karşı tarafın jitter tamponu bilinmez. Bu nedenle "duyulan metin" yalnızca gönderilen kare sayısından tahmin edilebilir.
- **ElevenLabs kotası bittiği için şu an canlı ölçüm yapılamıyor.** Önce/sonra karşılaştırması kota yüklendikten sonra yapılabilir.

## 1. Ölçülen başlangıç değerleri (baseline)

| Metrik | Değer |
|---|---|
| Arayan sustuktan bota ses çıkana (`msSinceTranscript`) | **p50 1,50 sn · p95 3,93 sn** · min 0,85 · max 7,53 (n=67) |
| LLM ilk kelime — Haiku 5.5 | p50 0,65 · p95 0,81 sn (n=16) |
| LLM ilk kelime — Sonnet 5.5 | p50 0,92 · p95 2,68 sn (n=31) |
| LLM ilk kelime — Opus 5.5 | **p50 1,67 · p95 4,69 sn** (n=15) |
| TTS ilk bayt (eleven_v4_turbo) | p50 0,22 · p95 0,67 sn (n=64) |
| "Bir saniye." dolgusu | **23 / 68 tur (%34)** — Sonnet'te 15/35, Opus'ta 8/16, Haiku'da 0/17 |
| Araya girme şüphesi → doğrulanan | 35 şüphe → **8 doğrulandı, 27 "yanlış alarm"** |
| Erken başlatma (speculative) | 101 başlatma → **20 isabet (%20), 81 boşa** · kazanılan süre medyan ~150 ms |
| **Atılan (hiç işlenmeyen) arayan sözleri** | **16 / 92 kesin transkript (%17)** |
| Hazır cümle sentezi | 14 yeniden başlatmada 93 sentez (bunların 48'i kapalı özellik olan "Hmm/Hı hı" sesleri) |

## 2. Bulgular

### P0 — Çağrı güvenilirliği

#### P0-1 · Bot konuşurken ya da düşünürken söylenen sözler **tamamen atılıyor**
- **Kök neden:** `main.ts` içindeki `UtteranceAssembler` geri çağrısı `botActive()` doğruysa kesin transkripti yalnızca loglayıp bırakıyor (`TRANSCRIPT_PARTIAL ignoredWhileBusy`). Söz ne LLM'e gidiyor ne geçmişe yazılıyor.
- **Kanıt:** 16 atılmış söz. Örnekler: "Nusaybe bugün bana uğramıştı." (iki kez), "Melike." (bot ad sormuştu), "Kurye.", "Motor kurye.", "Evet.", "Ama", "Merhaba."
- **Kullanıcının duyduğu belirti:** "Konuşmama izin vermiyor", "beni dinlemiyor", adını söyleyince bot duymamış gibi devam ediyor. Kullanıcı aynı şeyi tekrar etmek zorunda kalıyor.
- **Çözüm:** Kesin söz hiçbir zaman atılmaz:
  - Bot **konuşuyorsa** → doğrulanmış araya girme sayılır.
  - Bot **düşünüyorsa** (henüz ses yok) → yürüyen üretim iptal edilir, önceki sözle birleştirilip yeniden üretilir.
  - Bot konuşurken gelen kısa onaylar ("evet", "tamam", "hı hı") konuşmayı kesmez ama bağlama eklenir.
- **Risk:** Orta. Tur akışının merkezi değişiyor; testlerle korunacak.

#### P0-2 · "Yanlış alarm" sayılan araya girmelerin çoğu aslında gerçek konuşma
- **Kök neden:** Ses eşiği aşılınca bot duraklıyor ve 700 ms içinde STT'den bir kelime bekliyor. Kısa sözlerde ilk kelime 8 kHz hatta 700 ms'den geç geliyor. Süre dolunca bot konuşmaya devam ediyor, ardından gelen söz de P0-1 yüzünden atılıyor.
- **Kanıt:** 27 "yanlış alarmın" **21'inde** 2,5 sn içinde gerçek kelimeler geldi ("Evet.", "Melike.", "Alo.", "Merhaba.", "Tamam, anladım."). Bu sözlerin ses seviyesi 1.000–7.000 RMS arası, normal konuşma düzeyinde.
- **Belirti:** Bot kısa bir an susup aynı cümleye devam ediyor (kekeleme hissi), arayanın sözü kayboluyor.
- **Çözüm:**
  - Doğrulama kesin transkripti de kabul etsin.
  - Bot devam ettikten sonra gecikmeli gelen kelime, kısa bir pencere içinde hâlâ araya girme sayılsın.
  - 700 ms'lik doğrulama süresi **ölçülerek** ayarlansın (eşik körlemesine değiştirilmez, yapılandırılabilir kalır).
- **Risk:** Düşük-orta. Gerçek gürültüde (öksürük, gitar) yanlış kesme riski artmasın diye kelime şartı korunur.

### P1 — Araya girme ve konuşma geçmişi

#### P1-1 · Kesilen cevap geçmişe tamamı söylenmiş gibi yazılıyor
- **Kök neden:** `engine.ts` içindeki `emit()` her cümleyi **TTS'e gönderildiği anda** `spoken`'a ekliyor. Araya girmede bu metnin tamamı "asistan söyledi" olarak geçmişe yazılıyor. TTS kuyruğunda bekleyen, hiç çalınmamış cümleler de buna dahil.
- **Kanıt (kod):** `spoken += …; onSentence(s)`, `history.push({role:'assistant', content: spoken})`. Kayıtlarda araya girmeler cevabın 0,6–0,9 saniyesinde oluyor (8 olayın 6'sı); o anda ilk cümle bile bitmemiş durumda.
- **Belirti:** Bot duyulmamış bilgiyi söylenmiş sanıyor ("az önce söylediğim gibi…"), ya da kesilen soruyu bir daha sormuyor.
- **Çözüm:**
  - Cümle başına "kuyruğa giriş / bitiş karesi" kaydı tutulur.
  - Araya girmede AudioPacer'ın gönderdiği kare sayısına göre yalnız **tamamen gönderilmiş** cümleler geçmişe yazılır.
  - Yarıda kalan cümle "…" ile kesik olarak işaretlenir (model kesildiğini bilir).
  - Kelime düzeyinde hizalama uydurulmaz.
- **Risk:** Düşük.

#### P1-2 · Asenkron ses kaynakları üretim kimliğiyle korunmuyor
- **Durum:** Ana TTS yolu zaten korunuyor: `RestTtsTurn` iptal edilince `finished` bayrağıyla geç gelen parçaları atıyor. **Kayıtlarda iptal edilmiş sesin tekrar çalındığına dair bir kanıt yok.**
- **Açık:** Bazı hazır ses kaynakları üretim kontrolü olmadan doğrudan kuyruğa ekleniyor: "Bir saniye bakıyorum" (araç çağrısında), selamlama/açılış ve dolgu. Şu an bunlar zamanlayıcı ve `aborted` kontrolleriyle büyük ölçüde güvende, ama bir değişmezlik (invariant) ile değil.
- **Çözüm:**
  - Her cevaba bir `generationId` verilir. `AudioPacer.enqueue(pcm, gen)` geçerli olmayan üretimin sesini reddeder, `clear()` üretimi ilerletir.
  - Durumlar açıkça loglanır: IDLE / LISTENING / THINKING / SPEAKING / INTERRUPTION_SUSPECTED / RECOVERING.
  - Tam bir durum makinesi yeniden yazımı yerine mevcut bayraklara değişmezlik kontrolü eklenir.
- **Risk:** Düşük.

#### P1-3 · Araç çağrısı (iş durumu sorgusu) iptal edilemiyor
- **Kök neden:** `runTool` sinyal almıyor. Arayan sorgu sürerken konuşursa tur bitene kadar bot "meşgul" kalıyor ve P0-1 devreye giriyor.
- **Çözüm:** Araca `AbortSignal` geçirilir, iptalde sonuç beklenmez.
- **Risk:** Düşük.

### P2 — Gecikme ve doğallık

#### P2-1 · Sabit 0,5 sn sessizlik eşiği yarım cümleleri bitmiş sayıyor
- **Kanıt:** Bölünmüş turlar görülüyor. Örneğin "Biz, eee, biz oto kiralama hizmeti veriyoruz…" sözünün ardından gelen devam ve 16 atılmış söz.
- **Çözüm (ek LLM çağrısı yok):** Mevcut `UtteranceAssembler` genişletilir. Kesin söz Türkçe yarım-cümle işaretleriyle bitiyorsa kısa bir ek bekleme yapılır (yapılandırılabilir, ~600 ms). İşaretler:
  - Sonda virgül, tire veya "…"
  - Sonda "ve, ama, yani, şey, eee, çünkü, ki, mesela, hani"
  - "Bir saniye", "bakıyorum", "dur" gibi beklemeli ifadeler
  
  Soru ya da nokta ile biten tam cümleler beklemeden gider. P0-1'deki birleştirme bu ek beklemenin kaçırdığı durumları da yakalar.
- **Risk:** Düşük. Yanlış ayarlanırsa en fazla birkaç yüz ms ek gecikme.

#### P2-2 · "Bir saniye." dolgusu gecikmeyi gizlemek için sık çalıyor
- **Kanıt:** Turların %34'ünde çalıyor. Sebep modelin geç ilk kelimesi: Sonnet p95 2,7 sn, Opus p95 4,7 sn.
- **Çözüm:**
  - Dolgu yalnızca gerçekten uzun bir işlemde (araç çağrısı) çalsın. Normal turlarda ya kapatılır ya da eşik ≥2,5 sn'ye çekilir. Giden aramada zaten kapalı.
  - Asıl iyileşme model seçiminden gelir: gelen aramada Opus p50 1,67 sn, Sonnet 0,92 sn. **Bu karar sana ait** (bkz. §4).
- **Risk:** Yok.

#### P2-3 · İlk parça bölücüsü sayıları ve numaraları ortadan bölebiliyor
- **Kök neden:** Virgül yoksa `SentenceSplitter` ilk parçayı **5 kelimede** kesiyor. Örneğin "Numaramız 0534 264 96 20." metni "Numaramız 0534 264 96" ve "20." olarak ayrılabilir. Ayrıca "Tabii hocam, size bu konuda" türünden doğal olmayan kopmalar oluşabilir.
- **Çözüm:**
  - Kelime sınırı yedeği 8+ kelimeye çıkarılır.
  - Rakam, telefon numarası, tarih/saat ve bağlaç ("ve", "ile", "için") öncesinde/ortasında bölme yapılmaz.
  - Virgül ile bölme korunur (iyi çalışıyor).
- **Risk:** Düşük. İlk ses en kötü durumda ~100–200 ms gecikebilir.

#### P2-4 · Konuşma talimatları ve yeni yönergeler arasında çelişki
- Mevcut giden talimat (benim 15 Ekim'de yazdığım) "her cevabın sonunda randevuya it, iki seçenek sun" diyor. Yeni yönerge daha danışmanvari bir dil istiyor: önce ilgiyi teyit et, her cevapta randevu isteme, tek seferde tek soru sor.
- Gelen talimatta: tek soru kuralı, hitabı her cümlede kullanmama ve "Anlıyorum/Tabii" ile başlama tekrarını yasaklama eksik.
- **Çözüm:** Her iki talimat yeni yönergeye göre güncellenir (bkz. §4 soru 2). Siman yetki ve gizlilik kuralları aynen korunur.

### P3 — Maliyet ve performans

#### P3-1 · Erken başlatma (speculative) maliyeti kazancından büyük
- **Kanıt:** 101 başlatmanın 81'i boşa gitti. 57'sinde ara metin değişti, 21'inde kesin metin farklı çıktı. Boşa giden LLM çağrısı sayısı (81), işe yarayan toplam tur sayısından (68) fazla. Kazanç medyan yalnızca ~150 ms.
- **Not:** Boşa giden tahminler TTS kredisi harcamıyor. Tampona yazılıyor ve çalınmıyor; **iptal edilen tahminin sesi hiçbir zaman çalınamıyor** (kod doğrulandı). Kayıp yalnızca LLM tokeni.
- **Çözüm:** Uyarlamalı hale getirilir:
  - Ara metin noktalama işaretiyle bitiyorsa ve ≥400 ms sabit kaldıysa başlatılır.
  - Yapılandırılabilir ve kapatılabilir (`SPECULATIVE_MS=0`).
- **Risk:** Yok (kapatılabilir).

#### P3-2 · Hazır cümleler her yeniden başlatmada yeniden sentezleniyor ve kapalı özelliğin sesleri de üretiliyor
- **Kanıt:** 14 başlatmada 93 sentez. Bunların 48'i `BACKCHANNEL` kapalıyken üretilen "Hmm/Hı hı/Tamam" sesleri.
- **Çözüm:**
  - Diskte kalıcı önbellek. Anahtar: metin + ses kimliği + model + dil + ses ayarları + çıktı biçimi (sha256). Yalnızca sabit cümleler önbelleğe girer, müşteriye özel konuşma girmez.
  - Kapalı özelliklerin sesleri üretilmez.
- **Risk:** Yok.

#### P3-3 · Kullanım ölçümü yok
- LLM giriş/çıkış/önbellek tokenları, TTS karakter sayısı ve STT süresi çağrı başına toplanmıyor.
- **Çözüm:** Anthropic yanıtındaki `usage` alanı, TTS karakter sayısı ve STT oturum süresi `CALL_ENDED` olayına yazılır. Maliyet **tahmini yapılmaz**, yalnızca birimler kaydedilir; faturaya dönüştürme sağlayıcı panelinden yapılır.

#### P3-4 · Kota bittiğinde STT 5 kez boşuna yeniden bağlanıyor
- **Kanıt:** `insufficient_funds` hatasından sonra 5 yeniden bağlanma denemesi oldu, ardından bot sessiz kaldı.
- **Çözüm:** Kota hatası kalıcı sayılır, yeniden bağlanma yapılmaz. Çağrı kısa bir hazır cümleyle kapatılır ve `ERROR quota` logu düşülür. (Hazır cümlenin önbellekte olması gerekir, P3-2 ile birlikte.)

## 3. Önerilen uygulama planı

| Faz | İçerik | Dosyalar | Risk |
|---|---|---|---|
| **2a** | P0-1 + P0-2: söz atılmaz, konuşurken araya girme sayılır, düşünürken birleştirip yeniden üretilir, kısa onaylar kesmez, gecikmeli kelime doğrulaması | `main.ts`, yeni `conversation/turnPolicy.ts` | Orta |
| **2b** | P1-1 duyulan metne göre geçmiş · P1-2 `generationId` + pacer koruması + durum logları · P1-3 iptal edilebilir araç | `engine.ts`, `pacer.ts`, `main.ts`, `tools/orderLookup.ts` | Düşük |
| **3** | P2-1 Türkçe yarım-cümle beklemesi · P2-3 bölücü düzeltmesi · P3-1 uyarlamalı erken başlatma · P2-2 dolgu politikası | `assembler.ts`, `sentences.ts`, `main.ts`, `env.ts` | Düşük |
| **4** | P2-4 talimatlar (gelen + giden) | `prompt.ts`, `outboundPrompt.ts` | Düşük |
| **5** | P3-2 kalıcı ses önbelleği · P3-4 kota davranışı | `tts/rest.ts`, `main.ts`, `stt/scribe.ts`, compose (önbellek klasörü bağlaması) | Düşük |
| **6** | P3-3 kullanım ölçümü · gecikme özet olayı (p50/p95 çağrı sonunda) | `anthropic.ts`, `main.ts`, `logger.ts` | Yok |

**Her faz için:** küçük değişiklik, mevcut 71 test + yeni regresyon testleri.

Fazların sonunda tek bir kurulum yapılır:
- Aktif çağrı kontrolü
- Yedek
- `.env` korunur
- Geri dönüş için önceki imaj etiketlenir

**Kurulum ve test aramaları ayrıca onayınla yapılır.**

**Eklenecek testler (özet):**
- Araya girme senaryoları: ilk kelimede, uzun cümlede, cümleler arasında, TTS akarken, LLM üretirken
- Öksürük/gürültü, yanlış alarm sonrası hemen konuşma, eşzamanlı iki araya girme olayı
- Geç gelen TTS parçası ve geç gelen LLM tokeni
- Araya girme sırasında çağrının bitmesi, kapanış cümlesinin kesilmesi
- Bot düşünürken gelen söz (birleştirme), konuşurken gelen kısa onay
- Türkçe yarım-cümle beklemesi, numara bölme
- Kota hatası, telesekreter, "aramayın", yetkisiz iş sorgusu

"Docker yeniden başlatma" ve "eşzamanlı çağrı" testleri sunucuda elle doğrulanır.

## 4. Kararını beklediğim noktalar

1. **Gelen aramada model:** Opus (daha akıllı, p50 1,7 sn / p95 4,7 sn) mi, Sonnet (p50 0,9 sn / p95 2,7 sn) mi? Önerim: **Sonnet**. Doğallık şikâyetlerinin önemli bir kısmı bekleme süresinden geliyor.
2. **Giden arama tarzı:** Bir önceki isteğin "randevu koparsın", yeni yönerge "baskı yapmasın, önce ilgiyi teyit etsin". Önerim: **ilgi teyidi → hemen iki somut seçenek**. İlgi yoksa bir kez yumuşak itiraz karşılaması, ikinci hayırda kapanış. Her cevapta randevu istemez.
3. **Faz 2a–6'yı sırayla uygulamama onay** (kod + test; sunucuya kurulum ayrı onayla).
