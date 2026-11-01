// core/util/formatAddress.ts
// Adresler bazı kayıtlarda JSON string olarak tutuluyor:
//   {"ulke":"TR","il":"İstanbul","ilce":"Ataşehir","mahalle":"Atatürk","sokak":"...","bina_no":"B Blok","daire_no":"3","posta_kodu":"34758"}
// Ekranda ham basılınca kullanıcıya küme parantezli/tırnaklı çöp görünüyor.
//
// Bu fonksiyon JSON ise okunabilir tek satıra çevirir, düz metinse aynen döner,
// bozuk JSON'da ham değeri döndürür (asla çökmez). Yurt dışı adreste (ulke ≠ TR)
// ülke adı etkin dilde sona eklenir. Biçimleme çekirdeği: formatAddressCore.ts (testli).
//
// Not: aynı mantığın kopyaları modules/invoices ve modules/clinics içinde de var;
// çıktı biçimi onlarla birebir aynı tutuldu. İleride onlar da buraya bağlanabilir.
import i18n from 'i18next';
import { countryName } from '../data/countries';
import { formatAddressWith } from './formatAddressCore';

export function formatAddress(raw: string | null | undefined, lang?: string | null): string {
  return formatAddressWith(raw, (code) => countryName(code, lang ?? i18n.language));
}
