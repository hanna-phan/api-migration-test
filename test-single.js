const path = require('path');
const fs = require('fs');
const { parseCollection } = require('./parser');
const { executeRequest } = require('./executor');
const { compareResponses } = require('./comparator');

const COLLECTION_PATH = '/Users/dungqc/.gemini/antigravity/scratch/OneMobile - Mobile API.postman_collection.json';
const CONFIG_PATH = path.join(__dirname, 'config.json');

async function main() {
  const args = process.argv.slice(2);
  const nameArg = args.find(a => a.startsWith('--name='));
  const bodyArg = args.find(a => a.startsWith('--body='));

  if (!nameArg) {
    console.log('Usage: node test-single.js --name="API Name" [--body=\'{"key":"val"}\' OR --body=path/to/body.json]');
    process.exit(1);
  }

  const targetName = nameArg.split('=')[1].toLowerCase();
  let customBody = null;

  if (bodyArg) {
    const bodyVal = bodyArg.split('=')[1];
    if (fs.existsSync(bodyVal)) {
      customBody = fs.readFileSync(bodyVal, 'utf-8');
    } else {
      customBody = bodyVal;
    }
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  const requests = parseCollection(COLLECTION_PATH);
  const req = requests.find(r => r.name.toLowerCase().includes(targetName));

  if (!req) {
    console.error(`No API found matching: "${targetName}"`);
    process.exit(1);
  }

  console.log(`Testing [${req.request.method || 'GET'}] ${req.name}...`);
  
  if (customBody) {
    console.log('Applying custom body override...');
    req.request.body = {
      mode: 'raw',
      raw: customBody
    };
  }

  const [phpRes, goRes] = await Promise.all([
    executeRequest(req.request, config, config.php_base_url, { isPhp: true }),
    executeRequest(req.request, config, config.go_base_url, { isPhp: false })
  ]);

  const comparison = compareResponses(phpRes, goRes, { ignoreFields: config.ignore_fields });

  console.log('\n--- Results ---');
  console.log(`Status: ${comparison.isMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`PHP Status: ${phpRes.statusCode} | Go Status: ${goRes.statusCode}`);

  if (!comparison.statusMatch) console.log('❌ Status Code Mismatch!');
  if (!comparison.bodyMatch) {
    console.log('❌ Response Body Mismatch!');
    if (comparison.humanDiff) comparison.humanDiff.forEach(d => console.log(` - ${d.replace(/<[^>]*>?/gm, '')}`));
  } else {
    console.log('✅ Response Body Matches exactly.');
  }

  console.log('\n--- PHP Response ---');
  console.log(JSON.stringify(phpRes.body, null, 2).substring(0, 500) + '...');
  
  console.log('\n--- Go Response ---');
  console.log(JSON.stringify(goRes.body, null, 2).substring(0, 500) + '...');
}

main().catch(err => console.error('Error:', err));
