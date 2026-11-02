/**
 * Tek tanımlı rakamların açıklama balonu metinleri (GlassTooltip). Spec §3:
 * "her değişen rakamın açıklaması var". Türkçe kaynak; çağrı yerinde
 * `autoT(METRIC_HINTS.x)` ile çevrilir (karşılıkları auto.{en,de,fa}.json'da).
 */
export const METRIC_HINTS = {
  overdue: 'Teslim tarihi bugünden önce olan, henüz teslim edilmemiş işler. İptal, arşiv ve beklemedekiler sayılmaz.',
  active: 'Teslim edilmemiş işler. İptal ve arşiv hariç, beklemedekiler dahil.',
  onHold: 'Beklemeye alınmış, teslim edilmemiş işler. Prova beklemesi sayılmaz; gecikme sayacı beklerken durur.',
  urgent: 'Teslim edilmemiş acil işler. İptal ve arşiv hariç.',
  dueToday: 'Teslim tarihi bugün olan, henüz teslim edilmemiş işler.',
  newToday: 'Bugün açılan siparişler. İptal, revizyon ve devam siparişleri hariç.',
  newThisMonth: 'Bu ay açılan siparişler. İptal, revizyon ve devam siparişleri hariç.',
  deliveredToday: 'Bugün gerçekten teslim edilen siparişler.',
  revenue: 'Dönemde kesilen faturaların toplamı (KDV dahil). Taslak ve iptal hariç, fatura tarihine göre, döviz döviz.',
  collections: 'Dönemde gerçekten yatan para, ödeme gününe göre. Faturaya dağıtılmamış avans dahil.',
  receivable: 'Kliniklerin kesilmiş faturalardan kalan borcu, avans düşülmüş. Taslak ve iptal hariç.',
  overdueReceivable: 'Vadesi geçmiş borç, kliniğin avansı düşülmüş. Hatırlatma bu tutara göre gider.',
  drafts: 'Henüz kesilmemiş taslak faturalar. Ciroya ve alacağa girmez.',
  activeStaff: 'Ekip ekranındaki aktif personel kayıtları.',
} as const;
