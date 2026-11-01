// node --test my-expo-app/modules/tv/lib/boardClinic.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardClinicName, doctorIdsNeedingClinic } from './boardClinic.ts';

const byDoctor = new Map<string, string | null>([
  ['d1', 'DentPlus Ağız ve Diş'],
  ['d2', null],
  ['d3', '  Gülüş Kliniği  '],
]);

test('siparişin kendi klinik adı önceliklidir', () => {
  assert.equal(boardClinicName({ clinic_name: 'Merkez Klinik', doctor_id: 'd1' }, byDoctor), 'Merkez Klinik');
});

test('sipariş klinik adı boşsa hekimin kliniği kullanılır', () => {
  assert.equal(boardClinicName({ clinic_name: null, doctor_id: 'd1' }, byDoctor), 'DentPlus Ağız ve Diş');
  assert.equal(boardClinicName({ clinic_name: '   ', doctor_id: 'd1' }, byDoctor), 'DentPlus Ağız ve Diş');
  assert.equal(boardClinicName({ clinic_name: '', doctor_id: 'd3' }, byDoctor), 'Gülüş Kliniği');
});

test('hiçbir kaynak yoksa null', () => {
  assert.equal(boardClinicName({ clinic_name: null, doctor_id: 'd2' }, byDoctor), null);
  assert.equal(boardClinicName({ clinic_name: null, doctor_id: 'yok' }, byDoctor), null);
  assert.equal(boardClinicName({ clinic_name: undefined, doctor_id: null }, byDoctor), null);
  assert.equal(boardClinicName({}, new Map()), null);
});

test('yalnız klinik adı boş siparişlerin hekimleri çözülür (tekil)', () => {
  assert.deepEqual(
    doctorIdsNeedingClinic([
      { clinic_name: 'A', doctor_id: 'd1' },
      { clinic_name: null, doctor_id: 'd1' },
      { clinic_name: ' ', doctor_id: 'd2' },
      { clinic_name: null, doctor_id: 'd1' },
      { clinic_name: null, doctor_id: null },
    ]),
    ['d1', 'd2'],
  );
});
