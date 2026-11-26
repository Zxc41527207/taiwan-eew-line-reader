const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatLineMessage,
  getEventKey,
  parseTaiwanEew
} = require('../src/eew');

const samplePacket = {
  HasEarthquake: true,
  Earthquake: {
    isDrill: false,
    time: '2026-11-25 16:47:18',
    latitude: 22,
    longitude: 121.43,
    address: '外海',
    depth: 10,
    scale: 5.7,
    maxlevel: '5 強',
    level: '2',
    second: 34,
    data: '{"Taipei":{"level":"2 級","second":"34"}}'
  }
};

test('parses the supplied TWEarthquake API response', () => {
  assert.deepEqual(parseTaiwanEew(samplePacket), {
    id: '2026-11-25 16:47:18:22:121.43',
    reportNumber: null,
    magnitude: 5.7,
    time: '2026-11-25 16:47:18',
    longitude: 121.43,
    latitude: 22,
    depthKm: 10,
    location: '外海',
    maxLevel: '5 強',
    localLevel: '2',
    arrivalSeconds: 34,
    isDrill: false,
    regionalData: { Taipei: { level: '2 級', second: '34' } }
  });
});

test('requires the HasEarthquake flag and valid EEW fields', () => {
  assert.equal(parseTaiwanEew({ ...samplePacket, HasEarthquake: false }), null);
  assert.equal(parseTaiwanEew({ HasEarthquake: true }), null);
  assert.equal(parseTaiwanEew({
    ...samplePacket,
    Earthquake: { ...samplePacket.Earthquake, scale: '5.7' }
  }), null);
  assert.equal(parseTaiwanEew({
    ...samplePacket,
    Earthquake: { ...samplePacket.Earthquake, data: '{bad json' }
  }), null);
});

test('parses RPtES WebSocket packets and deduplicates reports', () => {
  const packet = {
    type: 'eew_tw',
    content: {
      type: 'TWEEW',
      time: 1795596438000,
      center: {
        lon: 121.43,
        lat: 22,
        depth: 10,
        cname: '臺灣東南部海域'
      },
      scale: 5.7,
      report_num: 4,
      id: 'CWA-EEW1150086'
    }
  };

  const firstReport = parseTaiwanEew(packet);
  assert.equal(firstReport.id, 'CWA-EEW1150086');
  assert.equal(firstReport.reportNumber, 4);
  assert.equal(getEventKey(firstReport), getEventKey(parseTaiwanEew(packet)));

  const nextReport = parseTaiwanEew({
    ...packet,
    content: { ...packet.content, report_num: 5 }
  });
  assert.notEqual(getEventKey(firstReport), getEventKey(nextReport));
});

test('dedupe key distinguishes updates to the same TWEarthquake event', () => {
  const firstReport = parseTaiwanEew(samplePacket);
  const nextReport = { ...firstReport, arrivalSeconds: 20 };

  assert.notEqual(getEventKey(firstReport), getEventKey(nextReport));
});

test('formats a LINE message in Taiwan time', () => {
  const message = formatLineMessage(parseTaiwanEew(samplePacket));

  assert.match(message, /【地震速報】/);
  assert.match(message, /2026\/11\/25 16:47:18/);
  assert.match(message, /規模：5\.7/);
  assert.match(message, /所在地預估震度：2級/);
  assert.match(message, /2026-11-25 16:47:18:22:121\.43/);
});