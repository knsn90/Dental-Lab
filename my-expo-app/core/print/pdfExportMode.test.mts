import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfExportMode } from './pdfExportMode.ts';

test('pdfExportMode: native / tab / file', () => {
  assert.equal(pdfExportMode('ios', 400), 'native');
  assert.equal(pdfExportMode('android', 1400), 'native');
  assert.equal(pdfExportMode('web', 1280), 'tab');
  assert.equal(pdfExportMode('web', 1024), 'tab');
  assert.equal(pdfExportMode('web', 1023), 'file');
  assert.equal(pdfExportMode('web', 390), 'file');
});
