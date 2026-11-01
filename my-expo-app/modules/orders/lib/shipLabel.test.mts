// node --test my-expo-app/modules/orders/lib/shipLabel.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShipParties, isFinalLeg, labPartyAddress, type ShipParty } from './shipLabel.ts';

const lab: ShipParty = { name: 'Nexadent', address: 'Vatan Cad. No: 21, Ataşehir / İstanbul', phone: '0216 000 00 00' };
const clinic: ShipParty = { name: 'Gülüş Diş Kliniği', person: 'Dt. Ayşe Kaya', address: 'Bağdat Cad. 5, Kadıköy / İstanbul', phone: '0216 111 11 11' };

test('teslimat (lab → klinik): gönderen lab; alıcı klinik + hekim, adres hareketten', () => {
  const r = resolveShipParties({
    leg: { direction: 'lab_to_clinic', destination_name: 'Dt. Ayşe Kaya', destination_address: 'Bağdat Cad. 5 Kat 2', destination_phone: '0532 222 22 22' },
    lab, clinic,
  });
  assert.equal(r.from.isLab, true);
  assert.equal(r.from.name, 'Nexadent');
  assert.equal(r.to.isLab, false);
  assert.equal(r.to.name, 'Gülüş Diş Kliniği');
  assert.equal(r.to.person, 'Dt. Ayşe Kaya');
  assert.equal(r.to.address, 'Bağdat Cad. 5 Kat 2');
  // Kutudaki telefon kliniğin; yoksa hareketteki numara
  assert.equal(r.to.phone, '0216 111 11 11');
});

test('yön boşsa teslimat sayılır; klinik bilgisi eksikse hareketin varış bilgisine düşer', () => {
  const r = resolveShipParties({
    leg: { direction: null, destination_name: 'Dt. Ayşe Kaya', destination_address: 'Bağdat Cad. 5', destination_phone: '0532 222 22 22' },
    lab, clinic: { name: '', person: 'Dt. Ayşe Kaya', address: '', phone: '' },
  });
  assert.equal(r.to.name, 'Dt. Ayşe Kaya');
  assert.equal(r.to.address, 'Bağdat Cad. 5');
  assert.equal(r.to.phone, '0532 222 22 22');
});

test('klinikten laba (model alma / prova dönüş): gönderen klinik, alıcı lab', () => {
  const r = resolveShipParties({
    leg: { direction: 'clinic_to_lab', origin_name: 'Gülüş Diş Kliniği', origin_address: 'Bağdat Cad. 5 Kat 2' },
    lab, clinic,
  });
  assert.equal(r.from.isLab, false);
  assert.equal(r.from.name, 'Gülüş Diş Kliniği');
  assert.equal(r.from.person, 'Dt. Ayşe Kaya');
  assert.equal(r.from.address, 'Bağdat Cad. 5 Kat 2');
  assert.equal(r.to.isLab, true);
  assert.equal(r.to.address, lab.address);
});

test('dış servise gidiş: alıcı servis (hekim adı yok); dış servisten geliş: gönderen servis', () => {
  const out = resolveShipParties({
    leg: { direction: 'lab_to_other', destination_name: 'Freze Merkezi', destination_address: 'Sanayi Sit. 3', destination_phone: '0212 333 33 33' },
    lab, clinic,
  });
  assert.equal(out.from.isLab, true);
  assert.deepEqual({ ...out.to }, { name: 'Freze Merkezi', person: '', address: 'Sanayi Sit. 3', phone: '0212 333 33 33', isLab: false });

  const back = resolveShipParties({
    leg: { direction: 'other_to_lab', origin_name: 'Freze Merkezi', origin_address: 'Sanayi Sit. 3' },
    lab, clinic,
  });
  assert.equal(back.from.name, 'Freze Merkezi');
  assert.equal(back.from.person, '');
  assert.equal(back.to.isLab, true);
});

test('final teslimat mı: teslimat ya da boş amaç evet; diğerleri ara hareket', () => {
  assert.equal(isFinalLeg('teslimat'), true);
  assert.equal(isFinalLeg(null), true);
  assert.equal(isFinalLeg(undefined), true);
  assert.equal(isFinalLeg('prova_gidis'), false);
  assert.equal(isFinalLeg('diger'), false);
});

test('lab adresi: fatura künyesi parçaları önce, yoksa eski tek satır', () => {
  assert.equal(labPartyAddress({ street: 'Vatan Cad. No: 21', district: 'Ataşehir', city: 'İstanbul', address: 'eski' }), 'Vatan Cad. No: 21, Ataşehir / İstanbul');
  assert.equal(labPartyAddress({ street: '', district: '', city: '', address: '  Eski adres 1 ' }), 'Eski adres 1');
  assert.equal(labPartyAddress({ street: null, district: 'Kadıköy', city: null, address: null }), 'Kadıköy');
  assert.equal(labPartyAddress(null), '');
});
