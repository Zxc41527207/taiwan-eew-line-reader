const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function initializeStore() {
  if (!process.env.DATABASE_URL) return false;

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS line_groups (
      group_id TEXT PRIMARY KEY,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sent_events (
      event_key TEXT PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  return true;
}

async function loadGroupIds() {
  if (!process.env.DATABASE_URL) return [];

  const result = await getPool().query('SELECT group_id FROM line_groups ORDER BY joined_at');
  return result.rows.map(row => row.group_id);
}

async function addGroupId(groupId) {
  if (!process.env.DATABASE_URL) return;

  await getPool().query(
    'INSERT INTO line_groups (group_id) VALUES ($1) ON CONFLICT (group_id) DO NOTHING',
    [groupId]
  );
}

async function removeGroupId(groupId) {
  if (!process.env.DATABASE_URL) return;

  await getPool().query('DELETE FROM line_groups WHERE group_id = $1', [groupId]);
}

async function hasSentEvent(eventKey) {
  if (!process.env.DATABASE_URL) return false;

  const result = await getPool().query(
    'SELECT 1 FROM sent_events WHERE event_key = $1 LIMIT 1',
    [eventKey]
  );
  return result.rowCount > 0;
}

async function rememberSentEvent(eventKey) {
  if (!process.env.DATABASE_URL) return;

  await getPool().query(
    'INSERT INTO sent_events (event_key) VALUES ($1) ON CONFLICT (event_key) DO NOTHING',
    [eventKey]
  );
}

module.exports = {
  initializeStore,
  loadGroupIds,
  addGroupId,
  removeGroupId,
  hasSentEvent,
  rememberSentEvent
};
