// deno test supabase/functions/_shared/bbkMultiDrop.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapPointStatus, splitFee, pointUpdatesFromOrder, makePointRef, maxStatus } from './bbkMultiDrop.ts';

Deno.test('mapPointStatus — alım öncesi atandi, alındı, yolda, teslim, iade, iptal', () => {
  assertEquals(mapPointStatus('courier_departed'), 'atandi');
  assertEquals(mapPointStatus('courier_at_pickup'), 'atandi');
  assertEquals(mapPointStatus('parcel_picked_up'), 'teslim_alindi');
  assertEquals(mapPointStatus('courier_arrived'), 'yolda');
  assertEquals(mapPointStatus('active'), 'atandi');   // alım kanıtı yoksa yolda DEĞİL
  assertEquals(mapPointStatus('finished'), 'teslim_edildi');
  assertEquals(mapPointStatus('reattempt_finished'), 'teslim_edildi');
  assertEquals(mapPointStatus('return_finished'), 'iade');
  assertEquals(mapPointStatus('return_planned'), null);
  assertEquals(mapPointStatus('delayed'), null);
  assertEquals(mapPointStatus('deleted'), 'iptal');
  assertEquals(mapPointStatus(undefined), null);
});

Deno.test('splitFee — toplam birebir, kuruş farkı sonda', () => {
  const a = splitFee(634.54, 3);
  assertEquals(a, [211.51, 211.51, 211.52]);
  assertEquals(Math.round(a.reduce((x, y) => x + y, 0) * 100), 63454);
  assertEquals(splitFee(100, 2), [50, 50]);
  assertEquals(splitFee(10, 0), []);
});

Deno.test('makePointRef — 32 hex (client_order_id ≤ 32)', () => {
  const r = makePointRef();
  assertEquals(r.length, 32);
  assertEquals(/^[0-9a-f]{32}$/.test(r), true);
});

Deno.test('maxStatus — ileride olan kazanır', () => {
  assertEquals(maxStatus('atandi', 'teslim_alindi'), 'teslim_alindi');
  assertEquals(maxStatus(null, 'yolda'), 'yolda');
});

Deno.test('pointUpdatesFromOrder — sıra değil ref; nokta bağımsız; alım ziyareti', () => {
  const order = {
    status: 'active',
    points: [
      { point_id: 1, courier_visit_datetime: '2026-11-27T10:00:00+03:00' },          // alım
      { point_id: 3, client_order_id: 'bbb', delivery: { status: 'active' } },        // optimize edilmiş sıra
      { point_id: 2, client_order_id: 'aaa', delivery: { status: 'finished' },
        courier_visit_datetime: '2026-11-27T10:30:00+03:00', tracking_url: 'https://t/a' },
      { point_id: 4, client_order_id: null, delivery: { status: 'finished' } },      // ref yok → atla
      { point_id: 5, client_order_id: 'ret', is_return_point: true },                 // dönüş → atla
    ],
  };
  const u = pointUpdatesFromOrder(order);
  assertEquals(u.map(x => [x.ref, x.status, x.at, x.pointId]), [
    ['bbb', 'yolda', '2026-11-27T10:00:00+03:00', '3'],   // active + alım ziyareti → yolda
    ['aaa', 'teslim_edildi', '2026-11-27T10:30:00+03:00', '2'],
  ]);
  assertEquals(u[1].trackingUrl, 'https://t/a');
});

Deno.test('pointUpdatesFromOrder — durum yokken sipariş completed/canceled; alım sonrası en az alındı', () => {
  const pts = (s?: string) => [{ point_id: 1 }, { point_id: 2, client_order_id: 'x', delivery: s ? { status: s } : null }];
  assertEquals(pointUpdatesFromOrder({ status: 'completed', points: pts() })[0].status, 'teslim_edildi');
  assertEquals(pointUpdatesFromOrder({ status: 'canceled', points: pts() })[0].status, 'iptal');
  assertEquals(pointUpdatesFromOrder({ status: 'active', points: pts() }).length, 0);
  const visited = [{ point_id: 1, courier_visit_datetime: '2026-11-27T10:00:00Z' }, { point_id: 2, client_order_id: 'x', delivery: { status: 'courier_departed' } }];
  assertEquals(pointUpdatesFromOrder({ status: 'active', points: visited })[0].status, 'teslim_alindi');
});

Deno.test('pointUpdatesFromOrder — tanınmayan durum completed siparişte teslim SAYILMAZ; alımsız active atandi', () => {
  const o = (st: string, os: string, visit?: string) => ({ status: os, points: [
    { point_id: 1, courier_visit_datetime: visit }, { point_id: 2, client_order_id: 'x', delivery: { status: st } }] });
  assertEquals(pointUpdatesFromOrder(o('return_planned', 'completed')).length, 0);
  assertEquals(pointUpdatesFromOrder(o('delayed', 'completed')).length, 0);
  assertEquals(pointUpdatesFromOrder(o('active', 'active'))[0].status, 'atandi');
  assertEquals(pointUpdatesFromOrder(o('return_planned', 'active', '2026-11-27T10:00:00Z')).length, 0);
});
