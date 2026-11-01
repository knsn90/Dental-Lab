// modules/orders/lib/orderSearch.ts — Siparişler ekranının yerel araması (saf; node --test ile sınanır).
// Klinik adı da aranır (2. dalga 1); Türkçe harf katlaması parametre (node testinde uzantısız
// göreli import çözülmüyor; ekran foldTR verir).
type OrderLike = {
  order_number?: string | null;
  patient_name?: string | null;
  work_type?: string | null;
  doctor?: { full_name?: string | null; clinic?: { name?: string | null } | null } | null;
};

export function matchesOrderSearch(o: OrderLike, q: string, fold: (s: string) => string): boolean {
  const needle = fold((q ?? '').trim());
  if (!needle) return true;
  return [o.order_number, o.patient_name, o.work_type, o.doctor?.full_name, o.doctor?.clinic?.name]
    .some((v) => !!v && fold(v).includes(needle));
}
