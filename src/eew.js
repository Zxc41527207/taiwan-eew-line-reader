function parseTaiwanEew(packet) {
  if (!packet || packet.type !== 'eew_tw') return null;
  const content = packet.content;
  if (!content || content.type !== 'TWEEW') return null;
  const center = content.center;
  if (!center || typeof content.id !== 'string' || !Number.isFinite(content.time) || !Number.isFinite(content.report_num) || !Number.isFinite(content.scale) || !Number.isFinite(center.lon) || !Number.isFinite(center.lat) || !Number.isFinite(center.depth)) return null;
  return { id: content.id, reportNumber: content.report_num, magnitude: content.scale, time: content.time, longitude: center.lon, latitude: center.lat, depthKm: center.depth, location: typeof center.cname === 'string' ? center.cname : '位置未提供' };
}
function getEventKey(eew) { return `${eew.id}:${eew.reportNumber}`; }
function formatTaiwanTime(timestamp) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(timestamp));
}
function formatLineMessage(eew) {
  return [
    `【地震速報】第 ${eew.reportNumber} 報`,
    `時間：${formatTaiwanTime(eew.time)} (台灣時間)`,
    `地點：${eew.location}`,
    `規模：${eew.magnitude}`,
    `深度：${eew.depthKm} 公里`,
    `震央：${eew.latitude}°N, ${eew.longitude}°E`,
    `編號：${eew.id}`,
    '資料來源：RPTeS RFEQ；地震資訊請以中央氣象署發布為準.'
  ].join('\n');
}
module.exports = { formatLineMessage, getEventKey, parseTaiwanEew };
