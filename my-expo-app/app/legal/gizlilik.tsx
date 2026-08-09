import React from 'react';
import { LegalShell, H, P, LI } from '../../core/legal/LegalShell';
import { COMPANY } from '../../core/legal/companyInfo';

export default function Gizlilik() {
  return (
    <LegalShell title="Gizlilik Sözleşmesi ve KVKK Aydınlatma Metni" updated="2026">
      <H>1. Veri Sorumlusu</H>
      <P>
        Bu Gizlilik Sözleşmesi, {COMPANY.brand} platformu ({COMPANY.website}) bakımından
        geçerlidir. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri
        sorumlusu: {COMPANY.legalName}, {COMPANY.address}. Başvuru/iletişim: {COMPANY.email}.
      </P>

      <H>2. İşlenen Kişisel Veriler</H>
      <LI>Kullanıcı hesap bilgileri (ad-soyad, e-posta, telefon, rol)</LI>
      <LI>Klinik/hekim ve iş emri bilgileri (sipariş içeriği, ölçü/tarama dosyaları)</LI>
      <LI>Hastaya ait sınırlı üretim bilgileri (vaka referansı, diş numarası, renk)</LI>
      <LI>Fatura/ödeme kayıtları (ödeme kartı bilgileri saklanmaz; iyzico tarafından işlenir)</LI>
      <LI>Kullanım/işlem kayıtları (log) ve teknik veriler</LI>

      <H>3. İşleme Amaçları</H>
      <LI>Laboratuvar iş emirlerinin üretimi, takibi ve teslimi</LI>
      <LI>Fatura düzenleme, tahsilat ve cari hesap yönetimi</LI>
      <LI>Yasal yükümlülüklerin yerine getirilmesi ve güvenliğin sağlanması</LI>

      <H>4. Ödeme Güvenliği</H>
      <P>
        Online ödemeler iyzico güvenli ödeme altyapısı üzerinden 256-bit SSL ile alınır.
        Kart bilgileriniz {COMPANY.brand} sunucularında tutulmaz; ilgili PCI-DSS uyumlu
        ödeme kuruluşu tarafından işlenir.
      </P>

      <H>5. Aktarım</H>
      <P>
        Kişisel veriler; hizmetin yürütülmesi için altyapı sağlayıcıları (bulut barındırma,
        ödeme kuruluşu, kurye) ve yasal olarak yetkili kurumlarla, yalnızca gerekli ölçüde
        ve mevzuata uygun olarak paylaşılabilir.
      </P>

      <H>6. Saklama ve Güvenlik</H>
      <P>
        Veriler, işleme amacının gerektirdiği ve mevzuatın öngördüğü süre boyunca saklanır.
        Erişim yetkilendirme (satır düzeyi güvenlik), şifreleme ve loglama gibi teknik ve
        idari tedbirlerle korunur.
      </P>

      <H>7. Haklarınız (KVKK md. 11)</H>
      <P>
        Kişisel verilerinize erişme, düzeltilmesini/silinmesini isteme, işlemeye itiraz etme
        ve kanunda sayılan diğer haklarınızı {COMPANY.email} adresine başvurarak
        kullanabilirsiniz. Uygulama içi hesabınızdan veri talebi ve hesap silme seçenekleri
        de sunulmaktadır.
      </P>

      <H>8. İletişim</H>
      <P>{COMPANY.legalName} · {COMPANY.email}{COMPANY.phone ? ` · ${COMPANY.phone}` : ''}</P>
    </LegalShell>
  );
}
