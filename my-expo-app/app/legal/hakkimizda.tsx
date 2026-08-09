import React from 'react';
import { LegalShell, H, P, LI } from '../../core/legal/LegalShell';
import { COMPANY } from '../../core/legal/companyInfo';

export default function Hakkimizda() {
  return (
    <LegalShell title="Hakkımızda">
      <P>
        {COMPANY.legalName}, dijital diş laboratuvarı hizmetleri sunan bir kuruluştur.
        Diş hekimleri ve kliniklerden gelen protez/restorasyon iş emirlerini dijital iş
        akışıyla (CAD/CAM tasarım, frezeleme, 3D baskı, sinterleme, porselen ve bitirme
        aşamaları) üretir ve teslim eder.
      </P>
      <P>
        {COMPANY.brand}, laboratuvarın iş emirlerini, üretim aşamalarını, kurye/teslimat
        süreçlerini ve klinik cari/fatura işlemlerini uçtan uca yönettiği bulut tabanlı
        laboratuvar yönetim platformudur ({COMPANY.website}).
      </P>

      <H>Sunduğumuz Hizmetler</H>
      <LI>Sabit protez (zirkonyum, metal destekli kron, köprü)</LI>
      <LI>Estetik uygulamalar (E-max / laminate veneer, cam seramik)</LI>
      <LI>İmplant üstü protez çözümleri</LI>
      <LI>Hareketli protez (tam/parsiyel)</LI>
      <LI>Geçici protez ve model/plak üretimi</LI>

      <H>Çalışma Modeli</H>
      <P>
        Klinikler iş emirlerini dijital olarak iletir; laboratuvar üretimi tamamlayıp
        teslim eder. Hizmet bedelleri, kliniğe kesilen fatura üzerinden tahsil edilir.
        Online ödemeler iyzico güvenli ödeme altyapısı ile alınır.
      </P>

      <H>İletişim</H>
      <P>
        {COMPANY.legalName}{'\n'}
        Adres: {COMPANY.address}{'\n'}
        E-posta: {COMPANY.email}
        {COMPANY.phone ? `\nTelefon: ${COMPANY.phone}` : ''}
      </P>
    </LegalShell>
  );
}
