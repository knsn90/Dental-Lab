// node --test my-expo-app/modules/orders/prova/provaModel.test.mts   (.mts → tsc kapsamı dışında)
// Prova popup'ı, hero düğmesi, liste rozeti ve sihirbaz uyarısının saf modeli.
// Veri order_prova_snapshot / order_prova_flags RPC'lerinden gelir (20261027162000).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeProva, nowCard, heroLabel, flagFromSnapshot, riskChip, listBadge, apptLine,
  takmaBeforeDelivery, matchesProvaFilter, fmtShortDay,
  type ProvaSnapshot, type ProvaRow, type ProvaFlag,
} from './provaModel.ts';

const TODAY = '2026-10-29';
const prova = (p: Partial<ProvaRow>): ProvaRow => ({ id: 'p' + (p.number ?? 1), number: 1, status: 'planlandı', late_days: 0, ...p });
const snap = (p: Partial<ProvaSnapshot> = {}): ProvaSnapshot => ({
  viewer: 'lab', can_manage: true, can_propose: false, today: TODAY, delivery_date: '2026-11-08',
  risk: null, provas: [], appointments: [], counter_paused: false, ...p,
});
const flag = (p: Partial<ProvaFlag>): ProvaFlag => ({
  work_order_id: 'o1', prova_state: null, prova_days: null, prova_late_days: 0, risk_level: null, effective_delivery: null, ...p,
});
const CLINIC = prova({ number: 2, type: 'bisküvi', status: 'gönderildi', sent_date: '2026-10-27', return_by: '2026-10-30', days_at_clinic: 2 });

test('kısa gün: hafta günü + gün + ay', () => {
  assert.equal(fmtShortDay('2026-10-30', 'tr'), 'Cum 30 Eki');
});

test('activeProva önce kliniktekini seçer', () => {
  const s = snap({ provas: [prova({ number: 1, status: 'döndü', sent_date: '2026-10-20', return_date: '2026-10-22' }), CLINIC] });
  assert.equal(activeProva(s)?.number, 2);
  assert.equal(activeProva(snap({ provas: [prova({ number: 3 }), prova({ number: 1, status: 'döndü' })] }))?.number, 3);
  assert.equal(activeProva(snap()), null);
});

test('nowCard klinikte (lab)', () => {
  const c = nowCard(snap({ provas: [CLINIC], counter_paused: true }));
  assert.equal(c.tone, 'clinic');
  assert.equal(c.big, 'Klinikte');
  assert.equal(c.days, '2. gün');
  assert.ok(c.lines[0].text.startsWith('Dönüş için son gün'));
  assert.ok(c.lines.some((l) => l.icon === 'pause'));
  assert.equal(c.primary?.action, 'return');
  assert.equal(c.secondary?.purpose, 'prova_donus');
});

test('nowCard gecikti', () => {
  const c = nowCard(snap({ today: '2026-10-31', provas: [{ ...CLINIC, late_days: 1, days_at_clinic: 5 }] }));
  assert.equal(c.tone, 'late');
  assert.equal(c.big, '1 gün');
  assert.equal(c.days, 'gecikti');
  assert.equal(c.primary?.action, 'return');
});

test('nowCard hekim: lab satırları yok, ana iş "geri gönderdim"', () => {
  const c = nowCard(snap({ viewer: 'client', can_manage: false, can_propose: true, counter_paused: undefined, provas: [CLINIC] }));
  assert.ok(!c.lines.some((l) => l.icon === 'pause'));
  assert.equal(c.secondary, null);
  assert.equal(c.primary?.action, 'clientReturned');
  assert.equal(c.primary?.label, 'Provayı geri gönderdim');
});

test('nowCard lab onayı bekliyor', () => {
  const p = { ...CLINIC, status: 'onay_bekliyor' as const, client_returned_at: '2026-10-29T08:00:00Z' };
  const lab = nowCard(snap({ provas: [p] }));
  assert.equal(lab.tone, 'pending');
  assert.equal(lab.primary?.action, 'confirm');
  assert.equal(lab.primary?.label, 'Teslim aldım');
  const cl = nowCard(snap({ viewer: 'client', can_manage: false, can_propose: true, provas: [p] }));
  assert.equal(cl.primary, null);
  assert.ok(cl.lines.some((l) => l.text === 'Lab onayı bekliyor'));
});

test('nowCard boş: lab "Prova gönder", hekim düğmesiz', () => {
  assert.equal(nowCard(snap()).tone, 'empty');
  assert.equal(nowCard(snap()).primary?.action, 'createSend');
  assert.equal(nowCard(snap({ viewer: 'client', can_manage: false, can_propose: true })).primary, null);
});

test('nowCard döndü: not düğmesi, bugün', () => {
  const c = nowCard(snap({ provas: [prova({ status: 'döndü', sent_date: '2026-10-27', return_date: TODAY, days_at_clinic: 2 })] }));
  assert.equal(c.tone, 'done');
  assert.equal(c.big, 'Döndü');
  assert.equal(c.days, 'bugün');
  assert.equal(c.primary?.action, 'note');
});

test('heroLabel', () => {
  assert.deepEqual(heroLabel(null), { text: 'Prova', dot: 'none' });
  assert.deepEqual(heroLabel(flag({ prova_state: 'klinikte', prova_days: 2 })), { text: 'Prova · Klinikte 2. gün', dot: 'amber' });
  assert.deepEqual(heroLabel(flag({ prova_state: 'klinikte', prova_days: 4, prova_late_days: 1 })), { text: 'Prova · 1 gün gecikti', dot: 'red' });
  assert.deepEqual(heroLabel(flag({ prova_state: 'döndü' })), { text: 'Prova · Döndü', dot: 'green' });
  assert.equal(heroLabel(flag({ risk_level: 'yetismiyor' })).dot, 'red');
});

test('flagFromSnapshot', () => {
  const f = flagFromSnapshot(snap({ provas: [CLINIC], risk: { level: 'yetismiyor', takma_date: '2026-11-13', effective_delivery: '2026-11-13', projected: true } }));
  assert.equal(f?.prova_state, 'klinikte');
  assert.equal(f?.risk_level, 'yetismiyor');
  assert.equal(f?.prova_days, 2);
  assert.equal(flagFromSnapshot(snap()), null);
});

test('riskChip tahmini teslimle', () => {
  assert.deepEqual(riskChip({ level: 'yetismiyor', takma_date: '2026-11-13', effective_delivery: '2026-11-13', projected: true }),
    { label: 'Randevuya yetişmiyor · tahmini 13 Kas', tone: 'bad' });
  assert.deepEqual(riskChip({ level: 'yetisir', takma_date: '2026-11-13', effective_delivery: '2026-11-08', projected: false }),
    { label: 'Yetişir', tone: 'ok' });
  assert.equal(riskChip(null), null);
});

test('listBadge öncelik: gecikme > risk > provada', () => {
  assert.equal(listBadge(flag({ prova_state: 'klinikte', prova_days: 4, prova_late_days: 1, risk_level: 'yetismiyor' }))?.label, 'Prova 1 gün gecikti');
  assert.equal(listBadge(flag({ prova_state: 'klinikte', prova_days: 2, risk_level: 'yetismiyor' }))?.label, 'Randevuya yetişmiyor');
  assert.deepEqual(listBadge(flag({ prova_state: 'klinikte', prova_days: 2 })), { label: 'Provada · 2. gün', tone: 'warn' });
  assert.equal(listBadge(flag({ risk_level: 'yetisir' })), null);
});

test('apptLine onaylı ve önerilen', () => {
  const a = apptLine({ id: 'a', kind: 'takma', appt_date: '2026-11-13', appt_time: '14:30:00', pending_action: 'degistir',
    pending_date: '2026-11-16', pending_time: null, pending_by_name: null, review_note: null, reviewed_at: null, removed: false });
  assert.equal(a.title, 'Takma');
  assert.equal(a.when, 'Cum 13 Kas · 14:30');
  assert.equal(a.pending, 'önerilen Pzt 16 Kas · onay bekliyor');
});

test('takmaBeforeDelivery', () => {
  assert.equal(takmaBeforeDelivery('2026-11-13', [{ kind: 'takma', date: '2026-11-13' }]), true);
  assert.equal(takmaBeforeDelivery('2026-11-13', [{ kind: 'takma', date: '2026-11-14' }]), false);
  assert.equal(takmaBeforeDelivery('2026-11-13', [{ kind: 'prova', date: '2026-11-01' }]), false);
  assert.equal(takmaBeforeDelivery(null, [{ kind: 'takma', date: '2026-11-14' }]), false);
});

test('matchesProvaFilter', () => {
  assert.equal(matchesProvaFilter(flag({ prova_state: 'onay_bekliyor' }), 'prova'), true);
  assert.equal(matchesProvaFilter(flag({ prova_state: 'döndü' }), 'prova'), false);
  assert.equal(matchesProvaFilter(flag({ risk_level: 'yetisir' }), 'risk'), false);
  assert.equal(matchesProvaFilter(flag({ risk_level: 'yaklasiyor' }), 'risk'), true);
  assert.equal(matchesProvaFilter(undefined, 'prova'), false);
});
