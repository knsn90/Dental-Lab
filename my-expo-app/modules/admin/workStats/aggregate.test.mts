// node --test modules/admin/workStats/aggregate.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countOrders, aggregateWorkStats, heatmapRows, ordersInCell, inRecord,
  UNKNOWN_CLINIC_ID, UNKNOWN_CLINIC_NAME,
  type AggInput, type RawOrder,
} from './aggregate.ts';
import { windowMonths } from './months.ts';
import {
  resolveUnitForWorkType, memberBucketOf, serviceUnitQty,
} from '../../../core/util/serviceUnits.ts';

// ── Fikstür ──────────────────────────────────────────────────────────────
// Klinik A (cA): hekim d1, d2. Klinik B (cB): hekim d3.
// Tarihler 'Z'siz → yerel saat; testler saat diliminden bağımsız.
const unitByServiceName = new Map<string, string | null>([
  ['zirkon', 'Üye'],
  ['gece plağı', 'Çene'],
  ['model baskısı', 'Adet'],
]);
const clinicByDoctor = new Map<string, string>([
  ['d1', 'cA'], ['d2', 'cA'], ['d3', 'cB'], ['dX', 'cZ'],   // cZ'nin adı yok → bilinmeyen
]);
const clinicName = new Map<string, string>([['cA', 'Klinik A'], ['cB', 'Klinik B']]);

let seq = 0;
function o(p: Partial<RawOrder> & { created_at: string | null }): RawOrder {
  seq += 1;
  return {
    id: p.id ?? `o${seq}`,
    order_number: p.order_number ?? `N-${seq}`,
    work_type: p.work_type === undefined ? 'Zirkon' : p.work_type,
    status: p.status ?? 'yeni',
    created_at: p.created_at,
    tooth_numbers: p.tooth_numbers === undefined ? [11] : p.tooth_numbers,
    doctor_id: p.doctor_id === undefined ? 'd1' : p.doctor_id,
  };
}

const ARCHES = [11, 12, 13, 21, 22, 23, 31, 32, 41, 42, 48];

const BASE: RawOrder[] = [
  // Kasım 2026: A → 3 üye Zirkon, 2 çene Gece Plağı, 1 adet Model Baskısı
  o({ id: 'n1', work_type: 'Zirkon', tooth_numbers: [11, 12, 13], doctor_id: 'd1', created_at: '2026-11-05T10:00:00' }),
  o({ id: 'n2', work_type: 'Gece Plağı', tooth_numbers: ARCHES, doctor_id: 'd1', created_at: '2026-11-06T10:00:00' }),
  o({ id: 'n3', work_type: 'Model Baskısı', tooth_numbers: [11], doctor_id: 'd2', created_at: '2026-11-07T10:00:00' }),
  o({ id: 'n4', work_type: 'Zirkon', status: 'iptal', tooth_numbers: [14, 15], created_at: '2026-11-08T10:00:00' }),
  o({ id: 'n5', work_type: 'Zirkon', tooth_numbers: [], created_at: '2026-11-09T10:00:00' }),
  // Ekim 2026: B → 5 üye Zirkon; A → 1 çene (yalnız üst)
  o({ id: 'e1', work_type: 'Zirkon', tooth_numbers: [11, 12, 13, 14, 15], doctor_id: 'd3', created_at: '2026-10-10T10:00:00' }),
  o({ id: 'e2', work_type: 'Gece Plağı', tooth_numbers: [11, 21], doctor_id: 'd2', created_at: '2026-10-11T10:00:00' }),
  // Ağustos 2026: B → 2 üye, tekrarlı etiket
  o({ id: 'a1', work_type: 'Zirkon, Zirkon', tooth_numbers: [21, 22], doctor_id: 'd3', created_at: '2026-08-03T10:00:00' }),
  // Haziran 2026: A → 1 üye
  o({ id: 'j1', work_type: 'Zirkon', tooth_numbers: [11], doctor_id: 'd1', created_at: '2026-06-15T10:00:00' }),
  // Mayıs 2026: kayıt dönemi (firstMonth) öncesi — yine de null görünmeli
  o({ id: 'm1', work_type: 'Zirkon', tooth_numbers: [11], doctor_id: 'd1', created_at: '2026-05-15T10:00:00' }),
];

// Bozuk satırlar (Kasım)
const BROKEN: RawOrder[] = [
  o({ id: 'b1', work_type: null, tooth_numbers: [11, 12], doctor_id: 'd1', created_at: '2026-11-12T10:00:00' }),
  o({ id: 'b2', work_type: 'Zirkon', tooth_numbers: [11], doctor_id: 'd1', created_at: 'x' }),
  o({ id: 'b3', work_type: 'Zirkon', tooth_numbers: [11], doctor_id: null, created_at: '2026-11-13T10:00:00' }),
  o({ id: 'b4', work_type: 'Zirkon', tooth_numbers: [11], doctor_id: 'dX', created_at: '2026-11-14T10:00:00' }),
];

function input(over: Partial<AggInput> = {}): AggInput {
  return {
    orders: BASE,
    clinicByDoctor,
    clinicName,
    unitByServiceName,
    firstMonth: '2026-06',
    selected: '2026-11',
    compare: 'prev',
    clinicId: null,
    chipWorkType: null,
    focusWorkType: null,
    ...over,
  };
}

const point = (s: ReturnType<typeof aggregateWorkStats>, m: string) => s.trend.find((p) => p.month === m)!;

// ── countOrders ──────────────────────────────────────────────────────────
test('countOrders: iptal ve dişsiz sayılmaz', () => {
  const c = countOrders({ orders: BASE, clinicByDoctor, unitByServiceName });
  const ids = c.map((x) => x.id);
  assert.ok(!ids.includes('n4'), 'iptal sayılmamalı');
  assert.ok(!ids.includes('n5'), 'dişsiz sayılmamalı');
  assert.equal(c.length, BASE.length - 2);
});

test('countOrders: kova ve miktar', () => {
  const c = countOrders({ orders: BASE, clinicByDoctor, unitByServiceName });
  const by = (id: string) => c.find((x) => x.id === id)!;
  assert.deepEqual([by('n1').bucket, by('n1').qty, by('n1').workType], ['uye', 3, 'Zirkon']);
  assert.deepEqual([by('n2').bucket, by('n2').qty, by('n2').workType], ['cene', 2, 'Gece Plağı']);
  assert.deepEqual([by('n3').bucket, by('n3').qty, by('n3').workType], ['adet', 1, 'Model Baskısı']);
  assert.equal(by('a1').workType, 'Zirkon');
  assert.equal(by('a1').qty, 2);
  assert.equal(by('n1').month, '2026-11');
  assert.equal(by('n1').clinicId, 'cA');
  assert.equal(by('e1').clinicId, 'cB');
  assert.equal(by('n1').orderNumber, 'N-1');
});

// ── aggregate ────────────────────────────────────────────────────────────
test('aggregate: bozuk satırlar', () => {
  const inp = input({ orders: [...BASE, ...BROKEN] });
  const c = countOrders(inp);
  const b1 = c.find((x) => x.id === 'b1')!;
  assert.ok(b1, 'work_type null sayılır');
  assert.equal(b1.workType, '—');
  assert.equal(b1.bucket, 'uye');
  assert.equal(b1.unit, null);
  assert.ok(!c.find((x) => x.id === 'b2'), "created_at 'x' atılır");
  assert.equal(c.find((x) => x.id === 'b3')!.clinicId, UNKNOWN_CLINIC_ID);
  assert.equal(c.find((x) => x.id === 'b4')!.clinicId, UNKNOWN_CLINIC_ID, 'adı olmayan klinik → bilinmeyen');

  const s = aggregateWorkStats(inp);
  // 3 (n1) + 2 (b1) + 1 (b3) + 1 (b4)
  assert.equal(s.selectedQty!.uye, 7);
  assert.ok(s.workTypes.some((w) => w.label === '—' && w.qty === 2));
  const unk = s.clinics.find((r) => r.id === UNKNOWN_CLINIC_ID)!;
  assert.equal(unk.name, UNKNOWN_CLINIC_NAME);
  assert.equal(unk.qty.uye, 2);

  // Bilinmeyen klinik süzgeci de çalışır
  const su = aggregateWorkStats({ ...inp, clinicId: UNKNOWN_CLINIC_ID });
  assert.deepEqual(su.selectedQty, { uye: 2, cene: 0, adet: 0 });
  assert.deepEqual(su.clinics.map((r) => r.id), [UNKNOWN_CLINIC_ID]);
});

test('aggregate: toplam yalnız üye', () => {
  const s = aggregateWorkStats(input());
  assert.deepEqual(s.selectedQty, { uye: 3, cene: 2, adet: 1 });
  assert.equal(point(s, '2026-11').value, 3);
  assert.equal(point(s, '2026-11').bucket, 'uye');
  assert.deepEqual(s.months, windowMonths('2026-11', 12));
  assert.equal(s.trend.length, 12);
});

test('aggregate: kayıt dönemi', () => {
  const s = aggregateWorkStats(input());
  for (const p of s.trend) {
    if (p.month <= '2026-05') assert.equal(p.value, null, `${p.month} kayıt öncesi null`);
    else assert.equal(typeof p.value, 'number', `${p.month} dönem içi sayı`);
  }
  assert.equal(point(s, '2026-07').value, 0);
  assert.equal(point(s, '2026-09').value, 0);

  const sb = aggregateWorkStats(input({ clinicId: 'cB' }));
  assert.equal(point(sb, '2026-07').value, 0, 'B Temmuz göndermedi → 0');
  assert.equal(point(sb, '2026-05').value, null);
  assert.equal(point(sb, '2026-10').value, 5);
  assert.deepEqual(sb.selectedQty, { uye: 0, cene: 0, adet: 0 });

  // Haz 1, Tem 0, Ağu 2, Eyl 0, Eki 5, Kas 3 → 11/6 = 1.83 → 1.8
  assert.equal(s.avg6Uye, 1.8);
  // firstMonth Eylül: Eyl 0, Eki 5, Kas 3 → 8/3 = 2.67 → 2.7
  const s9 = aggregateWorkStats(input({ firstMonth: '2026-09' }));
  assert.equal(s9.avg6Uye, 2.7);
  assert.equal(point(s9, '2026-08').value, null);
  assert.equal(point(s9, '2026-06').value, null);

  // Kayıt yok → null'lar
  const sn = aggregateWorkStats(input({ firstMonth: null }));
  assert.equal(sn.selectedQty, null);
  assert.equal(sn.avg6Uye, null);
  assert.ok(sn.trend.every((p) => p.value === null));

  assert.equal(inRecord('2026-06', '2026-06'), true);
  assert.equal(inRecord('2026-05', '2026-06'), false);
  assert.equal(inRecord('2026-06', null), false);
});

test('aggregate: geçen yıl yok', () => {
  const s = aggregateWorkStats(input({ compare: 'lastYear' }));
  assert.equal(s.compareQty, null);
  assert.ok(s.workTypes.length > 0);
  for (const w of s.workTypes) assert.equal(w.compare, null);
  for (const r of s.clinics) assert.equal(r.compare, null);
  for (const p of s.trend) assert.equal(p.lastYear, null);
});

test('aggregate: önceki ay farkı', () => {
  const s = aggregateWorkStats(input());
  const z = s.workTypes.find((w) => w.label === 'Zirkon')!;
  assert.equal(z.qty, 3);
  assert.equal(z.compare, 5);
  assert.equal(z.bucket, 'uye');
  assert.equal(z.unitLabel, 'üye');
  const g = s.workTypes.find((w) => w.label === 'Gece Plağı')!;
  assert.deepEqual([g.qty, g.compare, g.bucket, g.unitLabel], [2, 1, 'cene', 'çene']);
  const m = s.workTypes.find((w) => w.label === 'Model Baskısı')!;
  assert.deepEqual([m.qty, m.compare, m.bucket], [1, 0, 'adet']);
  // Sıra: qty desc, eşitlikte ad
  assert.deepEqual(s.workTypes.map((w) => w.label), ['Zirkon', 'Gece Plağı', 'Model Baskısı']);
  // 12 aylık seri: kayıt öncesi null
  assert.equal(z.series.length, 12);
  assert.equal(z.series[s.months.indexOf('2026-05')], null);
  assert.equal(z.series[s.months.indexOf('2026-10')], 5);
  assert.equal(z.series[s.months.indexOf('2026-08')], 2);
  assert.equal(z.series[s.months.indexOf('2026-07')], 0);
  assert.deepEqual(s.compareQty, { uye: 5, cene: 1, adet: 0 });
});

test('aggregate: sessizleşen klinik', () => {
  const s = aggregateWorkStats(input());
  assert.deepEqual(s.clinics.map((r) => r.id), ['cA', 'cB']);
  const last = s.clinics[s.clinics.length - 1];
  assert.equal(last.id, 'cB');
  assert.equal(last.name, 'Klinik B');
  assert.equal(last.qty.uye, 0);
  assert.ok(last.compare!.uye > 0);
  assert.equal(last.compare!.uye, 5);
  const a = s.clinics[0];
  assert.deepEqual(a.qty, { uye: 3, cene: 2, adet: 1 });
  assert.deepEqual(a.compare, { uye: 0, cene: 1, adet: 0 });
});

test('aggregate: klinik toplamı = genel toplam', () => {
  for (const orders of [BASE, [...BASE, ...BROKEN]]) {
    const s = aggregateWorkStats(input({ orders }));
    const sum = (k: 'uye' | 'cene' | 'adet') => s.clinics.reduce((t, r) => t + r.qty[k], 0);
    assert.equal(sum('uye'), s.selectedQty!.uye);
    assert.equal(sum('cene'), s.selectedQty!.cene);
    assert.equal(sum('adet'), s.selectedQty!.adet);
  }
});

test('aggregate: chip ve focus', () => {
  const sc = aggregateWorkStats(input({ chipWorkType: 'Gece Plağı' }));
  for (const p of sc.trend) assert.equal(p.bucket, 'cene');
  assert.equal(point(sc, '2026-11').value, 2);
  assert.equal(point(sc, '2026-10').value, 1);
  assert.equal(point(sc, '2026-09').value, 0);
  assert.equal(point(sc, '2026-05').value, null);
  // Çip toplam kutularını değiştirmez
  assert.deepEqual(sc.selectedQty, { uye: 3, cene: 2, adet: 1 });

  const sf = aggregateWorkStats(input({ focusWorkType: 'Zirkon' }));
  assert.deepEqual(sf.clinics.map((r) => r.id), ['cA', 'cB']);
  assert.deepEqual(sf.clinics[0].qty, { uye: 3, cene: 0, adet: 0 });
  assert.deepEqual(sf.clinics[0].compare, { uye: 0, cene: 0, adet: 0 });
  assert.deepEqual(sf.clinics[1].qty, { uye: 0, cene: 0, adet: 0 });
  assert.deepEqual(sf.clinics[1].compare, { uye: 5, cene: 0, adet: 0 });

  // Kıyas ayında o tipi göndermeyen sessiz klinik listeye girmez
  const sm = aggregateWorkStats(input({ focusWorkType: 'Model Baskısı' }));
  assert.deepEqual(sm.clinics.map((r) => r.id), ['cA']);
  assert.deepEqual(sm.clinics[0].qty, { uye: 0, cene: 0, adet: 1 });
});

// Kartın döngüsü (app/(admin)/index.tsx ≈1550–1587) — aynen yeniden yazılmış hali.
function cardMonthly(data: RawOrder[], months: string[]) {
  const unitByService = new Map<string, string | null>(
    [['Zirkon', 'Üye'], ['Gece Plağı', 'Çene'], ['Model Baskısı', 'Adet']].map(([n, u]) => [
      String(n ?? '').trim().toLocaleLowerCase('tr-TR'), u ?? null,
    ]),
  );
  const monthBuckets = months.map((k) => {
    const [y, m] = k.split('-').map(Number);
    return { k, y, m: m - 1, count: 0, cene: 0, adet: 0 };
  });
  for (const o of data) {
    const teeth = Array.isArray(o.tooth_numbers) ? o.tooth_numbers.length : 0;
    const c = o.created_at ? new Date(o.created_at) : null;
    if (c && teeth > 0) {
      const y = c.getFullYear(), m = c.getMonth();
      const oUnit = o.work_type ? resolveUnitForWorkType(String(o.work_type), unitByService) : null;
      const bucket = memberBucketOf(oUnit);
      if (o.status !== 'iptal') for (const mb of monthBuckets) {
        if (mb.y === y && mb.m === m) {
          if (bucket === 'uye') mb.count += teeth;
          else if (bucket === 'cene') mb.cene += serviceUnitQty(oUnit, o.tooth_numbers ?? []);
          else mb.adet += 1;
          break;
        }
      }
    }
  }
  return monthBuckets;
}

test('aggregate: kart eşliği', () => {
  const orders = [...BASE, ...BROKEN];
  const months = windowMonths('2026-11', 6);
  const card = cardMonthly(orders, months);
  const sNov = aggregateWorkStats(input({ orders }));
  let anyNonZero = false;
  for (const mb of card) {
    const s = aggregateWorkStats(input({ orders, selected: mb.k }));
    assert.deepEqual(s.selectedQty, { uye: mb.count, cene: mb.cene, adet: mb.adet }, `${mb.k} kartla eşit`);
    assert.equal(point(sNov, mb.k).value, mb.count, `${mb.k} trend kartla eşit`);
    if (mb.count || mb.cene || mb.adet) anyNonZero = true;
  }
  assert.ok(anyNonZero);
  const tot = card.reduce((t, mb) => t + mb.count, 0);
  assert.equal(tot, 1 + 0 + 2 + 0 + 5 + 7);
});

// ── Isı haritası ─────────────────────────────────────────────────────────
test('heatmapRows: iş tipi ve klinik ekseni', () => {
  const inp = input();
  const months = windowMonths('2026-11', 12);
  const wt = heatmapRows(inp, 'workType');
  assert.deepEqual(wt.map((r) => r.label), ['Zirkon', 'Gece Plağı', 'Model Baskısı']);
  for (const r of wt) {
    assert.equal(r.cells.length, 12);
    assert.equal(r.cells[months.indexOf('2026-05')], null, 'kayıt öncesi null');
    assert.equal(r.max, Math.max(...r.cells.map((c) => c ?? 0)));
  }
  const z = wt.find((r) => r.label === 'Zirkon')!;
  assert.equal(z.max, 5);
  assert.equal(z.unitLabel, 'üye');
  assert.equal(z.cells[months.indexOf('2026-07')], 0);
  assert.equal(wt.find((r) => r.label === 'Gece Plağı')!.unitLabel, 'çene');

  const cl = heatmapRows(inp, 'clinic');
  const a = cl.find((r) => r.key === 'cA')!;
  const b = cl.find((r) => r.key === 'cB')!;
  assert.equal(a.label, 'Klinik A');
  assert.equal(a.unitLabel, 'üye');
  assert.equal(a.cells.length, 12);
  assert.equal(a.cells[months.indexOf('2026-11')], 3, 'klinik hücresi = üye');
  assert.equal(a.cells[months.indexOf('2026-05')], null);
  assert.equal(a.max, 3);
  assert.equal(b.max, 5);
  // counts: sipariş SAYISI (her kova). Ekim'de A yalnız çene gönderdi → değer 0, sayı 1
  assert.equal(a.cells[months.indexOf('2026-10')], 0);
  assert.equal(a.counts[months.indexOf('2026-10')], 1, 'yalnız çene ayı yine açılabilir');
  assert.equal(a.counts[months.indexOf('2026-11')], 3);
  assert.equal(a.counts.length, 12);
  assert.equal(z.counts[months.indexOf('2026-11')], 1);
  assert.equal(z.counts[months.indexOf('2026-07')], 0);

  // Klinik süzgeci: klinik ekseni tek satıra iner
  const clB = heatmapRows(input({ clinicId: 'cB' }), 'clinic');
  assert.deepEqual(clB.map((r) => r.key), ['cB']);
  const wtB = heatmapRows(input({ clinicId: 'cB' }), 'workType');
  assert.deepEqual(wtB.map((r) => r.label), ['Zirkon']);

  const cell = ordersInCell(inp, '2026-11', 'clinic', 'cA');
  assert.deepEqual(cell.map((x) => x.id).sort(), ['n1', 'n2', 'n3']);
  const cellZ = ordersInCell(inp, '2026-10', 'workType', 'Zirkon');
  assert.deepEqual(cellZ.map((x) => x.id), ['e1']);
  assert.deepEqual(ordersInCell(input({ clinicId: 'cA' }), '2026-10', 'workType', 'Zirkon'), []);
});

test('aggregate: yıl sınırı', () => {
  const orders = [
    o({ id: 'y1', work_type: 'Zirkon', tooth_numbers: [11, 12], created_at: '2025-12-20T10:00:00' }),
    o({ id: 'y2', work_type: 'Gece Plağı', tooth_numbers: [31, 41], created_at: '2025-12-21T10:00:00' }),
    o({ id: 'y3', work_type: 'Zirkon', tooth_numbers: [11], created_at: '2026-01-05T10:00:00' }),
  ];
  const s = aggregateWorkStats(input({ orders, firstMonth: '2025-12', selected: '2026-01', compare: 'prev' }));
  assert.deepEqual(s.compareQty, { uye: 2, cene: 1, adet: 0 });
  assert.deepEqual(s.selectedQty, { uye: 1, cene: 0, adet: 0 });
  assert.equal(s.workTypes.find((w) => w.label === 'Zirkon')!.compare, 2);
  assert.equal(s.months[11], '2026-01');
  assert.equal(s.months[10], '2025-12');
});
