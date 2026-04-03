const { parseCollection } = require('./parser');
const path = require('path');

const COLLECTION_PATH = '/Users/dungqc/.gemini/antigravity/scratch/OneMobile - Mobile API.postman_collection.json';

function showMutationBodies() {
  const requests = parseCollection(COLLECTION_PATH);
  const mutations = requests.filter(req => {
    const method = (req.request.method || 'GET').toUpperCase();
    return ['POST', 'PUT', 'DELETE'].includes(method);
  });

  console.log(`--- Mutation API Bodies ---\n`);
  
  mutations.forEach((req, index) => {
    const method = (req.request.method || 'GET').toUpperCase();
    console.log(`\n${index + 1}. [${method}] ${req.folderPath ? req.folderPath + ' / ' : ''}${req.name}`);
    
    const body = req.request.body;
    if (!body) {
      console.log('   Body: None');
    } else {
      console.log(`   Mode: ${body.mode}`);
      if (body.mode === 'raw') {
        console.log('   Content:');
        console.log(body.raw.split('\n').map(line => '     ' + line).join('\n'));
      } else if (body.mode === 'formdata') {
        console.log('   Params:');
        body.formdata.forEach(f => console.log(`     ${f.key}: ${f.value} (${f.type})`));
      } else if (body.mode === 'urlencoded') {
        console.log('   Params:');
        body.urlencoded.forEach(f => console.log(`     ${f.key}: ${f.value}`));
      }
    }
  });
}

showMutationBodies();
