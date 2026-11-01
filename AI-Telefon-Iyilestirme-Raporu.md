# AI Telefon Asistanı — İyileştirme Sonuç Raporu (Faz 2–6)

> Tarih: 15 Ekim 2026
> Kod: `~/voice-agent`, `5585929..645577c` arası 8 commit
> Durum: **Yerelde uygulandı ve test edildi. Sunucuya kurulmadı** (kurulum ayrıca onayınla yapılacak).
> Denetim raporu: [AI-Telefon-Denetim-Raporu.md](AI-Telefon-Denetim-Raporu.md)

## A–B. Denetim ve kök nedenler (özet)
| Kod | Kök neden | Kayıttaki kanıt |
|---|---|---|
| P0-1 | Bot konuşurken/düşünürken gelen kesin söz atılıyordu | 16/92 söz (%17) işlenmedi |
| P0-2 | Kelime 700 ms'de yetişmeyince araya girme "yanlış alarm" sayılıyordu | 27 yanlış alarmın 21'i gerçek konuşma |
| P1-1 | TTS'e gönderilen her cümle "söylendi" sayılıyordu | Kesmelerin çoğu cevabın 0,6–0,9. saniyesinde |
| P1-2 | Hazır seslerin (dolgu, "bakıyorum") üretim koruması yoktu | Kanıt yok, değişmezlik eksikti |
| P1-3 | İş sorgusu iptal edilemiyordu | Kod |
| P2-1 | Sabit 0,5 sn tur sonu yarım cümleleri bitmiş sayıyordu | Bölünmüş turlar |
| P2-2 | "Bir saniye." gecikmeyi gizliyordu | Turların %34'ü |
| P2-3 | İlk TTS parçası sayının/numaranın ortasından bölünebiliyordu | Kod (5 kelime kuralı) |
| P3-1 | Erken başlatma çoğunlukla boşa gidiyordu | 101 başlatma, 20 isabet |
| P3-2 | Hazır sesler her yeniden başlatmada yeniden üretiliyordu | 93 sentez, 48'i kapalı özellik |
| P3-3 | Maliyet ölçümü yoktu | — |
| P3-4 | Kota bitince STT boşuna yeniden bağlanıyor, bot susuyordu | 5 deneme + sessizlik |
| (yeni) | Compose tanımsız ayarı `""` geçiriyor, `Number("")=0` yeni ayarları kapatırdı | Faz 3 sonrası kontrolde bulundu |

## C–D. Değişiklikler
| Faz | Dosyalar | Ne değişti |
|---|---|---|
| 2 | `src/call/session.ts` (yeni; `main.ts`'ten taşındı), `conversation/turnPolicy.ts` (yeni), `telephony/pacer.ts`, `conversation/engine.ts`, `tts/rest.ts`, `tts/elevenlabs.ts`, `tools/orderLookup.ts` | Söz **hiç atılmaz**: konuşurken → araya girme; düşünürken → iptal + birleştirip yeniden üretme. Kısa onay ("evet/tamam/hı hı") konuşmayı kesmez; bot soru sorduysa soru bitince cevap sayılır. Yanlış alarmdan sonra 1,2 sn içinde gelen anlamlı kelime yine araya girme sayılır. **Üretim kimliği:** iptal edilen üretimin geç gelen sesi kuyruğa giremez. **Duyulan metin:** cümle başına kare aralığı tutulur; geçmişe yalnız hatta çıkan kısım yazılır, yarım cümle "…" ve `[araya girildi]` ile işaretlenir (5 kare jitter payıyla temkinli). Durum logu: listening/thinking/speaking/suspected. İş sorgusu çağrıyla iptal edilir. |
| 3 | `conversation/assembler.ts`, `conversation/sentences.ts`, `config/env.ts` | **Uyarlamalı tur sonu** (ek model çağrısı yok): sonda virgül veya "ve/ama/yani/şey/eee…" → 600 ms bekleme; "bir saniye, bakıyorum" → 3 sn bekleme. Arayan devam ederse bekleme uzar, söz tek parça gider. Soruyla biten söz beklemez. **İlk TTS parçası:** 8 kelimede ve yalnızca güvenli sınırda bölünür (sayı, telefon numarası ve bağlaç ortasında bölünmez). **Erken başlatma** yalnızca noktalamayla biten ara metinde başlar. **"Bir saniye." dolgusu** varsayılan olarak kapalı. |
| 3+ | `config/env.ts` | Boş ortam değişkeni sayısal varsayılanı bozmaz. |
| 4 | `conversation/prompt.ts`, `conversation/outboundPrompt.ts`, `engine.ts` | **Gelen:** bir cevapta tek soru; hitap ve "Hocam" ara sıra; aynı kelimeyle başlamama; yapılmamış işi yapılmış söylememe; insan olduğunu iddia etmeme; `[araya girildi]` işaretinin anlamı. **Giden:** danışman tarzı; önce ilgi teyidi, ilgi varsa iki somut seçenek; her cevapta randevu istememe; "çalıştığımız lab var" itirazında bekleme; sekretere kısa neden ve uygun zaman sorusu. **"Aramayın" diyene söylenmeyen `[aranmasın]` işareti** → `OUTBOUND_DNC` + çağrı sonu `doNotCall: true` (lead sistemine yazılması Aşama 3'te). |
| 5 | `tts/phraseStore.ts` (yeni), `main.ts`, `stt/scribe.ts`, `tts/rest.ts`, compose | **Kalıcı sabit cümle önbelleği** (`/cache`). Anahtar: metin + ses + model + ayarlar + biçim (sha256), dosya izni 600. Yalnızca sabit cümleler önbelleğe girer, müşteri konuşması girmez. Kapalı "Hmm/Hı hı" sesleri artık üretilmez. **Kota:** STT `insufficient_funds/quota` → yeniden bağlanma yok. TTS 401/402/429 → hata bildirimi. Oturum sessiz kalmaz: önbellekteki hata cümlesini çalar ve kapatır. |
| 6 | `llm/anthropic.ts`, `llm/provider.ts`, `call/session.ts`, `tools/report.ts` (yeni) | Anthropic'in bildirdiği **gerçek token kullanımı** (giriş/çıkış/önbellek), iptal edilen akışta da kısmen. Çağrı sonunda `CALL_METRICS`: gecikme p50/p95/max, araya girme, yanlış alarm, birleştirme, onay, dolgu, erken başlatma, eski üretimden atılan kare sayısı, model başına token, TTS'e giden karakter, STT saniyesi. `node src/tools/report.ts <log> [--since tarih]` ile önce/sonra raporu. |

## E. Gecikme — önce / sonra
**Önce (canlı kayıtlar, 8–15 Ekim, 12 çağrı):**
- Cevap gecikmesi (arayan sustuktan bota ses çıkana): p50 1,50 sn, p95 3,93 sn
- LLM ilk kelime: Opus p50 1,67 / p95 4,69 sn · Sonnet p50 0,92 / p95 2,68 sn
- Dolgu oranı %34

**Sonra: canlı ölçüm henüz yok.** Sebep: ElevenLabs kotası bitik ve sürüm kurulmadı.

Beklenen etkiler kod ve kayıt verisinden çıkarım, ölçüm değil:
- Gelen aramada Sonnet'e geçiş, kayıtlardaki LLM ilk kelime p50'sini 1,67 sn'den 0,92 sn'ye indirir. Toplam cevap gecikmesi kabaca 0,7 sn azalır.
- Yarım cümle beklemesi bazı turlara bilerek **+600 ms** ekler. Bu, ilerleyip bölünmüş cevap vermemek için seçilmiş bir ödünleşim.
- Dolgu kapalı: gecikme artık gizlenmiyor, açıkça ölçülüyor.

Kurulumdan sonra aynı raporu `report.ts --since` ile alıp karşılaştıracağım.

## F. Araya girme testleri (simülasyon: gerçek AudioPacer + gerçek zamanlayıcılar, sahte STT/LLM/TTS)
| Senaryo | Sonuç |
|---|---|
| Uzun cümle ortasında araya girme: eski ses bir daha çalmaz, kesilen cümle tekrarlanmaz, geçmiş yalnız duyulanı içerir | ✔ |
| İlk kelimede araya girme | ✔ |
| Cümleler arasında araya girme (ilk cümle tam duyulmuş sayılır) | ✔ |
| LLM düşünürken gelen söz: birleştirme, tek cevap, atılan söz yok | ✔ |
| Öksürük/gürültü: duraklar, kaldığı yerden devam eder; kare kaybı ve tekrar yok | ✔ |
| Yanlış alarmdan hemen sonra gecikmeli kelime → araya girme | ✔ |
| Aynı anda iki araya girme olayı: tek iptal, söz bir kez işlenir | ✔ |
| İptal edilen TTS geç ses gönderir → çalınmaz (üretim kimliği) | ✔ |
| İptal edilen LLM geç token gönderir → seslendirilmez | ✔ |
| Konuşurken "evet": kesmez; soruya cevapsa soru bitince işlenir | ✔ ✔ |
| Selamlama sırasında "Alo" kesmez, gerçek soru keser | ✔ |
| Araya girme şüphesi sırasında çağrı biter: ses ve hata yok | ✔ |
| Giden: kapanış cümlesi kesilirse telefon kapanmaz | ✔ |
| Giden: "aramayın" → işaret söylenmez, kayıt + kapatma; telesekreter → konuşmadan kapatma | ✔ |
| Yarım cümle bekleme / tam soru beklemez | ✔ ✔ |
| Erken başlatma: noktalamasız başlamaz, tutan tahmin tek kez çalar, tutmayan çalmaz | ✔ |
| STT kotası / TTS 401: hata cümlesi + kapatma | ✔ ✔ |
| Eşzamanlı iki çağrı birbirine karışmaz | ✔ |

## G. Regresyon
- `npm test`: **106 / 106 geçti.** Önceki 71 testin tamamı korunuyor, 35 test yeni.
- Test paketi 18 kez çalıştırıldı (6'sı yük altında, ikişer eşzamanlı) ve hepsi geçti. Ondan önceki bir çalıştırmada tek bir test başarısız olmuştu; yeniden üretilemedi, nadir bir zamanlama sapması olarak not edildi.
- TypeScript tip kontrolü (strict): yeni kodda hata yok. Önceden var olan tek eksik `ws` paketinin tip tanımı.
- **Sunucuda elle doğrulanacaklar:** Docker yeniden başlatma, gerçek hat üzerinde araya girme ve kota yüklendikten sonra önbelleğin dolması.

## H. İşletme maliyeti (ölçülen birimler; fatura tahmini yapılmadı)
- **TTS:** Sabit cümleler artık yalnızca ilk açılışta sentezleniyor, sonraki her yeniden başlatmada 0. Eskiden her başlatmada 9 cümle sentezleniyordu, bunun 4'ü hiç kullanılmayan sesti.
- **LLM:** Erken başlatma artık yalnızca noktalamalı ara metinde. Eski kayıtlarda boşa giden çağrı sayısı (81), kullanılan tur sayısını (68) aşıyordu. Yeni isabet oranı kurulumdan sonra `CALL_METRICS` ile ölçülecek.
- **Model:** Gelen aramada Sonnet; birim token fiyatı Opus'tan düşük.
- **Ölçüm:** Artık her çağrı için token (giriş/çıkış/önbellek), TTS karakteri ve STT saniyesi kaydediliyor. Faturaya dönüştürme sağlayıcı panellerinden yapılacak.

## I. Kalan sınırlamalar
- "Duyulan metin" hatta yazılan kareden tahmin ediliyor. Karşı tarafın jitter tamponu bilinmediği için 100 ms pay bırakıldı, kelime düzeyinde hizalama yok.
- Yanlış alarmda bot kaldığı kareden devam ediyor (tekrar yok). 300–700 ms'lik duraklama yine duyulabilir.
- Tur sonu beklemesi kural tabanlı. Kural listesinde olmayan yarım cümleler, sonraki sözle birleştirme yoluyla yakalanıyor.
- WebSocket TTS yolunda (v4 dışı modeller) cümle sınırı bilgisi yok. Orada geçmiş eskisi gibi kaydediliyor; şu an kullanılmıyor.
- Giden aramadaki "aranmasın" bilgisi şimdilik yalnızca kayıtta. Lead veritabanına yazılması Aşama 3'te.
- Örneklem küçük (12 çağrı). Oranlar kurulum sonrası daha çok çağrıyla doğrulanmalı.

## J. Önerilen sonraki adımlar
1. **ElevenLabs kotasını yükle.** Bot şu an gelen aramalarda da sessiz.
2. **Kurulum (onayınla):**
   - Aktif çağrı kontrolü
   - Yedek ve mevcut imajı `pre-faz2` olarak etiketleme (geri dönüş tek komut)
   - Kod + compose
   - `cache/` klasörü
   - `.env` güncellemesi: `LLM_MODEL=claude-sonnet-5-5`, `LLM_THINKING=off`, `SLOW_FILLER_MS=0`
3. Kurulum sonrası 3–5 test görüşmesi: gelen, giden ve kesintili senaryolar. Ardından `report.ts --since` ile önce/sonra raporu.
4. Lead sistemi Aşama 2–3 (kampanya ekranı, `do_not_contact` geri yazma).
