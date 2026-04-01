const fs = require('fs');
const { parseCollection } = require('./parser');

function auditBodies(collectionPath) {
  const requests = parseCollection(collectionPath);
  const auditResults = [];

  requests.forEach(req => {
    const method = (req.request.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      let bodyKeys = [];
      let bodyType = 'None';
      let isValidJson = true;
      let rawBody = '';

      if (req.request.body) {
        bodyType = req.request.body.mode;
        if (bodyType === 'raw' && req.request.body.raw) {
          rawBody = req.request.body.raw;
          try {
            // Remove potential JS-style comments before parsing
            const cleaned = rawBody.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
            const parsed = JSON.parse(cleaned);
            bodyKeys = Object.keys(parsed);
          } catch (e) {
            isValidJson = false;
          }
        } else if (bodyType === 'formdata') {
          bodyKeys = req.request.body.formdata.map(f => f.key);
        } else if (bodyType === 'urlencoded') {
          bodyKeys = req.request.body.urlencoded.map(f => f.key);
        }
      }

      auditResults.push({
        name: req.name,
        method,
        path: req.folderPath,
        bodyType,
        isValidJson,
        keys: bodyKeys
      });
    }
  });

  return auditResults;
}

// If run directly
if (require.main === module) {
  const path = require('path');
  const collectionPath = path.join(__dirname, '..', 'OneMobile - Mobile API.postman_collection.json');
  
  console.log('--- Body Parameter Audit ---');
  const results = auditBodies(collectionPath);
  
  results.forEach(r => {
    console.log(`\n[${r.method}] ${r.path} / ${r.name}`);
    console.log(`  Mode: ${r.bodyType}`);
    console.log(`  Valid JSON: ${r.isValidJson ? '✅' : '❌'}`);
    if (r.keys.length > 0) {
      console.log(`  Params: ${r.keys.join(', ')}`);
    } else {
      console.log('  Params: None discovered');
    }
  });
}

module.exports = { auditBodies };
