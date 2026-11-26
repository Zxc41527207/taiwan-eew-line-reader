require('dotenv').config();
const { WebSocket } = require('ws');
const { formatLineMessage, getEventKey, parseTaiwanEew } = require('./eew');

const websocketUrl = process.env.WEBSOCKET_URL || 'wss://rptes.com:443/ws/';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineTo = process.env.LINE_TO;
const sentEvents = new Set();
const eventsBeingSent = new Set();

function validateConfig() {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');
  if (!lineTo) throw new Error('LINE_TO is required');
  if (new URL(websocketUrl).protocol !== 'wss:') throw new Error('WEBSOCKET_URL must use wss://');
}

async function pushLineMessage(text) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: lineTo, messages: [{ type: 'text', text }] }),
        signal: AbortSignal.timeout(10000)
      });
      if (response.ok) return;
      const responseText = await response.text();
      lastError = new Error(`LINE API returned ${response.status}: ${responseText}`);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) throw lastError;
    } catch (error) {
      lastError = error;
      if (error.message && error.message.startsWith('LINE API returned 4')) throw error;
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

function rememberEvent(key) {
  sentEvents.add(key);
  if (sentEvents.size > 1000) sentEvents.delete(sentEvents.values().next().value);
}

async function handleMessage(rawData) {
  let packet;
  try { packet = JSON.parse(rawData.toString()); } catch { return; }
  const eew = parseTaiwanEew(packet);
  if (!eew) return;
  const eventKey = getEventKey(eew);
  if (sentEvents.has(eventKey) || eventsBeingSent.has(eventKey)) return;
  eventsBeingSent.add(eventKey);
  try {
    await pushLineMessage(formatLineMessage(eew));
    rememberEvent(eventKey);
    console.log(`LINE alert sent: ${eventKey}`);
  } catch (error) {
    console.error(`Failed to send LINE alert ${eventKey}:`, error.message);
  } finally {
    eventsBeingSent.delete(eventKey);
  }
}

function startReader() {
  let reconnectDelayMs = 1000;
  let stopping = false;
  let reconnectTimer;
  let activeSocket;
  const connect = () => {
    if (stopping) return;
    console.log(`Connecting to ${websocketUrl}`);
    const socket = new WebSocket(websocketUrl);
    activeSocket = socket;
    socket.on('open', () => { reconnectDelayMs = 1000; console.log('WebSocket connected'); });
    socket.on('message', data => { void handleMessage(data); });
    socket.on('error', error => console.error('WebSocket error:', error.message));
    socket.on('close', (code, reason) => {
      console.warn(`WebSocket closed (${code}): ${reason.toString() || 'no reason'}`);
      if (stopping) return;
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
    });
  };
  const shutdown = () => { stopping = true; clearTimeout(reconnectTimer); activeSocket?.close(1000, 'Worker shutting down'); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  connect();
}

try { validateConfig(); startReader(); } catch (error) { console.error(error.message); process.exitCode = 1; }
