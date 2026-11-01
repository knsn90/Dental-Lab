// node --test my-expo-app/modules/efatura/lib/efaturaFlow.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { efaturaStage, stageStep, logActionLabel, draftMinutesLeft } from './efaturaFlow.ts';

test('gönderilmemiş fatura: taslak yoksa "draft", taslak varsa "ready"', () => {
  assert.equal(efaturaStage(null, false), 'draft');
  assert.equal(efaturaStage('pending', false), 'draft');
  assert.equal(efaturaStage('pending', true), 'ready');
});

test('gönderim sonrası durumlar taslaktan bağımsız', () => {
  assert.equal(efaturaStage('sent', true), 'sent');
  assert.equal(efaturaStage('accepted', false), 'done');
  assert.equal(efaturaStage('cancelled', false), 'cancelled');
  assert.equal(efaturaStage('rejected', false), 'error');
  assert.equal(efaturaStage('error', false), 'error');
  assert.equal(efaturaStage('error', true), 'ready'); // hatadan sonra yeni taslak hazırlandı
});

test('adım çubuğu: taslak 0, kesildi 1, onaylandı 2', () => {
  assert.equal(stageStep('draft'), 0);
  assert.equal(stageStep('ready'), 0);
  assert.equal(stageStep('error'), 0);
  assert.equal(stageStep('sent'), 1);
  assert.equal(stageStep('done'), 2);
});

test('geçmiş satırları insan diliyle', () => {
  assert.equal(logActionLabel('send', null), 'Gönderim');
  assert.equal(logActionLabel('send', 'Önizleme kapısı (missing): ...'), 'Taslaksız gönderim engellendi');
  assert.equal(logActionLabel('status_check', null), 'Durum sorgusu');
  assert.equal(logActionLabel('query', null), 'Durum sorgusu');
  assert.equal(logActionLabel('cancel', null), 'İptal');
  assert.equal(logActionLabel('bilinmeyen', null), 'bilinmeyen');
});

test('taslağın kalan süresi (dk, aşağı yuvarlanmaz, bitince 0)', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  assert.equal(draftMinutesLeft('2026-10-21T12:30:00Z', now), 30);
  assert.equal(draftMinutesLeft('2026-10-21T12:00:30Z', now), 1);
  assert.equal(draftMinutesLeft('2026-10-21T11:59:00Z', now), 0);
  assert.equal(draftMinutesLeft(null, now), null);
});

import { efaturaBlocker } from './efaturaFlow.ts';

test('fatura kesilmeden / iptalken e-fatura akışı kilitli', () => {
  assert.equal(efaturaBlocker('taslak', null), 'unissued');
  assert.equal(efaturaBlocker('iptal', null), 'cancelled');
  assert.equal(efaturaBlocker('kesildi', null), null);
  assert.equal(efaturaBlocker('odendi', 'pending'), null);
  assert.equal(efaturaBlocker(undefined, null), null);
  // e-faturası zaten gönderilmişse fatura durumu ne olursa olsun kilit yok (kayıt gösterilir)
  assert.equal(efaturaBlocker('iptal', 'accepted'), null);
});

test('toplu gönderim ve Luca bağlama geçmişte kendi adıyla görünür', () => {
  assert.equal(logActionLabel('send', null, 'merge'), 'Toplu e-fatura gönderimi');
  assert.equal(logActionLabel('send', 'Toplu e-fatura: Luca hatası', 'merge'), 'Toplu e-fatura gönderimi');
  assert.equal(logActionLabel('send', 'Önizleme kapısı (missing): Toplu e-fatura — ...', undefined), 'Taslaksız gönderim engellendi');
  assert.equal(logActionLabel('status_check', null, 'link'), 'Luca\'da kesilen fatura bağlandı');
  assert.equal(logActionLabel('status_check', null, undefined), 'Durum sorgusu');
});
