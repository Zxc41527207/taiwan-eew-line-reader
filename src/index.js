require('dotenv').config();

const http = require('http');
const { WebSocket } = require('ws');
const { formatLineMessage, getEventKey, parseTaiwanEew } = require('./eew');

const websocketUrl = process.env.WEBSOCKET_URL || 'wss://rptes.com:443/ws/';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineTo = process.env.LINE_TO;
const maxReconnectDelayMs = 30000;
const maxRememberedEvents = 1000;
const sentEvents = new Set();
const eventsBeingSent = new Set();

function validateConfig() {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');
  if (!lineTo) throw new Error('LINE_TO is required');
  const parsedUrl = new URL(websocketUrl);
  if (parsedUrl.protocol !== 'wss:') throw new Error('WEBSOCKET_URL must use wss://');
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
  if (sentEvents.size > maxRememberedEvents) sentEvents.delete(sentEvents.values().next().value);
}

async function handleMessage(rawData) {
  let packet;
  try { packet = JSON.parse(rawData.toString()); } catch { console.warn('Skipped a non-JSON WebSocket message'); return; }
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

function startWebhookServer() {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('Taiwan EEW LINE reader is running');
      return;
    }
    if (request.method === 'POST' && request.url === '/webhook') {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        try {
          const payload = JSON.parse(body);
          for (const event of payload.events || []) {
            if (event.source?.type === 'group') console.log(`LINE group ID: ${event.source.groupId}`);
          }
        } catch (error) { console.error('Invalid LINE webhook payload:', error.message); }
        response.writeHead(200);
        response.end();
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(port, '0.0.0.0', () => console.log(`HTTP server listening on port ${port}`));
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
    socket.on('open', () => { reconnectDelayMs = 1000; console.log('WebSocket connected; waiting for pushed messages'); });
    socket.on('message', data => { void handleMessage(data); });
    socket.on('error', error => console.error('WebSocket error:', error.message));
    socket.on('close', (code, reason) => {
      console.warn(`WebSocket closed (${code}): ${reason.toString() || 'no reason'}`);
      if (stopping) return;
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, maxReconnectDelayMs);
    });
  };
  const shutdown = () => { stopping = true; clearTimeout(reconnectTimer); activeSocket?.close(1000, 'Worker shutting down'); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  connect();
}

try { validateConfig(); startWebhookServer(); startReader(); } catch (error) { console.error(error.message); process.exitCode = 1; }
