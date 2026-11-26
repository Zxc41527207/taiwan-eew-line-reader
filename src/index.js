require('dotenv').config();

const http = require('http');
const { WebSocket } = require('ws');
const {
  formatLineMessage,
  getEventKey,
  parseTaiwanEew
} = require('./eew');
const { loadSentEvents, saveSentEvents } = require('./dedupe-store');
const { loadGroupIds, saveGroupIds } = require('./group-store');
const postgresStore = require('./postgres-store');

const websocketUrl = process.env.WEBSOCKET_URL || 'wss://rptes.com:443/ws/';
const maxReconnectDelayMs = 30_000;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const maxRememberedEvents = 1_000;
const dedupeFile = process.env.DEDUPE_FILE || '/tmp/taiwan-eew-line-reader-dedupe.json';
const groupFile = process.env.LINE_GROUP_FILE || '/tmp/taiwan-eew-line-reader-groups.json';
const lineBroadcast = process.env.LINE_BROADCAST === 'true';
const sentEvents = new Set(loadSentEvents(dedupeFile, maxRememberedEvents));
const groupIds = new Set(loadGroupIds(groupFile));
const eventsBeingSent = new Set();

function validateConfig() {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');

  const parsedUrl = new URL(websocketUrl);
  if (parsedUrl.protocol !== 'wss:') {
    throw new Error('WEBSOCKET_URL must use wss://');
  }
}

async function sendWithRetry(url, body) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      });

      if (response.ok) return;

      const responseText = await response.text();
      lastError = new Error(`LINE API returned ${response.status}: ${responseText}`);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (error.message.startsWith('LINE API returned 4')) throw error;
    }

    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1_000));
    }
  }

  throw lastError;
}

async function pushLineMessage(text) {
  const messageBody = { messages: [{ type: 'text', text }] };
  let delivered = false;

  if (groupIds.size > 0) {
    for (const groupId of groupIds) {
      await sendWithRetry('https://api.line.me/v2/bot/message/push', {
        ...messageBody,
        to: groupId
      });
      delivered = true;
    }
  }

  if (lineBroadcast) {
    await sendWithRetry('https://api.line.me/v2/bot/message/broadcast', messageBody);
    delivered = true;
  }

  if (!delivered) {
    throw new Error('No LINE group targets and broadcast is disabled');
  }
}

function rememberEvent(key) {
  sentEvents.add(key);

  let orderedKeys = Array.from(sentEvents);
  if (orderedKeys.length > maxRememberedEvents) {
    orderedKeys = orderedKeys.slice(-maxRememberedEvents);
    sentEvents.clear();
    orderedKeys.forEach(item => sentEvents.add(item));
  }

  saveSentEvents(dedupeFile, orderedKeys);
}

async function handleMessage(rawData) {
  let packet;
  try {
    packet = JSON.parse(rawData.toString());
  } catch {
    console.warn('Skipped a non-JSON WebSocket message');
    return;
  }

  const eew = parseTaiwanEew(packet);
  if (!eew) return;

  const eventKey = getEventKey(eew);
  if (eventsBeingSent.has(eventKey)) return;

  let alreadySent = sentEvents.has(eventKey);
  if (!alreadySent && process.env.DATABASE_URL) {
    alreadySent = await postgresStore.hasSentEvent(eventKey);
  }
  if (alreadySent) return;

  eventsBeingSent.add(eventKey);
  try {
    await pushLineMessage(formatLineMessage(eew));
    rememberEvent(eventKey);
    if (process.env.DATABASE_URL) await postgresStore.rememberSentEvent(eventKey);
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
            if (event.type === 'join' && event.source?.type === 'group' && event.source.groupId) {
              groupIds.add(event.source.groupId);
              saveGroupIds(groupFile, Array.from(groupIds));
              if (process.env.DATABASE_URL) void postgresStore.addGroupId(event.source.groupId);
              console.log(`LINE group joined: ${event.source.groupId}`);
            } else if (event.type === 'leave' && event.source?.type === 'group' && event.source.groupId) {
              groupIds.delete(event.source.groupId);
              saveGroupIds(groupFile, Array.from(groupIds));
              if (process.env.DATABASE_URL) void postgresStore.removeGroupId(event.source.groupId);
              console.log(`LINE group left: ${event.source.groupId}`);
            }
          }
        } catch (error) {
          console.error('Invalid LINE webhook payload:', error.message);
        }
        response.writeHead(200);
        response.end();
      });
      return;
    }

    response.writeHead(404);
    response.end();
  });

  server.listen(port, () => {
    console.log(`LINE webhook listening on port ${port}`);
  });
}

function startReader() {
  let reconnectDelayMs = 1_000;
  let stopping = false;
  let reconnectTimer;
  let activeSocket;

  const shutdown = () => {
    stopping = true;
    clearTimeout(reconnectTimer);
    activeSocket?.close(1000, 'Worker shutting down');
    console.log('Shutting down');
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const connect = () => {
    if (stopping) return;

    console.log(`Connecting to ${websocketUrl}`);
    const socket = new WebSocket(websocketUrl);
    activeSocket = socket;

    socket.on('open', () => {
      reconnectDelayMs = 1_000;
      console.log('WebSocket connected; waiting for pushed messages');
    });

    socket.on('message', data => {
      void handleMessage(data);
    });

    socket.on('error', error => {
      console.error('WebSocket error:', error.message);
    });

    socket.on('close', (code, reason) => {
      console.warn(`WebSocket closed (${code}): ${reason.toString() || 'no reason'}`);
      if (stopping) return;

      const delay = reconnectDelayMs;
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, maxReconnectDelayMs);
      console.log(`Reconnecting in ${delay} ms`);
      reconnectTimer = setTimeout(connect, delay);
    });
  };

  connect();
}

async function bootstrap() {
  try {
    validateConfig();

    if (process.env.DATABASE_URL) {
      await postgresStore.initializeStore();
      const persistedGroupIds = await postgresStore.loadGroupIds();
      persistedGroupIds.forEach(groupId => groupIds.add(groupId));
      console.log(`Loaded ${persistedGroupIds.length} persisted LINE group(s) from PostgreSQL`);
    }

    startWebhookServer();
    startReader();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

void bootstrap();