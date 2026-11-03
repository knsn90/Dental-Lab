// node --test modules/reviews/reviewRules.test.mts
// İş değerlendirmesi: bekleyen liste penceresi ve kaynak etiketi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_REVIEW_DAYS, pendingReviewSince, reviewSourceLabel } from './reviewRules.ts';

test('bekleyen pencere 30 gün', () => {
  assert.equal(PENDING_REVIEW_DAYS, 30);
  assert.equal(pendingReviewSince(new Date('2026-11-03T09:00:00Z')), '2026-10-04T09:00:00.000Z');
});

test('kaynak etiketi', () => {
  assert.equal(reviewSourceLabel({ source: 'whatsapp', rater_role: 'doctor' }), 'WhatsApp · hekim');
  assert.equal(reviewSourceLabel({ source: 'whatsapp', rater_role: 'clinic' }), 'WhatsApp · klinik hattı');
  assert.equal(reviewSourceLabel({ source: 'app', rater_role: 'clinic' }), 'Klinik');
  assert.equal(reviewSourceLabel({ source: 'app', rater_role: null }), 'Hekim');
  assert.equal(reviewSourceLabel({}), 'Hekim');
});
