/**
 * Kurye / kargo GÖNDERİ FİŞİ (A6) — saf yardımcılar.
 *
 * Fiş, o kurye hareketinin YÖNÜNÜ izler: laba gelen harekette (model alma,
 * prova dönüş) gönderen klinik, alıcı lab olur; dış servise gidişte alıcı o
 * servistir. Hasta bilgisi bu dosyaya hiç girmez.
 *
 * Hareket kaydındaki origin_* / destination_* alanlarını create_delivery
 * yazar: lab → klinikte destination_name HEKİM adıdır (klinik değil),
 * destination_address kliniğin adresi; dış serviste ikisi de servisin kendisi.
 * React/Supabase/i18n YOK; `shipLabel.test.mts` node ile çalıştırır.
 */

export interface ShipParty {
  name: string;
  /** Kişi — alıcı/gönderen klinikse hekim adı. */
  person?: string;
  address: string;
  phone: string;
}

export interface ShipLegInfo {
  direction?: string | null;
  destination_name?: string | null;
  destination_address?: string | null;
  destination_phone?: string | null;
  origin_name?: string | null;
  origin_address?: string | null;
}

export type ResolvedParty = Required<ShipParty> & { isLab: boolean };

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const first = (...vals: unknown[]) => vals.map(s).find(Boolean) ?? '';

function party(p: ShipParty, isLab: boolean): ResolvedParty {
  return { name: s(p.name), person: s(p.person), address: s(p.address), phone: s(p.phone), isLab };
}

export function resolveShipParties(p: { leg: ShipLegInfo; lab: ShipParty; clinic: ShipParty }): { from: ResolvedParty; to: ResolvedParty } {
  const { leg, lab, clinic } = p;
  const labP = party(lab, true);

  switch (leg.direction) {
    case 'lab_to_other':
      return {
        from: labP,
        to: party({ name: first(leg.destination_name), address: first(leg.destination_address), phone: first(leg.destination_phone) }, false),
      };
    case 'other_to_lab':
      return {
        from: party({ name: first(leg.origin_name), address: first(leg.origin_address), phone: '' }, false),
        to: { ...labP, address: first(labP.address, leg.destination_address), phone: first(labP.phone, leg.destination_phone) },
      };
    case 'clinic_to_lab':
      return {
        from: party({
          name: first(clinic.name, leg.origin_name),
          person: clinic.person,
          address: first(leg.origin_address, clinic.address),
          phone: clinic.phone,
        }, false),
        to: { ...labP, address: first(labP.address, leg.destination_address), phone: first(labP.phone, leg.destination_phone) },
      };
    default:
      // lab_to_clinic (ve yönü yazılmamış eski kayıtlar).
      // Adres: hareketteki (kurye oraya gitti; düzenlenmiş olabilir), yoksa kliniğin.
      // Telefon: kutudaki numara kliniğin; yoksa hareketteki (hekimin) numara.
      return {
        from: { ...labP, address: first(labP.address, leg.origin_address) },
        to: party({
          name: first(clinic.name, leg.destination_name),
          person: clinic.person,
          address: first(leg.destination_address, clinic.address),
          phone: first(clinic.phone, leg.destination_phone),
        }, false),
      };
  }
}

/** Siparişin final teslimatı mı (yoksa ara hareket mi)? Eski kayıtlarda amaç boş = teslimat. */
export function isFinalLeg(purpose: string | null | undefined): boolean {
  return !purpose || purpose === 'teslimat';
}

/**
 * Lab'ın açık adresi: fatura künyesinin parçaları (sokak, ilçe / il) —
 * `modules/settings/labBilling.ts → composeLabAddress` ile aynı biçim; yoksa
 * eski tek satırlık `labs.address`.
 */
export function labPartyAddress(lab: { street?: string | null; district?: string | null; city?: string | null; address?: string | null } | null | undefined): string {
  if (!lab) return '';
  const place = [s(lab.district), s(lab.city)].filter(Boolean).join(' / ');
  const composed = [s(lab.street), place].filter(Boolean).join(', ');
  return composed || s(lab.address);
}
