/**
 * Kullanıcılar ekranı detay paneli — rol bazlı iş istatistiği (TEK KAYNAK).
 *
 * Sayılar sunucuda `get_user_work_stats(p_user_id)` ile hesaplanır
 * (migration 20261111094000). Eskiden panel work_orders'ta OLMAYAN `created_by`
 * sütununu sorguluyor, hata yutuluyor ve herkes 0 görünüyordu.
 *
 * Bu dosya saf: ham RPC yanıtını normalize eder ve role göre panelde hangi
 * dört metriğin, hangi liste başlığının görüneceğini söyler. Her iki ekran
 * (LabUsersManagement + app/(admin)/users.tsx) bunu kullanır.
 */

export type WorkStatsKind = 'doctor' | 'clinic' | 'technician' | 'courier' | 'lab';

export interface WorkStatsItem {
  id: string | null;
  orderNumber: string;
  label: string;
  overdue: boolean;
}

export interface UserWorkStats {
  kind: WorkStatsKind;
  total: number;
  active: number;
  overdue: number;
  doneMonth: number;
  queued: number;
  cancelled: number;
  items: WorkStatsItem[];
}

export type MetricTone = 'accent' | 'danger' | 'muted' | 'plain';
export type MetricIconName = 'flask-outline' | 'chart-line' | 'alert-outline' | 'progress-clock';

export interface WorkStatsMetric {
  key: string;
  label: string;
  value: number;
  icon: MetricIconName;
  tone: MetricTone;
}

export interface WorkStatsView {
  metrics: WorkStatsMetric[];
  listTitle: string;
  emptyText: string;
}

const KINDS: WorkStatsKind[] = ['doctor', 'clinic', 'technician', 'courier', 'lab'];
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Ham RPC yanıtını güvenli tipe çevirir; bozuk/eksik alanlar 0 / boş olur. */
export function parseUserWorkStats(raw: unknown): UserWorkStats {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const kind = KINDS.includes(r.kind) ? (r.kind as WorkStatsKind) : 'lab';
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    kind,
    total: num(r.total),
    active: num(r.active),
    overdue: num(r.overdue),
    doneMonth: num(r.done_month),
    queued: num(r.queued),
    cancelled: num(r.cancelled),
    items: items.map((it: any) => ({
      id: typeof it?.id === 'string' ? it.id : null,
      orderNumber: it?.order_number ? String(it.order_number) : '—',
      label: it?.label ? String(it.label) : '',
      overdue: it?.overdue === true,
    })),
  };
}

/** Role göre panel içeriği. Etiketler düz Türkçe — ekranda otomatik sözlükten çevrilir. */
export function workStatsView(s: UserWorkStats): WorkStatsView {
  if (s.kind === 'technician') {
    return {
      metrics: [
        { key: 'active', label: 'Elindeki', value: s.active, icon: 'progress-clock', tone: 'accent' },
        { key: 'queued', label: 'Sırada', value: s.queued, icon: 'flask-outline', tone: 'muted' },
        { key: 'doneMonth', label: 'Bu Ay Tamamlanan', value: s.doneMonth, icon: 'chart-line', tone: 'plain' },
        { key: 'total', label: 'Toplam Tamamlanan', value: s.total, icon: 'flask-outline', tone: 'plain' },
      ],
      listTitle: 'ELİNDEKİ İŞLER',
      emptyText: 'Elinde iş yok',
    };
  }
  if (s.kind === 'courier') {
    return {
      metrics: [
        { key: 'active', label: 'Aktif Teslimat', value: s.active, icon: 'progress-clock', tone: 'accent' },
        { key: 'doneMonth', label: 'Bu Ay Teslim', value: s.doneMonth, icon: 'chart-line', tone: 'plain' },
        { key: 'total', label: 'Toplam Teslim', value: s.total, icon: 'flask-outline', tone: 'plain' },
        { key: 'cancelled', label: 'İptal / İade', value: s.cancelled, icon: 'alert-outline', tone: 'danger' },
      ],
      listTitle: 'AKTİF TESLİMATLAR',
      emptyText: 'Aktif teslimat yok',
    };
  }
  // doctor · clinic · lab (sipariş tabanlı)
  return {
    metrics: [
      { key: 'total', label: 'Toplam İş', value: s.total, icon: 'flask-outline', tone: 'plain' },
      { key: 'active', label: 'Aktif', value: s.active, icon: 'progress-clock', tone: 'accent' },
      { key: 'overdue', label: 'Geciken', value: s.overdue, icon: 'alert-outline', tone: 'danger' },
      { key: 'doneMonth', label: 'Bu Ay Teslim', value: s.doneMonth, icon: 'chart-line', tone: 'plain' },
    ],
    listTitle: 'AKTİF İŞLER',
    emptyText: 'Aktif iş yok',
  };
}

/** Auth hesabı olmayan personel satırı ("emp-<id>") — sunucuda profili yok, sorgulanmaz. */
export function isUnregisteredUserId(id: string): boolean {
  return id.startsWith('emp-');
}

/** Sunucu hatasını kullanıcıya gösterilecek kısa Türkçe metne çevirir. */
export function workStatsErrorText(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return '';
  if (err.code === '42501' || /US_SCOPE/.test(err.message ?? '')) return 'Bu kullanıcının istatistiğini görme yetkin yok';
  return 'İstatistik yüklenemedi';
}
