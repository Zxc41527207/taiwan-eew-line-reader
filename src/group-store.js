const fs = require('fs');
const path = require('path');

function loadGroupIds(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not load LINE group state: ${error.message}`);
    }
    return [];
  }
}

function saveGroupIds(filePath, groupIds) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });

  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(groupIds, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

module.exports = { loadGroupIds, saveGroupIds };
