# SIMAN — Yapay Zekâ Veri İşleme Politikası (AI Processing Notice)

**Sürüm:** 1.0 · **Yürürlük:** 23 Temmuz 2026

> Bu metin, SIMAN’daki yapay zekâ özelliklerinin **gerçek** teknik davranışını
> açıklar. İçerik, kaynak kodundaki edge fonksiyonları ve `05-ai-data-processing.md`
> raporuna dayanır. Tek bir sağlayıcı ve tek bir model ailesi kullanılır.

---

## 1. Kullanılan Model ve Sağlayıcı

- **Sağlayıcı:** **Anthropic PBC** (ABD) — **YURT DIŞI**
- **Model:** `claude-sonnet-4-5`
- **Uç nokta:** `https://api.anthropic.com/v1/messages`
- **Anahtar güvenliği:** Anthropic API anahtarı yalnızca sunucu tarafında (edge
  fonksiyon ortamı) tutulur; istemciye **asla** gönderilmez. Tüm çağrılar,
  oturumu doğrulanmış kullanıcı için sunucu üzerinden yapılır.
- **Başka AI sağlayıcısı yoktur:** Kodda OpenAI, Google Gemini, cihaz-üstü model,
  gömme (embedding) deposu veya model eğitimi hattı **bulunmaz**.

## 2. Yapay Zekâ Özellikleri ve Gönderilen Veri

Yapay zekâ özellikleri **yalnızca kullanıcı tarafından başlatılan işlemler
sırasında** çalışır. Dört özellik vardır:

### 2.1 Denty / Simanty Asistanı (`denty-brain`)
- **Ne gönderilir:** (a) sistem bağlamı — oturum açan kullanıcının **adı**,
  kullanıcı tipi/rolü, bulunduğu ekran ve açık sipariş kimliği; (b) sohbet
  geçmişiniz; (c) **yetkiniz dâhilinde** okuduğunuz kayıtların sonuçları —
  siparişler (hasta adı ile aranır), faturalar, ödemeler, klinik/hekim kayıtları,
  bildirimler, aşamalar ve (yönetici iseniz) çalışan/gider kayıtları.
- **Sınırlar:** Araçlar **sizin oturumunuzla** ve satır-düzeyi güvenlik (RLS) +
  izinlerinizle sınırlı çalışır; yetkiniz olmayan veriyi asistan da göremez.
- **Yazma işlemleri onaya tabidir:** Sipariş oluşturma/düzenleme, destek talebi,
  mesaj gönderme gibi veri **yazan** işlemler yalnızca siz bir **onay kartını**
  onayladıktan sonra uygulanır.
- **Kota:** Kullanıcı başına günlük istek sınırı uygulanır.

### 2.2 İş Emri Okuma (`parse-work-order`)
- **Ne gönderilir:** El yazısı laboratuvar iş emrinin **tam fotoğrafı/PDF’i**
  (base64) — üzerindeki **hasta adı**, hekim adı, tarihler, diş şeması, renk dâhil.
- **Amaç:** Belgeyi yapılandırılmış sipariş verisine çevirmek.

### 2.3 Reçete / Fotoğraf / Fiş / Fatura Okuma (`parse-invoice`, `parse-receipt`)
- **Ne gönderilir:** Yüklediğiniz belgenin tam görüntüsü — tedarikçi/ödeyen adı,
  vergi no, banka bilgileri, tutarlar (fişte ödeyen adı olabilir).
- **Amaç:** Alanları otomatik çıkarmak (satın alma faturası / ödeme kaydı).

### 2.4 Sipariş Oluşturma/Düzenleme (asistan üzerinden)
- **Ne gönderilir:** Girdiğiniz hasta ve sipariş bilgileri (ad, TC/pasaport,
  doğum tarihi, cinsiyet, uyruk, diş/iş bilgileri).
- **Uygulama:** Yalnızca sizin onayınızla.

## 3. Cihaz-Üstü Kalan Analizler (AI sağlayıcısına GİTMEZ)

Şeffaflık için: aşağıdaki işlemler cihazınızda/tarayıcınızda çalışır ve Anthropic’e
gönderilmez — yalnızca sayısal özet asistan bağlamına eklenebilir:
- **Kapanış (oklüzyon) analizi** ve **tarama kalite teşhisi** — 3B geometri yerelde
  işlenir.
- **Yüz/ağız-içi tarama yakalama** (ar-scanner) — dosyalar depolamaya yüklenir,
  AI’ya gönderilmez.

> **Ses girişi uyarısı:** Web’de sesli komut (Web Speech API) kullanıldığında,
> tarayıcı (ör. Chrome) sesi kendi konuşma tanıma sunucularına (Google)
> gönderebilir. Bu, Anthropic’e aktarım değildir; ancak üçüncü-taraf bir aktarımdır
> ve dikte edilen metin hasta adı içerebilir. Bu özelliğe ilişkin bilgilendirme
> ayrıca yapılır (R-14 kapsamında iyileştirme planlanmıştır).

## 4. Rıza, Anonimleştirme ve Haklar

- **Rıza:** Yapay zekâ ile işleme **açık rızaya** tabidir; rıza kayıt altına
  alınır (`user_consents`, `ai_processing`) ve dilediğinizde geri çekebilirsiniz.
  Rıza verilmez/geri çekilirse yapay zekâ özellikleri sizin için devre dışı
  bırakılabilir.
- **Anonimleştirme:** Şu aşamada gönderilen içerikte otomatik maskeleme
  yapılmamaktadır; ilgili iyileştirme (kimliksizleştirme ve gönderim kayıtları)
  yol haritasındadır (bkz. `17-dogrulama-matrisi.md`, R-09).
- **Eğitimde kullanım:** Anthropic, ticari koşulları uyarınca API girdilerini
  model eğitiminde kullanmaz (nihai teyit için Anthropic sözleşmesi esastır).
- **Saklama:** Anthropic tarafındaki saklama, sağlayıcının sözleşmesine tabidir.

## 5. Sorumluluk

Yapay zekâ çıktıları hatalı olabilir. **Klinik ve ticari kararların
doğruluğundan kullanıcı sorumludur**; yapay zekâ yalnızca yardımcı bir araçtır.

---

**Sürüm 1.0 · Yürürlük: 23 Temmuz 2026** · Ayrıca bkz. `18-subprocessor-listesi.md`.
