// node --test my-expo-app/modules/scans/scanModel.test.mts   (.mts → tsc kapsamı dışında)
// Tarama randevularının saf zamanlama modeli: lab-yerel saat, ayarlar, çakışma ve yol uyarıları.
// Kurallar spec 4.4 (docs/superpowers/specs/2026-10-28-tarama-randevulari-design.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  labLocalParts, labLocalToIso, parseScanSettings, overlaps, apptWarnings, warningText, canMarkDone,
  estimateMinutes, slotOfDay, addrHash, suggestSlots, clinicAddressLine, WINDOWS, makeTravelFn, travelKey,
  addDays, weekDates, hhmm, parseHHMM, toBlocks, monthGrid, addMonths,
  type ApptBlock, type TravelFn, type SuggestInput,
} from './scanModel.ts';
import { formatAddressWith } from '../../core/util/formatAddressCore.ts';

const S = parseScanSettings(null);
const id = (x: string) => x;

// LAB → her klinik 20, A↔B 30, aynı klinik 0 (tahmini değil)
const travel: TravelFn = (from, to) => {
  if (from === to) return { minutes: 0, estimated: false };
  if (from === 'LAB' || to === 'LAB') return { minutes: 20, estimated: false };
  return { minutes: 30, estimated: false };
};
const blk = (p: Partial<ApptBlock> & { id: string }): ApptBlock => ({
  clinicId: 'A', technicianId: 'T1', equipmentIds: [], startMin: 600, minutes: 90, status: 'planlandi', ...p,
});
const A600 = blk({ id: 'a', clinicId: 'A', startMin: 600, minutes: 90, equipmentIds: ['E1'] });

test('labLocalParts: İstanbul sabah 09:00, çarşamba', () => {
  assert.deepEqual(labLocalParts('2026-10-28T06:00:00Z', 'Europe/Istanbul'), { date: '2026-10-28', weekday: 3, minutes: 540 });
});

test('labLocalParts: Berlin yaz saati bittiği gün 22:30, pazar', () => {
  assert.deepEqual(labLocalParts('2026-10-25T21:30:00Z', 'Europe/Berlin'), { date: '2026-10-25', weekday: 7, minutes: 1350 });
});

test('labLocalToIso: dilim farkı yaz saatine göre (UTC+1 ve UTC+2)', () => {
  assert.equal(labLocalToIso('2026-10-25', 1410, 'Europe/Berlin'), '2026-10-25T22:30:00.000Z');
  assert.equal(labLocalToIso('2026-10-24', 600, 'Europe/Berlin'), '2026-10-24T08:00:00.000Z');
});

test('parseScanSettings: NULL satırda varsayılanlar, saat metni dakikaya çevrilir', () => {
  assert.deepEqual(S, { hoursStart: 540, hoursEnd: 1200, workdays: [1, 2, 3, 4, 5, 6], defaultMinutes: 90, bufferMinutes: 10 });
  assert.equal(parseScanSettings({ scan_hours_start: '08:30:00' }).hoursStart, 510);
});

test('overlaps: uç uca değmek çakışma değildir', () => {
  assert.equal(overlaps({ startMin: 600, minutes: 90 }, { startMin: 690, minutes: 30 }), false);
  assert.equal(overlaps({ startMin: 600, minutes: 90 }, { startMin: 680, minutes: 30 }), true);
});

test('apptWarnings: önceki randevudan yola yetişilemez → late_from_prev', () => {
  const w = apptWarnings(blk({ id: 'x', clinicId: 'B', startMin: 700, minutes: 90 }), [A600], travel, S, 3);
  assert.deepEqual(w, [{ kind: 'late_from_prev', otherId: 'a', needMin: 40, haveMin: 10, estimated: false }]);
});

test('apptWarnings: aynı klinikte arka arkaya → uyarı yok', () => {
  assert.deepEqual(apptWarnings(blk({ id: 'x', clinicId: 'A', startMin: 690, minutes: 60 }), [A600], travel, S, 3), []);
});

test('apptWarnings: yeterli boşluk → uyarı yok (40 ≤ 50)', () => {
  assert.deepEqual(apptWarnings(blk({ id: 'x', clinicId: 'B', startMin: 740, minutes: 60 }), [A600], travel, S, 3), []);
});

test('apptWarnings: aynı teknisyen çakışırsa yalnız tech_overlap', () => {
  assert.deepEqual(apptWarnings(blk({ id: 'x', clinicId: 'A', startMin: 650, minutes: 60 }), [A600], travel, S, 3),
    [{ kind: 'tech_overlap', otherId: 'a' }]);
});

test('apptWarnings: başka teknisyen ama aynı cihaz → yalnız device_overlap', () => {
  const c = blk({ id: 'x', technicianId: 'T2', clinicId: 'A', startMin: 650, minutes: 60, equipmentIds: ['E1'] });
  assert.deepEqual(apptWarnings(c, [A600], travel, S, 3), [{ kind: 'device_overlap', otherId: 'a' }]);
});

test('apptWarnings: günün ilki lab yoluna yetişmez → yalnız late_from_lab', () => {
  const w = apptWarnings(blk({ id: 'x', clinicId: 'A', startMin: 545, minutes: 45 }), [A600], travel, S, 3);
  assert.deepEqual(w, [{ kind: 'late_from_lab', needMin: 30, haveMin: 5, estimated: false }]);
});

test('apptWarnings: tarama saatleri ve günleri dışı → outside_hours', () => {
  assert.deepEqual(apptWarnings(blk({ id: 'x', clinicId: 'A', startMin: 1170, minutes: 60 }), [A600], travel, S, 3),
    [{ kind: 'outside_hours' }]);
  assert.deepEqual(apptWarnings(blk({ id: 'x', clinicId: 'A', startMin: 900, minutes: 60 }), [], travel, S, 7),
    [{ kind: 'outside_hours' }]);
});

test('apptWarnings: yol bilinmiyorsa bir kez no_location', () => {
  const none: TravelFn = (f, t) => (f === t ? { minutes: 0, estimated: false } : null);
  const w = apptWarnings(blk({ id: 'x', clinicId: 'B', startMin: 700, minutes: 90 }),
    [A600, blk({ id: 'c', clinicId: 'C', startMin: 900, minutes: 60 })], none, S, 3);
  assert.deepEqual(w, [{ kind: 'no_location' }]);
});

test('apptWarnings: iptal edilmiş çakışan randevu sayılmaz, kendisi de sayılmaz', () => {
  const iptal = blk({ id: 'z', clinicId: 'A', startMin: 650, minutes: 60, status: 'iptal' });
  assert.deepEqual(apptWarnings(blk({ id: 'x', clinicId: 'A', startMin: 650, minutes: 60 }), [iptal], travel, S, 3), []);
  assert.deepEqual(apptWarnings(A600, [A600], travel, S, 3), []);
});

test('warningText: parçalar çevrilir, tahmini eki', () => {
  assert.equal(warningText({ kind: 'late_from_prev', needMin: 35, haveMin: 20, estimated: true }, id),
    'Önceki randevudan yola 35 dk gerekiyor, 20 dk açık · tahmini');
  assert.equal(warningText({ kind: 'late_from_lab', needMin: 30, haveMin: 5, estimated: false }, id),
    "Lab'dan yola 30 dk gerekiyor, 5 dk açık");
  assert.equal(warningText({ kind: 'tech_overlap' }, id), 'Teknisyenin bu saatte başka randevusu var');
  assert.equal(warningText({ kind: 'no_location' }, id), 'Klinik konumu bilinmiyor, yol süresi hesaplanmadı');
});

test('canMarkDone: hasta yok / tek harf / geçerli', () => {
  assert.equal(canMarkDone([]), 'Tarama yapıldı demek için en az bir hasta ekleyin');
  assert.equal(canMarkDone([{ patient_name: ' A ' }]), 'Her hastanın adını yazın');
  assert.equal(canMarkDone([{ patient_name: 'Ay' }]), null);
});

// ── Task 4: öneri, yol tahmini, adres ──

test('estimateMinutes: aynı nokta en az 10 dk; ~8,4 km → 24 dk', () => {
  assert.equal(estimateMinutes({ lat: 41, lng: 29 }, { lat: 41, lng: 29 }), 10);
  assert.equal(estimateMinutes({ lat: 41, lng: 29 }, { lat: 41, lng: 29.1 }), 24);
});

test('slotOfDay: önbellek dilimleri', () => {
  assert.equal(slotOfDay(500), 'sabah');
  assert.equal(slotOfDay(800), 'ogle');
  assert.equal(slotOfDay(1300), 'aksam');
});

test('addrHash: boşluk ve büyük harf farkı aynı özeti verir', () => {
  assert.equal(addrHash('  Ataşehir  İstanbul '), addrHash('ataşehir istanbul'));
  assert.notEqual(addrHash('ataşehir istanbul'), addrHash('kadıköy istanbul'));
});

const base = (p: Partial<SuggestInput> = {}): SuggestInput => ({
  clinicId: 'A', minutes: 90, weekday: 3, window: null, requiredKinds: [], technicians: [{ id: 'T1' }],
  devices: [], dayAppts: [], travel, settings: S, ...p,
});

test('suggestSlots: boş gün → lab yolu + yol payıyla 570den itibaren beş öneri', () => {
  const r = suggestSlots(base());
  assert.deepEqual(r.map((x) => x.startMin), [570, 585, 600, 615, 630]);
  assert.deepEqual(r.map((x) => x.idleMin), [0, 15, 30, 45, 60]);
  assert.equal(r[0].technicianId, 'T1');
});

test('suggestSlots: aynı klinikte randevunun hemen arkası önerilir', () => {
  const r = suggestSlots(base({ dayAppts: [A600] }));
  assert.equal(r[0].startMin, 690);
  assert.equal(r[0].idleMin, 0);
  assert.ok(r.every((x) => x.startMin >= 690));
});

test('suggestSlots: başka klinik → yol + payı sonrası ilk 15 dk adımı (735)', () => {
  const r = suggestSlots(base({ clinicId: 'B', dayAppts: [A600] }));
  assert.ok(!r.some((x) => x.startMin === 690 || x.startMin === 705 || x.startMin === 720));
  assert.equal(r[0].startMin, 735);
  assert.equal(r[0].idleMin, 5);
});

test('suggestSlots: tercih aralığı (akşam) öne geçer', () => {
  const r = suggestSlots(base({ window: [...WINDOWS.aksam] as [number, number] }));
  assert.equal(r[0].inWindow, true);
  assert.ok(r[0].startMin >= 900);
});

test('suggestSlots: eşit boşlukta daha az randevulu teknisyen seçilir', () => {
  const late = blk({ id: 'n', clinicId: 'A', technicianId: 'T1', startMin: 1110, minutes: 90 });
  const r = suggestSlots(base({ technicians: [{ id: 'T1' }, { id: 'T2' }], dayAppts: [late], window: [1020, 1035] }));
  const at = r.find((x) => x.startMin === 1020);
  assert.ok(at);
  assert.equal(at!.technicianId, 'T2');
  assert.equal(r.filter((x) => x.startMin === 1020).length, 1);
});

test('suggestSlots: dolu tek cihaz o aralıkta önerilmez; tanımsız türde cihazsız öneri', () => {
  const busy = blk({ id: 'p', technicianId: 'T9', clinicId: 'A', startMin: 600, minutes: 90, equipmentIds: ['E2'] });
  const r = suggestSlots(base({ requiredKinds: ['photogrammetry'], devices: [{ id: 'E2', kind: 'photogrammetry' }], dayAppts: [busy], limit: 40 }));
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => !overlaps(x, { startMin: 600, minutes: 90 })));
  assert.ok(r.every((x) => x.equipmentIds[0] === 'E2'));
  const r2 = suggestSlots(base({ requiredKinds: ['photogrammetry'], devices: [] }));
  assert.ok(r2.length > 0 && r2.every((x) => x.equipmentIds.length === 0));
});

test('suggestSlots: tarama günü değilse boş', () => {
  assert.deepEqual(suggestSlots(base({ weekday: 7 })), []);
});

test('clinicAddressLine: JSON adres tek satıra, boşsa null', () => {
  const fmt = (raw: string) => formatAddressWith(raw, (c) => c);
  const line = clinicAddressLine('{"il":"İstanbul","ilce":"Ataşehir"}', fmt);
  assert.ok(line && line.includes('Ataşehir'));
  assert.equal(clinicAddressLine('   ', fmt), null);
  assert.equal(clinicAddressLine(null, fmt), null);
});

// ── Task 5: yol fonksiyonu çekirdeği (Google sonuçları + tahmin yedeği) ──

test('makeTravelFn: aynı nokta 0; koordinatı olmayan çift null; tahmin yedeği', () => {
  const fn = makeTravelFn({ LAB: { lat: 41, lng: 29 }, A: { lat: 41, lng: 29 }, B: null }, {});
  assert.deepEqual(fn('A', 'A', 600), { minutes: 0, estimated: false });
  assert.equal(fn('LAB', 'B', 600), null);
  assert.equal(fn('A', 'B', 600), null);
  assert.deepEqual(fn('LAB', 'A', 600), { minutes: 10, estimated: true });
});

test('makeTravelFn: Google sonucu gün dilimine göre önce gelir', () => {
  const fn = makeTravelFn({ LAB: { lat: 41, lng: 29 }, A: { lat: 41, lng: 29.1 } }, { [travelKey('LAB', 'A', 'sabah')]: 25 });
  assert.deepEqual(fn('LAB', 'A', 600), { minutes: 25, estimated: false });
  assert.deepEqual(fn('LAB', 'A', 1000), { minutes: 24, estimated: true });
});

// ── Task 11: ekran yardımcıları ──

test('addDays / weekDates: ay ve yıl sınırı, hafta pazartesiden', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.deepEqual(weekDates('2026-10-28'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(weekDates('2026-11-01')[0], '2026-10-26');
});

test('hhmm / parseHHMM: gidiş-dönüş, geçersiz → null', () => {
  assert.equal(hhmm(555), '09:15');
  assert.equal(parseHHMM('9:05'), 545);
  assert.equal(parseHHMM('16.30'), 990);
  assert.equal(parseHHMM('25:00'), null);
  assert.equal(parseHHMM('abc'), null);
});

test('toBlocks: satırlar lab-yerel bloklara; iptal ve başka gün dışarıda', () => {
  const rows = [
    { id: 'a', clinic_id: 'A', technician_id: 'T1', starts_at: '2026-10-28T10:30:00Z', duration_min: 60, status: 'planlandi', services: [{ equipment_id: 'E1' }, { equipment_id: null }] },
    { id: 'b', clinic_id: 'B', technician_id: 'T1', starts_at: '2026-10-29T10:30:00Z', duration_min: 60, status: 'planlandi', services: [] },
  ];
  const b = toBlocks(rows as any, '2026-10-28', 'Europe/Istanbul');
  assert.deepEqual(b, [{ id: 'a', clinicId: 'A', technicianId: 'T1', equipmentIds: ['E1'], startMin: 810, minutes: 60, status: 'planlandi' }]);
});

// ── Aylık takvim (kullanıcı isteği: varsayılan ay görünümü) ──

test('monthGrid: 6 hafta × 7 gün, pazartesiden; ayın dışı işaretli', () => {
  const g = monthGrid('2026-10-15');
  assert.equal(g.length, 42);
  assert.deepEqual(g[0], { date: '2026-09-28', inMonth: false });
  assert.deepEqual(g[3], { date: '2026-10-01', inMonth: true });
  assert.deepEqual(g[41], { date: '2026-11-08', inMonth: false });
  assert.equal(g.filter((d) => d.inMonth).length, 31);
});

test('monthGrid: ayın 1i pazartesiyse ilk hücre o gün', () => {
  assert.deepEqual(monthGrid('2026-06-10')[0], { date: '2026-06-01', inMonth: true });
});

test('addMonths: yıl sınırı ve ayın 1ine sabitlenir', () => {
  assert.equal(addMonths('2026-12-20', 1), '2027-01-01');
  assert.equal(addMonths('2026-01-31', -1), '2025-12-01');
});
