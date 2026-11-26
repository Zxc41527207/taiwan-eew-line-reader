const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSentEvents, saveSentEvents } = require('../src/dedupe-store');

test('persisted dedupe state survives process-like reload', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eew-dedupe-'));
  const filePath = path.join(directory, 'sent.json');

  saveSentEvents(filePath, ['CWA-EEW1150086:4']);

  const reloadedKeys = loadSentEvents(filePath, 100);
  assert.deepEqual(reloadedKeys, ['CWA-EEW1150086:4']);

  fs.rmSync(directory, { recursive: true, force: true });
});

test('load trims persisted keys to the configured limit', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eew-dedupe-'));
  const filePath = path.join(directory, 'sent.json');

  saveSentEvents(filePath, ['event:1', 'event:2', 'event:3']);

  assert.deepEqual(loadSentEvents(filePath, 2), ['event:2', 'event:3']);

  fs.rmSync(directory, { recursive: true, force: true });
});
