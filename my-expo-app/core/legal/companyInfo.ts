// core/legal/companyInfo.ts
// Yasal/iyzico public sayfalarında kullanılan SATICI (veri sorumlusu) bilgileri.
// Kaynak: legal/documents (kullanıcı-onaylı NexaDent bilgileri). Eksik alanları
// (telefon, MERSİS, KEP) NexaDent verince doldur.
export const COMPANY = {
  brand:      'Siman',
  legalName:  'NEXADENT LABORATUVAR HİZMETLERİ SANAYİ TİCARET LİMİTED ŞİRKETİ',
  address:    'Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2, Ataşehir / İstanbul',
  vkn:        '6312098145',           // Vergi Kimlik No
  email:      'nexadentlab@gmail.com',
  phone:      '0216 606 66 11',
  mersis:     '0631209814500001',
  website:    'https://siman.app',
} as const;
