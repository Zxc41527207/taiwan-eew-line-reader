require('dotenv').config();

const http = require('http');
const { createHmac } = require('crypto');
const {
  formatLineMessage,
  getEventKey,
  parseTaiwanEew
} = require('./eew');

const initializationUrl = process.env.INITIALIZATION_URL || 'https://twearthquake.com/api/web/initialization';
const locationCode = process.env.EEW_LOCATION_CODE || 'Taipei';
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS) || 2_000;
const requestTimeoutMs = 1_500;
const signatureKey = 'Copyrights-2024-2025,-Chang-Yu-Hsi.-All-rights-reserved.';
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const lineTo = process.env.LINE_TO;
const maxRememberedEvents = 1_000;
const sentEvents = new Set();
const eventsBeingSent = new Set();

function validateConfig() {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');
  if (!lineTo) throw new Error('LINE_TO is required');

  const parsedUrl = new URL(initializationUrl);
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('INITIALIZATION_URL must use https://');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(locationCode)) {
    throw new Error('EEW_LOCATION_CODE must contain only letters, numbers, underscores, or hyphens');
  }
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 2_000) {
    throw new Error('POLL_INTERVAL_MS must be at least 2000');
  }
}

async function pushLineMessage(text) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${channelAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: lineTo,
          messages: [{ type: 'text', text }]
        }),
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

function rememberEvent(key) {
  sentEvents.add(key);
  if (sentEvents.size > maxRememberedEvents) {
    const oldestKey = sentEvents.values().next().value;
    sentEvents.delete(oldestKey);
  }
}

async function handleApiResponse(packet) {
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

async function fetchInitializationUrl() {
  const response = await fetch(initializationUrl, {
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'User-Agent': 'Mozilla/5.0 (compatible; Taiwan-EEW-Line-Reader/1.0)',
      Referer: 'https://twearthquake.com/',
      Origin: 'https://twearthquake.com'
    },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new Error(`Initialization API returned ${response.status}`);
  }

  const initialization = await response.json();
  if (typeof initialization.url !== 'string') {
    throw new Error('Initialization API did not provide an EEW URL');
  }

  const apiUrl = new URL(initialization.url);
  if (apiUrl.protocol !== 'https:') {
    throw new Error('Initialization API returned a non-HTTPS EEW URL');
  }
  return apiUrl.toString().replace(/\/+$/, '');
}

function createApiHeaders() {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const signature = createHmac('sha256', signatureKey).update(timestamp).digest('hex');
  return {
    Accept: 'application/json,text/plain,*/*',
    'User-Agent': 'Mozilla/5.0 (compatible; Taiwan-EEW-Line-Reader/1.0)',
    Referer: 'https://twearthquake.com/',
    'TWEarthquake-Timestamp': timestamp,
    'TWEarthquake-Token-Sign': signature
  };
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
            if (event.source?.type === 'group') {
              console.log(`LINE group ID: ${event.source.groupId}`);
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
  let stopping = false;
  const shutdown = () => {
    stopping = true;
    console.log('Shutting down');
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const poll = async () => {
    let apiUrl;
    console.log(`Using TWEarthquake API for ${locationCode}; polling every ${pollIntervalMs} ms`);

    while (!stopping) {
      const requestStartedAt = Date.now();
      try {
        if (!apiUrl) apiUrl = await fetchInitializationUrl();

        const response = await fetch(`${apiUrl}/${encodeURIComponent(locationCode)}`, {
          headers: createApiHeaders(),
          signal: AbortSignal.timeout(requestTimeoutMs)
        });
        if (!response.ok) throw new Error(`EEW API returned ${response.status}`);
        await handleApiResponse(await response.json());
      } catch (error) {
        console.error('TWEarthquake polling error:', error.message);
      }

      const delay = Math.max(0, pollIntervalMs - (Date.now() - requestStartedAt));
      if (!stopping && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  void poll();
}

try {
  validateConfig();
  startWebhookServer();
  startReader();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}