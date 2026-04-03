const { parseCollection } = require('./parser');
const path = require('path');

const COLLECTION_PATH = '/Users/dungqc/.gemini/antigravity/scratch/OneMobile - Mobile API.postman_collection.json';

function listMutations() {
  const requests = parseCollection(COLLECTION_PATH);
  const mutations = requests.filter(req => {
    const method = (req.request.method || 'GET').toUpperCase();
    return ['POST', 'PUT', 'DELETE'].includes(method);
  });

  console.log(`Found ${mutations.length} total mutation APIs (POST, PUT, DELETE):\n`);
  
  mutations.forEach((req, index) => {
    const method = (req.request.method || 'GET').toUpperCase();
    console.log(`${index + 1}. [${method}] ${req.folderPath ? req.folderPath + ' / ' : ''}${req.name}`);
  });
}

listMutations();
