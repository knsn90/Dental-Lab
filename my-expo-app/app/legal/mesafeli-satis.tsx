import React from 'react';
import { LegalShell, H, P, LI } from '../../core/legal/LegalShell';
import { COMPANY } from '../../core/legal/companyInfo';

export default function MesafeliSatis() {
  return (
    <LegalShell title="Mesafeli Satış Sözleşmesi" updated="2026">
      <H>1. Taraflar</H>
      <P>
        İşbu sözleşme, aşağıda bilgileri yer alan SATICI ile hizmeti sipariş eden
        ALICI arasında, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
        Sözleşmeler Yönetmeliği hükümlerine uygun olarak elektronik ortamda kurulmuştur.
      </P>
      <H>SATICI</H>
      <P>
        Ünvan: {COMPANY.legalName}{'\n'}
        Adres: {COMPANY.address}{'\n'}
        VKN: {COMPANY.vkn}{COMPANY.mersis ? `\nMERSİS: ${COMPANY.mersis}` : ''}{'\n'}
        E-posta: {COMPANY.email}{COMPANY.phone ? `\nTelefon: ${COMPANY.phone}` : ''}
      </P>
      <P>
        ALICI: Hizmeti sipariş eden diş hekimi / klinik / kurum (sipariş sırasında
        beyan edilen ünvan, adres ve iletişim bilgileri esas alınır).
      </P>

      <H>2. Sözleşmenin Konusu</H>
      <P>
        İşbu sözleşmenin konusu, ALICI'nın {COMPANY.brand} platformu ({COMPANY.website})
        üzerinden elektronik ortamda sipariş verdiği, nitelik ve satış bedeli aşağıda
        belirtilen diş laboratuvarı ürün/hizmetlerinin üretimi, satışı ve teslimidir.
      </P>

      <H>3. Ürün / Hizmet ve Bedel</H>
      <P>
        Sipariş edilen ürün/hizmetin türü (ör. zirkonyum kron, laminate veneer, implant
        üstü protez), adedi/diş sayısı ve birim bedeli sipariş ekranında ve düzenlenen
        faturada gösterilir. Fiyatlara KDV dahildir. Ürünler hastaya/vakaya özel
        üretilir (kişiye özel ısmarlama).
      </P>

      <H>4. Ödeme</H>
      <LI>Ödemeler, kliniğe düzenlenen fatura üzerinden alınır.</LI>
      <LI>Online kredi/banka kartı ödemeleri iyzico güvenli ödeme altyapısı ile 256-bit SSL üzerinden tahsil edilir; kart bilgileri SATICI tarafından saklanmaz.</LI>
      <LI>Visa ve Mastercard kartları kabul edilir.</LI>

      <H>5. Teslimat</H>
      <P>
        Üretimi tamamlanan iş, anlaşılan yöntemle (kurye/elden) ALICI'ya teslim edilir.
        Teslim süresi işin türüne ve karmaşıklığına göre değişir; ayrıntılar Teslimat ve
        İade Şartları sayfasında yer alır.
      </P>

      <H>6. Cayma Hakkı ve İstisnalar</H>
      <P>
        Mesafeli Sözleşmeler Yönetmeliği md. 15 uyarınca, ALICI'nın istekleri veya kişisel
        ihtiyaçları doğrultusunda hazırlanan, hastaya/vakaya özel üretilen (ısmarlama)
        ürünlerde cayma hakkı bulunmamaktadır. Diş protezleri kişiye özel üretildiğinden
        bu istisna kapsamındadır.
      </P>
      <P>
        Bununla birlikte, ayıplı (hatalı/eksik) üretim, yanlış ürün veya uygunsuzluk
        durumlarında ALICI'nın yasal hakları saklıdır; düzeltme/yeniden yapım (revizyon)
        ve garanti koşulları Teslimat ve İade Şartları'nda düzenlenmiştir.
      </P>

      <H>7. Uyuşmazlıkların Çözümü</H>
      <P>
        İşbu sözleşmeden doğabilecek uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen
        parasal sınırlar dâhilinde Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri
        yetkilidir. Taraflar arası ticari ilişkilerde genel hükümler uygulanır.
      </P>

      <H>8. Yürürlük</H>
      <P>
        ALICI, siparişi elektronik ortamda onayladığında işbu sözleşmenin tüm koşullarını
        kabul etmiş sayılır.
      </P>
    </LegalShell>
  );
}
