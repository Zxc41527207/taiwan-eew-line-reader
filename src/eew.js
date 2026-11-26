function parseTaiwanEew(packet) {
  if (!packet) return null;

  if (packet.type === 'eew_tw') {
    const content = packet.content;
    if (!content || content.type !== 'TWEEW') return null;

    const center = content.center;
    if (
      !center ||
      typeof content.id !== 'string' ||
      !Number.isFinite(content.time) ||
      !Number.isFinite(content.report_num) ||
      !Number.isFinite(content.scale) ||
      !Number.isFinite(center.lon) ||
      !Number.isFinite(center.lat) ||
      !Number.isFinite(center.depth)
    ) return null;

    return {
      id: content.id,
      reportNumber: content.report_num,
      magnitude: content.scale,
      time: content.time,
      longitude: center.lon,
      latitude: center.lat,
      depthKm: center.depth,
      location: typeof center.cname === 'string' ? center.cname : '位置未提供',
      isDrill: false,
      regionalData: {}
    };
  }

  if (packet.HasEarthquake !== true) return null;

  const content = packet.Earthquake;
  if (
    !content ||
    typeof content.time !== 'string' ||
    !Number.isFinite(content.scale) ||
    !Number.isFinite(content.longitude) ||
    !Number.isFinite(content.latitude) ||
    !Number.isFinite(content.depth)
  ) {
    return null;
  }

  let regionalData = {};
  if (typeof content.data === 'string') {
    try {
      regionalData = JSON.parse(content.data);
    } catch {
      return null;
    }
  } else if (content.data && typeof content.data === 'object') {
    regionalData = content.data;
  }

  return {
    id: content.id || `${content.time}:${content.latitude}:${content.longitude}`,
    reportNumber: Number.isFinite(content.report_num) ? content.report_num : null,
    magnitude: content.scale,
    time: content.time,
    longitude: content.longitude,
    latitude: content.latitude,
    depthKm: content.depth,
    location: typeof content.address === 'string' ? content.address : '位置未提供',
    maxLevel: content.maxlevel,
    localLevel: content.level,
    arrivalSeconds: content.second,
    isDrill: content.isDrill === true,
    regionalData
  };
}

function getEventKey(eew) {
  return [
    eew.id,
    eew.reportNumber,
    eew.magnitude,
    eew.maxLevel,
    eew.localLevel,
    eew.arrivalSeconds,
    JSON.stringify(eew.regionalData)
  ].join(':');
}

function formatTaiwanTime(timestamp) {
  if (typeof timestamp === 'string') return timestamp.replaceAll('-', '/');

  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(timestamp));
}

function formatLineMessage(eew) {
  const intensityNames = {
    '0': '0級',
    '1': '1級',
    '2': '2級',
    '3': '3級',
    '4': '4級',
    '5-': '5弱',
    '5+': '5強',
    '6-': '6弱',
    '6+': '6強',
    '7': '7級'
  };

  return [
    `【地震速報】${eew.isDrill ? '（演練）' : ''}${eew.reportNumber ? `第 ${eew.reportNumber} 報` : ''}`.trim(),
    `時間：${formatTaiwanTime(eew.time)} (台灣時間)`,
    `地點：${eew.location}`,
    `規模：${eew.magnitude}`,
    `深度：${eew.depthKm} 公里`,
    `預估最大震度：${eew.maxLevel || '未提供'}`,
    `所在地預估震度：${intensityNames[eew.localLevel] || eew.localLevel || '未提供'}${eew.arrivalSeconds !== undefined ? `，約 ${eew.arrivalSeconds} 秒後抵達` : ''}`,
    `震央：${eew.latitude}°N, ${eew.longitude}°E`,
    `編號：${eew.id}`,
    '資料來源：RPTeS RFEQ；地震資訊請以中央氣象署發布為準。'
  ].join('\n');
}

module.exports = { formatLineMessage, getEventKey, parseTaiwanEew };