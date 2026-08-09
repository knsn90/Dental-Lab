import React from 'react';
import { LegalShell, H, P, LI } from '../../core/legal/LegalShell';
import { COMPANY } from '../../core/legal/companyInfo';

export default function TeslimatIade() {
  return (
    <LegalShell title="Teslimat ve İade Şartları" updated="2026">
      <H>Teslimat</H>
      <LI>Üretimi tamamlanan işler, anlaşılan yöntemle (kurye veya elden teslim) ALICI'ya (klinik/hekim) ulaştırılır.</LI>
      <LI>Teslim süresi işin türüne ve karmaşıklığına göre değişir. Tahmini teslim tarihi sipariş ekranında belirtilir ve platform üzerinden takip edilebilir.</LI>
      <LI>Kurye/kargo bedeli, aksi belirtilmedikçe SATICI tarafından karşılanır veya faturada ayrıca gösterilir.</LI>
      <LI>Teslimat sırasında pakette görünür hasar varsa ALICI'nın tutanak tutması ve derhal SATICI'ya bildirmesi gerekir.</LI>

      <H>İade, Değişim ve Cayma Hakkı</H>
      <P>
        Diş protezleri hastaya/vakaya özel (ısmarlama) üretildiğinden, Mesafeli Sözleşmeler
        Yönetmeliği md. 15 gereği bu ürünlerde cayma/iade hakkı bulunmamaktadır. Ürünler
        başka bir hasta için kullanılamayacağından standart iade kapsamı dışındadır.
      </P>

      <H>Ayıplı Ürün, Revizyon ve Garanti</H>
      <P>
        Kişiye özel üretim niteliğine rağmen, ALICI'nın yasal hakları saklıdır. Aşağıdaki
        durumlarda ürün ücretsiz olarak düzeltilir veya yeniden üretilir:
      </P>
      <LI>Üretim/işçilik hatası (uyum, renk, form, ölçü uyumsuzluğu)</LI>
      <LI>Sipariş edilenden farklı veya eksik ürün gönderimi</LI>
      <LI>Teknik şartnameye/gönderilen dijital ölçüye uygunsuzluk</LI>
      <P>
        Bu tür talepler, iş teslim alındıktan sonra makul süre içinde platform üzerinden
        "revizyon/değişiklik talebi" olarak iletilir. SATICI, talebi inceleyip uygun
        bulduğunda düzeltme veya yeniden yapım sürecini başlatır. Klinik/hekim kaynaklı
        (yanlış ölçü, hatalı bilgi vb.) durumlar bu kapsam dışında değerlendirilebilir.
      </P>

      <H>Ücret İadesi</H>
      <P>
        Henüz üretime alınmamış ve iptal edilen siparişlerde ya da mükerrer/hatalı tahsilat
        durumlarında, ödeme aynı ödeme yöntemine (kredi/banka kartı) iade edilir. Kart
        iadeleri, bankanıza bağlı olarak genellikle birkaç iş günü içinde hesabınıza yansır.
      </P>

      <H>İletişim</H>
      <P>
        Teslimat ve iade konularındaki talepleriniz için: {COMPANY.email}
        {COMPANY.phone ? ` · ${COMPANY.phone}` : ''}
      </P>
    </LegalShell>
  );
}
