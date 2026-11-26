const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadGroupIds, saveGroupIds } = require('../src/group-store');

test('persisted LINE group IDs survive process-like reload', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'line-groups-'));
  const filePath = path.join(directory, 'groups.json');

  saveGroupIds(filePath, ['C67de26f3d13b428392f9e230283d995a']);

  assert.deepEqual(
    loadGroupIds(filePath),
    ['C67de26f3d13b428392f9e230283d995a']
  );

  fs.rmSync(directory, { recursive: true, force: true });
});

test('load ignores malformed persisted group data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'line-groups-'));
  const filePath = path.join(directory, 'groups.json');
  fs.writeFileSync(filePath, '{bad json', 'utf8');

  assert.deepEqual(loadGroupIds(filePath), []);

  fs.rmSync(directory, { recursive: true, force: true });
});
