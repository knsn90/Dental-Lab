// node --test my-expo-app/modules/hr/lib/attendanceResult.test.mts   (.mts → tsc kapsamı dışında)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualAttendanceError, ATTENDANCE_SAVE_FAILED } from './attendanceResult.ts';

test('manual_attendance ok:true döndürdüyse hata yok', () => {
  assert.equal(manualAttendanceError({ ok: true, work_minutes: 540 }), null);
});

test('ok:false sessizce geçmez, kodu okunur metne çevrilir', () => {
  assert.equal(manualAttendanceError({ ok: false, error: 'forbidden' }), 'Bu işlem için yetkiniz yok.');
  assert.equal(manualAttendanceError({ ok: false, error: 'employee_not_found' }), 'Personel bulunamadı.');
  assert.equal(manualAttendanceError({ ok: false, error: 'no_session' }), 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
});

test('bilinmeyen kod ya da beklenmeyen yanıt genel hataya düşer', () => {
  assert.equal(manualAttendanceError({ ok: false, error: 'baska' }), ATTENDANCE_SAVE_FAILED);
  assert.equal(manualAttendanceError(null), ATTENDANCE_SAVE_FAILED);
  assert.equal(manualAttendanceError(undefined), ATTENDANCE_SAVE_FAILED);
  assert.equal(manualAttendanceError('x'), ATTENDANCE_SAVE_FAILED);
  assert.equal(ATTENDANCE_SAVE_FAILED, 'Devam kaydı kaydedilemedi.');
});
