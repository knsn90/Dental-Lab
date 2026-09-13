# SIMAN — KVKK Aydınlatma Metni

**6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) m.10 uyarınca**
**Sürüm:** 2.0 · **Yürürlük:** 23 Temmuz 2026

> Bu metin, KVKK m.10 “Veri Sorumlusunun Aydınlatma Yükümlülüğü” çerçevesinde,
> Uygulama’nın gerçekte yaptığı işlemler esas alınarak hazırlanmıştır. İçerik
> SIMAN kaynak kodu ve 01–10 raporlarına dayanır.

---

## 1. Veri Sorumlusunun Kimliği

- **Veri sorumlusu:** NEXADENT LABORATUVAR HİZMETLERİ SANAYİ TİCARET LİMİTED ŞİRKETİ
- **Adres:** Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2, Ataşehir/İstanbul
- **MERSİS / VKN:** ⟦HUKUK: MERSIS⟧ / 6312098145
- **KVKK başvuru:** nexadentlab@gmail.com · **KEP:** ⟦HUKUK: KEP⟧
- **İrtibat kişisi:** ⟦HUKUK: IRTIBAT_KISISI⟧
- **VERBİS:** ⟦HUKUK: VERBIS⟧

SIMAN çok-kiracılı bir hizmet olduğundan, hastalara ait iş emri verileri
bakımından **veriyi giren laboratuvar/klinik/hekim veri sorumlusu**, SIMAN ise
**veri işleyen** konumundadır (bkz. `14-veri-isleme-sozlesmesi.md`).

---

## 2. İşlenen Kişisel Veri Kategorileri

| Veri kategorisi | Örnek veriler |
|---|---|
| Kimlik | Ad-soyad, T.C. kimlik no, doğum tarihi, cinsiyet, uyruk, diploma no |
| İletişim | E-posta, telefon, WhatsApp no, adres, şehir |
| Müşteri işlem | Sipariş/iş emri kayıtları, prova, teslimat, mesajlar |
| **Özel nitelikli (sağlık)** | Hasta adı ve doğum tarihi, diş/tedavi bilgileri, 3D tarama, DICOM, klinik fotoğraf, kalite-kontrol notları |
| Finans | Fatura, cari, ödeme, IBAN/banka (tedarikçi/kasa) |
| Özlük (personel) | Maaş, SGK, avans, izin (hastalık dâhil), mesai ve konum, İK belgeleri |
| İşlem güvenliği | IP, cihaz/tarayıcı bilgisi, oturum kayıtları, push jetonu |

---

## 3. İşleme Amaçları

- Hizmetin sunulması: sipariş, üretim takibi, kalite kontrol, teslimat
- Fatura ve cari hesap yönetimi, yasal e-Fatura
- Bildirim gönderimi (uygulama-içi, push, e-posta, WhatsApp, SMS)
- Yapay zekâ destekli asistan ve belge okuma (kullanıcı başlatır — bkz. §)
- Personel özlük, bordro, mesai ve — kullanıldığında — konum takibi
- Kullanıcı desteği ve talep çözümü
- Bilgi güvenliği, denetim ve yasal yükümlülüklerin yerine getirilmesi

---

## 4. İşlemenin Hukuki Sebepleri (KVKK m.5–6)

| Hukuki sebep | Uygulandığı işlemler |
|---|---|
| Sözleşmenin kurulması/ifası (m.5/2-c) | Hesap, sipariş, üretim, teslimat |
| Hukuki yükümlülük (m.5/2-ç) | Fatura, mali kayıt, bordro, SGK |
| Meşru menfaat (m.5/2-f) | Bildirim, bilgi güvenliği, denetim, performans |
| **Açık rıza (m.5/1, m.6/2)** | **Sağlık verileri, yapay zekâ işlemesi, WhatsApp/SMS, yurt dışı aktarım** |

Özel nitelikli veriler ve yurt dışı aktarım için açık rızanız alınır, sürümüyle
birlikte kaydedilir ve dilediğinizde geri çekebilirsiniz.

---

## 5. Kişisel Verilerin Aktarımı ve Yurt Dışına Aktarım

Kişisel verileriniz, hizmetin sunulması ve yasal yükümlülüklerin yerine
getirilmesi amacıyla, amaçla sınırlı olarak aşağıdaki **alıcı gruplarına** (veri
işleyen sıfatıyla) aktarılabilir:

| Aktarılan Taraf | Aktarım Amacı |
|---|---|
| Bulut Altyapı Sağlayıcıları *(yurt dışı)* | Platform barındırma, veritabanı, dosya depolama, yedekleme, web/CDN |
| Yapay Zekâ Servis Sağlayıcıları *(yurt dışı)* | Kullanıcı başlattığında asistan yanıtı ve belge/fiş/iş-emri okuma |
| e-Fatura Entegratörleri | GİB/EDM entegrasyonu kapsamında yasal fatura iletimi |
| Ödeme Kuruluşları | PCI-DSS uyumlu güvenli ödeme işlemleri (kart verisi tarafımıza iletilmez) |
| E-posta / SMS / Anlık Bildirim Sağlayıcıları *(kısmen yurt dışı)* | Bildirim, iletişim ve tek kullanımlık kod (OTP) gönderimi |
| Kurye / Lojistik Sağlayıcıları | Numune ve iş teslimatı |
| Entegrasyon İş Ortakları (ağız-içi tarayıcı vb.) *(yurt dışı)* | Tarama dosyalarının ve ilgili kayıtların aktarımı |
| Yetkili Kamu Kurum ve Kuruluşları | Yasal yükümlülük ve resmî talep (KVKK m.8) |
| Hukuk Danışmanları / Denetçiler | Hukuki süreçler ve bağımsız denetim |

**Yurt dışı** etiketli gruplara aktarım **KVKK m.9 kapsamında açık rızanıza**
dayanır; yasal yükümlülük gereği GİB gibi yetkili kurumlara aktarım m.8
kapsamındadır. Bu gruplardaki güncel hizmet sağlayıcıların isim bazlı ayrıntılı
listesi `18-subisleyenler-listesi.md` / Alt-İşleyen Listesi’nde yer alır.

---

## 6. Saklama Süreleri ve İmha

| Veri | Saklama süresi |
|---|---|
| Fatura, ödeme, mali kayıtlar | Yasal süre boyunca (VUK/TTK — Türk mevzuatında 10 yıl) |
| Bordro, SGK, özlük kayıtları | İlgili iş/sosyal güvenlik mevzuatının öngördüğü süre |
| İş emri ve üretim içeriği (sağlık dâhil) | Hizmet ilişkisi + ilgili laboratuvarın belirlediği saklama süresi |
| Oturum / işlem güvenliği kayıtları | Bilgi güvenliği amacıyla makul süre |
| Tek kullanımlık kodlar (OTP) | Kısa süreli (dakikalar) |

Saklama süresi dolan veriler silinir, yok edilir veya anonim hale getirilir.
Hesabınızı Uygulama içinden **Profil → Hesabımı Sil** ile kapatabilirsiniz;
hesap silindiğinde profil, giriş ve iletişim bilgileriniz silinir. Ancak sipariş,
fatura ve finans kayıtları ile bunlara bağlı üretim içerikleri, yasal saklama
yükümlülükleri ve — çoğu durumda bu verilerin veri sorumlusu olan — ilgili
laboratuvarın hakları gereği kimliksizleştirilerek veya ilgili laboratuvarın
sorumluluğunda saklanmaya devam edebilir. Bir hastanın verisinin silinmesi talebi
öncelikle verinin sorumlusu olan laboratuvara/kliniğe yöneltilmeli; SIMAN bu
talebi işleyen sıfatıyla destekler.

> **⟦HUKUK⟧** Yukarıdaki süreler yasal asgarilere dayanır; oturum/güvenlik
> kayıtları ve iş emri içeriği için kesin süreler saklama politikasıyla (retention
> worker — R-05) netleştirilmeli ve hukukça teyit edilmelidir.

---

## 7. Kişisel Veri Toplamanın Yöntemi

Kişisel veriler; kayıt formları, Uygulama içi veri girişi, dosya/foto yükleme,
ağız-içi tarayıcı entegrasyonu (Medit webhook’u), gelen kâğıt iş emri kanalı ve
Uygulama’nın otomatik ürettiği kayıtlar (oturum, IP, log) yoluyla **elektronik
ortamda** toplanır.

---

## 8. İlgili Kişinin Hakları (KVKK m.11)

Aşağıdaki haklara sahipsiniz:

a) Kişisel verinizin işlenip işlenmediğini öğrenme,
b) İşlenmişse buna ilişkin bilgi talep etme,
c) İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,
ç) Yurt içinde/dışında aktarıldığı üçüncü kişileri bilme,
d) Eksik/yanlış işlenmişse düzeltilmesini isteme,
e) KVKK m.7 şartlarında silinmesini/yok edilmesini isteme,
f) (d) ve (e) kapsamındaki işlemlerin aktarıldığı üçüncü kişilere bildirilmesini
isteme,
g) Otomatik sistemlerle analiz sonucu aleyhinize bir sonucun ortaya çıkmasına
itiraz etme,
ğ) Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini
talep etme.

**Başvuru yöntemi:** Uygulama içinden **Profil → KVKK / Verilerim** ekranı veya
nexadentlab@gmail.com / ⟦HUKUK: KEP⟧. Başvurular **30 gün** içinde
sonuçlandırılır. Kişisel Verileri Koruma Kurulu’na şikâyet hakkınız saklıdır.

---

## 8. Otomatik Karar ve Profil Oluşturma

Uygulama, teknisyen/hekim performans puanı, güven puanı ve prim hesaplaması gibi
otomatik değerlendirmeler üretebilir. Bu değerlendirmeler bordro/prim süreçlerinde
kullanıldığında, ilgili kararlar **insan gözden geçirmesine** tabidir; sonuçlara
itiraz etme (m.11/g) hakkınız saklıdır.

---

**Sürüm 2.0 · Yürürlük: 23 Temmuz 2026**
