/**
 * SGK & Vergi Hesaplama Motoru — 2025 H1
 * ─ Tüm oranlar ve parametreler buradan yönetilir.
 * ─ Her yıl başında bu değerleri güncelleyin.
 */

// ─── 2025 H1 Parametreleri ────────────────────────────────────────────────────
export const SGK_PARAMS = {
  // Asgari ücret
  asgariUcret:        26_005,    // TL/ay brüt (2025 H1)

  // SGK prim oranları
  sgkIsci:            0.14,      // %14 — işçi payı
  sgkIsveren:         0.205,     // %20.5 — işveren payı
  issizlikIsci:       0.01,      // %1 — işsizlik sigortası işçi
  issizlikIsveren:    0.02,      // %2 — işsizlik sigortası işveren

  // SGK tavan = asgari ücret × 7.5
  sgkTavanKatsayi:    7.5,

  // Damga vergisi
  damga:              0.00759,   // %0.759

  // Kıdem tazminatı tavanı (2025 H1)
  kidemTavani:        35_058.58, // TL

  // Gelir vergisi dilimleri (2025 yılı)
  gvDilimleri: [
    { ust:   110_000, oran: 0.15 },
    { ust:   230_000, oran: 0.20 },
    { ust:   580_000, oran: 0.27 },
    { ust: 3_000_000, oran: 0.35 },
    { ust: Infinity,  oran: 0.40 },
  ],
} as const;

// ─── Türleri ──────────────────────────────────────────────────────────────────
export interface NetHesap {
  brut:               number;
  sgkMatrah:          number;   // min(brut, SGK tavan)
  sgkIsci:            number;
  sgkIsveren:         number;
  issizlikIsci:       number;
  issizlikIsveren:    number;
  gvMatrah:           number;   // brut - sgkIsci - issizlikIsci
  gelirVergisi:       number;   // dilimli + asgari ücret istisnası
  damgaVergisi:       number;
  toplamIsciKesinti:  number;
  net:                number;
  toplamIsverenMaliyet: number; // brut + sgkIsveren + issizlikIsveren
}

export interface TazminatHesap {
  kidemYil:           number;
  kidemAy:            number;
  kidemGun:           number;
  kidemBrut:          number;   // vergi/SGK'dan muaf
  kidemNet:           number;   // = kidemBrut (kıdem vergiden muaf)
  ihbarHaftasi:       number;
  ihbarBrut:          number;
  ihbarSgkIsci:       number;
  ihbarGv:            number;
  ihbarNet:           number;
  toplam:             number;
}

export const CIKIS_KODLARI: { kod: string; aciklama: string }[] = [
  { kod: '01', aciklama: 'İstifa (çalışanın kendi isteği)' },
  { kod: '03', aciklama: 'İşverence haklı nedenle fesih (4857/25-II)' },
  { kod: '04', aciklama: 'Belirsiz süreli sözleşme — bildirimli fesih' },
  { kod: '09', aciklama: 'Emeklilik' },
  { kod: '10', aciklama: 'Malullük' },
  { kod: '11', aciklama: 'Ölüm' },
  { kod: '17', aciklama: 'Askerlik' },
  { kod: '28', aciklama: 'Kıdem tazinatlı fesih (4857/17)' },
  { kod: '29', aciklama: 'Kıdem + ihbar tazinatlı fesih' },
  { kod: '45', aciklama: 'Ücretsiz izin' },
  { kod: '46', aciklama: 'Deneme süresi sona erdi' },
];

// ─── Hesaplama Fonksiyonları ──────────────────────────────────────────────────

/**
 * Kümülatif gelir vergisi hesabı.
 * "Bu aya kadar birikmiş matrah" üzerine "bu ayın matrahı" eklenerek
 * artan oranlı vergi hesaplanır; önceki aylarda ödenen vergi çıkartılır.
 */
function hesaplaGvDilimli(matrah: number): number {
  const p = SGK_PARAMS;
  let kalan = matrah;
  let vergi = 0;
  let oncekiUst = 0;
  for (const dilim of p.gvDilimleri) {
    if (kalan <= 0) break;
    const dilimBuyuklugu = dilim.ust - oncekiUst;
    const vergilenecek = Math.min(kalan, dilimBuyuklugu);
    vergi += vergilenecek * dilim.oran;
    kalan -= vergilenecek;
    oncekiUst = dilim.ust;
  }
  return vergi;
}

/**
 * Asgari ücret üzerinden hesaplanan aylık vergi istisnası (AGE 2025 karşılığı)
 */
export function asgariUcretIstisnasi(): number {
  const p = SGK_PARAMS;
  const asgariGvMatrah = p.asgariUcret * (1 - p.sgkIsci - p.issizlikIsci);
  return hesaplaGvDilimli(asgariGvMatrah); // Aylık istisna
}

/**
 * Tam net maaş hesabı.
 * @param brut          Aylık brüt maaş (TL)
 * @param kumulatifOnceki Bu ay öncesi kümülatif GV matrahı (takvim yılı başından)
 */
export function hesaplaNet(brut: number, kumulatifOnceki = 0): NetHesap {
  const p = SGK_PARAMS;
  const sgkTavan = p.asgariUcret * p.sgkTavanKatsayi;

  const sgkMatrah = Math.min(brut, sgkTavan);

  const sgkIsci         = yuvarlaTL(sgkMatrah * p.sgkIsci);
  const sgkIsveren      = yuvarlaTL(sgkMatrah * p.sgkIsveren);
  const issizlikIsci    = yuvarlaTL(sgkMatrah * p.issizlikIsci);
  const issizlikIsveren = yuvarlaTL(sgkMatrah * p.issizlikIsveren);
  const damgaVergisi    = yuvarlaTL(brut      * p.damga);

  // Gelir vergisi matrahı
  const gvMatrah = brut - sgkIsci - issizlikIsci;

  // Kümülatif GV hesabı (önceki + bu ay)
  const gvSonra   = hesaplaGvDilimli(kumulatifOnceki + gvMatrah);
  const gvOnceki  = hesaplaGvDilimli(kumulatifOnceki);
  const buAyGv    = gvSonra - gvOnceki;

  // Asgari ücret istisnası düş
  const istisna   = asgariUcretIstisnasi();
  const gelirVergisi = yuvarlaTL(Math.max(0, buAyGv - istisna));

  const toplamIsciKesinti = sgkIsci + issizlikIsci + gelirVergisi + damgaVergisi;
  const net               = yuvarlaTL(brut - toplamIsciKesinti);

  return {
    brut,
    sgkMatrah,
    sgkIsci,
    sgkIsveren,
    issizlikIsci,
    issizlikIsveren,
    gvMatrah,
    gelirVergisi,
    damgaVergisi,
    toplamIsciKesinti,
    net,
    toplamIsverenMaliyet: yuvarlaTL(brut + sgkIsveren + issizlikIsveren),
  };
}

/**
 * Kıdem & İhbar tazminatı hesabı.
 * @param brutMaas    Çalışanın son brüt maaşı (TL)
 * @param baslamaTarihi YYYY-MM-DD
 * @param cikisTarihi   YYYY-MM-DD
 */
export function hesaplaTazminat(
  brutMaas: number,
  baslamaTarihi: string,
  cikisTarihi: string,
): TazminatHesap {
  const p = SGK_PARAMS;
  const start = new Date(baslamaTarihi + 'T00:00:00');
  const end   = new Date(cikisTarihi   + 'T00:00:00');

  // Toplam gün farkı
  const gunFarki = Math.max(0, Math.floor(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  ));

  const yil = Math.floor(gunFarki / 365);
  const kalanGun = gunFarki % 365;
  const ay  = Math.floor(kalanGun / 30);
  const gun = kalanGun % 30;

  // Kıdem tazminatı: tavan uygulanmış günlük maaş × çalışma gün sayısı
  const gunlukTavan = p.kidemTavani / 30;
  const gunlukBrut  = brutMaas / 30;
  const kidemGunluk = Math.min(gunlukBrut, gunlukTavan);
  const kidemBrut   = yuvarlaTL(kidemGunluk * gunFarki);
  // Kıdem tazminatı gelir vergisinden ve SGK'dan muaf
  const kidemNet    = kidemBrut;

  // İhbar süresi (hafta cinsinden)
  const toplamAy = yil * 12 + ay;
  const ihbarHaftasi =
    toplamAy < 6  ? 2 :
    toplamAy < 18 ? 4 :
    toplamAy < 36 ? 6 : 8;

  // İhbar tazminatı
  const ihbarGunluk = brutMaas / 30;
  const ihbarBrut   = yuvarlaTL(ihbarGunluk * ihbarHaftasi * 7);

  // İhbar tazminatına SGK ve GV uygulanır
  const ihbarSgkIsci  = yuvarlaTL(ihbarBrut * (p.sgkIsci + p.issizlikIsci));
  const ihbarGvMatrah = ihbarBrut - ihbarSgkIsci;
  const ihbarGv       = yuvarlaTL(hesaplaGvDilimli(ihbarGvMatrah) - asgariUcretIstisnasi());
  const ihbarNet      = yuvarlaTL(Math.max(0, ihbarBrut - ihbarSgkIsci - Math.max(0, ihbarGv)));

  return {
    kidemYil:     yil,
    kidemAy:      ay,
    kidemGun:     gun,
    kidemBrut,
    kidemNet,
    ihbarHaftasi,
    ihbarBrut,
    ihbarSgkIsci,
    ihbarGv:      Math.max(0, ihbarGv),
    ihbarNet,
    toplam:       yuvarlaTL(kidemNet + ihbarNet),
  };
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────
export function yuvarlaTL(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatTL(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

/** Dönem için prim gün sayısı (standart: 30) */
export function primGunSayisi(period: string, baslamaTarihi?: string, cikisTarihi?: string): number {
  const [y, m] = period.split('-').map(Number);
  const ilk = new Date(y, m - 1, 1);
  const son  = new Date(y, m, 0);

  let start = baslamaTarihi ? new Date(baslamaTarihi + 'T00:00:00') : ilk;
  let end   = cikisTarihi   ? new Date(cikisTarihi   + 'T00:00:00') : son;

  start = start < ilk ? ilk : start;
  end   = end   > son ? son  : end;

  if (end < start) return 0;
  return Math.min(30, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

/** CSV satırı oluştur */
export function sgkCsvExport(rows: {
  isim: string;
  tcNo: string;
  sgkNo: string;
  primGun: number;
  brut: number;
  net: NetHesap;
}[]): string {
  const header = [
    'Ad Soyad', 'TC Kimlik No', 'SGK Sicil No', 'Prim Gün',
    'Brüt Maaş', 'SGK Matrahı',
    'SGK İşçi (%14)', 'SGK İşveren (%20.5)',
    'İşsizlik İşçi (%1)', 'İşsizlik İşveren (%2)',
    'Gelir Vergisi', 'Damga Vergisi',
    'Toplam İşçi Kesinti', 'Net Maaş',
    'İşveren Toplam Maliyet',
  ].join(';');

  const lines = rows.map(r => [
    r.isim, r.tcNo ?? '', r.sgkNo ?? '', r.primGun,
    r.brut.toFixed(2), r.net.sgkMatrah.toFixed(2),
    r.net.sgkIsci.toFixed(2), r.net.sgkIsveren.toFixed(2),
    r.net.issizlikIsci.toFixed(2), r.net.issizlikIsveren.toFixed(2),
    r.net.gelirVergisi.toFixed(2), r.net.damgaVergisi.toFixed(2),
    r.net.toplamIsciKesinti.toFixed(2), r.net.net.toFixed(2),
    r.net.toplamIsverenMaliyet.toFixed(2),
  ].join(';'));

  return [header, ...lines].join('\n');
}
