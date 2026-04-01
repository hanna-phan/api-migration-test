const fs = require('fs');

function parseCollection(filePath) {
  const fileData = fs.readFileSync(filePath, 'utf-8');
  const collection = JSON.parse(fileData);
  const requests = [];

  function extractRequests(items, path = []) {
    for (const item of items) {
      if (item.item) {
        // It's a folder
        extractRequests(item.item, [...path, item.name]);
      } else if (item.request) {
        // It's an endpoint
        requests.push({
          name: item.name,
          folderPath: path.join(' / '),
          request: item.request
        });
      }
    }
  }

  if (collection.item) {
    extractRequests(collection.item);
  }

  return requests;
}

module.exports = { parseCollection };
