import { readFileSync, writeFileSync } from 'fs';

// index.html'in kanonik <style> bloğunu tek kaynak olarak kullan
const idx = readFileSync('index.html', 'utf8');
const style = idx.match(/<style>[\s\S]*?<\/style>/)[0];

const FOOTER = `<a href="./index.html">Gizlilik &amp; KVKK</a> · <a href="./terms.html">Kullanım Koşulları</a> · <a href="./cerez.html">Çerez Politikası</a> · <a href="./ai.html">Yapay Zekâ</a> · <a href="./subisleyenler.html">Alt-İşleyenler</a><br/>Sürüm 2.0 · © 2026 Siman.`;

function page(file, title, meta, body) {
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Siman</title>
<meta name="description" content="${title} — Siman diş laboratuvarı yönetim uygulaması." />
${style}
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">S</div>
    <div><div class="kicker">Siman</div><div class="meta">Diş Laboratuvarı Yönetim Uygulaması</div></div>
  </header>
  <h1>${title}</h1>
  <div class="meta">${meta}</div>
${body}
  <footer>${FOOTER}</footer>
</div>
</body>
</html>`;
  writeFileSync(file, html);
  console.log('yazıldı:', file);
}

const V = 'Sürüm 1.0 · Yürürlük: 23 Temmuz 2026';

// ── ÇEREZ ──
page('cerez.html', 'Çerez ve Yerel Depolama Politikası', V, `
  <p>Bu politika, Siman uygulaması (<code>siman.app</code>) ve hukuki doküman sitesi için geçerlidir.
  Siman’da <b>reklam veya izleme amaçlı çerez/teknoloji kullanılmaz.</b></p>
  <div class="note">Kod incelemesinde reklam/izleme/analitik yazılımı (Google Analytics, Firebase,
  Sentry, PostHog, Mixpanel, Amplitude, Segment vb.) <b>bulunmamaktadır.</b></div>
  <h2>1. Kullandığımız Teknolojiler</h2>
  <table>
    <tr><th>Teknoloji</th><th>Tür</th><th>Amaç</th><th>Süre</th></tr>
    <tr><td>Oturum depolaması</td><td>Zorunlu</td><td>Oturumunuzu açık tutmak (giriş jetonu)</td><td>Çıkışa kadar</td></tr>
    <tr><td>Uygulama tercihleri</td><td>İşlevsel</td><td>Dil, son panel, taslak, arayüz tercihleri</td><td>Temizlenene kadar</td></tr>
    <tr><td>Reklam/izleme çerezi</td><td>—</td><td><b>Kullanılmıyor</b></td><td>—</td></tr>
  </table>
  <p>Siman, oturum bilgisini klasik “çerez” yerine tarayıcı yerel depolaması (localStorage) veya mobil
  cihaz depolaması üzerinde tutar. Bunlar hizmetin çalışması için zorunlu/işlevsel niteliktedir.</p>
  <h2>2. Üçüncü Taraf İstekleri</h2>
  <p>Web’de yazı tipi (Google Fonts), e-postadaki QR görseli ve barındırma (Vercel) gibi hâllerde
  tarayıcınız üçüncü-taraf sunuculara istek yapabilir; bu istekler IP adresinizi taşıyabilir
  (çerez tabanlı izleme değildir).</p>
  <h2>3. Onay</h2>
  <p>Yalnızca zorunlu/işlevsel teknolojiler kullanıldığından ayrı bir çerez onay bandı hukuken zorunlu
  değildir. İleride analitik/pazarlama eklenirse bu politika güncellenir ve açık rıza temelli bir onay
  mekanizması eklenir.</p>
  <h2>4. Yönetim</h2>
  <p>Tarayıcı ayarlarınızdan yerel depolamayı temizleyebilir veya çıkış yapabilirsiniz; bu sizi oturumdan
  düşürür ve tercihlerinizi sıfırlar.</p>
`);

// ── YAPAY ZEKÂ ──
page('ai.html', 'Yapay Zekâ Veri İşleme Politikası', V, `
  <p>Bu metin, Siman’daki yapay zekâ özelliklerinin nasıl çalıştığını ve hangi verilerin işlendiğini
  açıklar. Tek sağlayıcı ve tek model ailesi kullanılır.</p>
  <h2>1. Model ve Sağlayıcı</h2>
  <div class="card"><p style="margin:0">
    <b>Sağlayıcı:</b> Anthropic (ABD) — <b>yurt dışı</b><br/>
    <b>Model:</b> Claude (claude-sonnet-4-5)<br/>
    <b>Anahtar güvenliği:</b> API anahtarı yalnızca sunucu tarafında tutulur; istemciye gönderilmez.
  </p></div>
  <p>Başka bir yapay zekâ sağlayıcısı kullanılmaz; model eğitimi yapılmaz.</p>
  <h2>2. Özellikler ve Gönderilen Veri</h2>
  <p>Yapay zekâ özellikleri <b>yalnızca kullanıcı tarafından başlatılan işlemlerde</b> çalışır:</p>
  <ul>
    <li><b>Denty asistanı</b> — sorduğunuz soru, ekran bağlamı ve yetkiniz dâhilindeki ilgili kayıtlar
    (sipariş, fatura, klinik, hasta adı vb.) yanıtı üretmek için gönderilir. Veri <b>yazan</b> işlemler
    yalnızca sizin onayınızla uygulanır.</li>
    <li><b>İş emri okuma</b> — el yazısı iş emri fotoğrafı/PDF’i (hasta adı dâhil) yapılandırılmış veriye
    çevrilmek üzere gönderilir.</li>
    <li><b>Reçete / fiş / fatura okuma</b> — yüklediğiniz belge görüntüsü alan çıkarımı için gönderilir.</li>
    <li><b>Sipariş oluşturma/düzenleme</b> — girdiğiniz hasta ve sipariş bilgileri, yalnızca onayınızla
    işlenir.</li>
  </ul>
  <div class="note">Kapanış (oklüzyon) analizi ve tarama kalite teşhisi cihazınızda/tarayıcınızda çalışır;
  yalnızca sayısal özet asistan bağlamına eklenebilir. Web’de sesli komut kullanıldığında tarayıcı, sesi
  kendi konuşma tanıma servisine gönderebilir (Anthropic’e değil).</div>
  <h2>3. Rıza ve Haklar</h2>
  <p>Yapay zekâ ile işleme <b>açık rızaya</b> tabidir; rıza kayıt altına alınır ve dilediğinizde geri
  çekebilirsiniz. Rıza verilmez/geri çekilirse yapay zekâ özellikleri sizin için devre dışı bırakılabilir.
  Anthropic, ticari koşulları uyarınca API girdilerini model eğitiminde kullanmaz.</p>
`);

// ── ALT-İŞLEYENLER ──
const rows = [
  ['Supabase','Barındırma, veritabanı, kimlik doğrulama, depolama','Evet'],
  ['Anthropic (Claude)','Yapay zekâ / belge okuma','Evet'],
  ['Resend','E-posta bildirimleri','Evet'],
  ['Expo (Apple/Google)','Mobil push bildirimi','Evet'],
  ['Twilio / WhatsApp (Meta)','WhatsApp bildirimi','Evet'],
  ['NetGSM · İleti Merkezi · Mutlucell','SMS','Hayır'],
  ['Nilvera (→ GİB)','Yasal e-Fatura','Hayır'],
  ['iyzico','Ödeme (kart verisi bize iletilmez)','Hayır'],
  ['BanaBiKurye','Kurye / teslimat','Hayır'],
  ['Google (Places, Fonts, Favicon)','Adres, yazı tipi, logo','Evet'],
  ['Brandfetch · Clearbit','Klinik logosu bulma','Evet'],
  ['QRServer','E-postada QR görseli','Evet'],
  ['Medit','Ağız-içi tarayıcı entegrasyonu','Evet'],
  ['Vercel','Web barındırma / CDN','Evet'],
].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('\n    ');
page('subisleyenler.html', 'Alt-İşleyen (Subprocessor) Listesi', V, `
  <p>Hizmeti sunmak için verileri, yalnızca gereken ölçüde aşağıdaki hizmet sağlayıcılarla paylaşırız.
  Yeni bir alt-işleyen eklenmeden önce ilgili veri sorumlusu bilgilendirilir.</p>
  <table>
    <tr><th>Alt-işleyen</th><th>İşlev</th><th>Yurt dışı</th></tr>
    ${rows}
  </table>
  <div class="note">Aşağıdaki hizmetler <b>kullanılmaz</b> (reklam/izleme yapılmadığının teyidi): Sentry,
  Firebase, Google Analytics, PostHog, Mixpanel, Amplitude, Segment, Stripe, OpenAI, Google Gemini ve
  reklam/atıf SDK’ları.</div>
`);
