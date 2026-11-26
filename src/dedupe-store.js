const fs = require('fs');
const path = require('path');

function loadSentEvents(filePath, maxEvents) {
  try {
    const keys = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(keys)) return [];
    return keys.slice(-maxEvents);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not load dedupe state: ${error.message}`);
    }
    return [];
  }
}

function saveSentEvents(filePath, keys) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });

  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(keys, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

module.exports = { loadSentEvents, saveSentEvents };
