const path = require('path');
const fs = require('fs');
const { parseCollection } = require('./parser');
const { executeRequest } = require('./executor');
const { compareResponses } = require('./comparator');
const { generateReport } = require('./reporter');

const COLLECTION_PATH = '/Users/phuongdung/Downloads/api-migration-test-main/OneMobile - Mobile API.postman_collection.json';
const CONFIG_PATH = path.join(__dirname, 'config.json');
const REPORT_PATH = path.join(__dirname, 'report.html');

// We also save raw JSON test results for deep inspection if needed
const RAW_JSON_REPORT_PATH = path.join(__dirname, 'raw_results.json');

async function main() {
  console.log('--- API Migration Test Automation ---');
  
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json! Please configure URLs appropriately.');
    process.exit(1);
  }
  
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log('Configuration loaded.\n');
  
  if (!fs.existsSync(COLLECTION_PATH)) {
    console.error(`Collection not found at ${COLLECTION_PATH}`);
    process.exit(1);
  }
  
  let requests = parseCollection(COLLECTION_PATH);
  
  // SUPPORT FILTERING VIA COMMAND LINE
  const filter = process.argv[2];
  if (filter) {
    const search = filter.toLowerCase();
    requests = requests.filter(r => 
      r.name.toLowerCase().includes(search) || 
      r.folderPath.toLowerCase().includes(search)
    );
    console.log(`Filter applied: "${filter}"`);
  }
  
  console.log(`Parsed ${requests.length} requests from Postman collection.\n`);
  
  if (requests.length === 0) {
    console.warn('No requests found matching your filter!');
    process.exit(0);
  }
  
  const results = [];
  
  let i = 1;
  for (const req of requests) {
    console.log(`[${i}/${requests.length}] Testing [${req.request.method || 'GET'}] ${req.name}...`);
    
    // Send to PHP and GO concurrently
    const [phpRes, goRes] = await Promise.all([
      executeRequest(req.request, config, config.php_base_url, { isPhp: true }),
      executeRequest(req.request, config, config.go_base_url, { isPhp: false })
    ]);
    
    const comparison = compareResponses(phpRes, goRes);
    
    results.push({
      name: req.name,
      folderPath: req.folderPath,
      method: req.request.method || 'GET',
      php: phpRes,
      go: goRes,
      ...comparison
    });
    
    i++;
  }
  
  console.log('\nGenerating final report...');
  
  fs.writeFileSync(RAW_JSON_REPORT_PATH, JSON.stringify(results, null, 2));
  await generateReport(results, REPORT_PATH);
  
  const passed = results.filter(r => r.isMatch).length;
  console.log(`\nCompleted! ${passed}/${requests.length} exact matches.`);
  console.log(`Open ${REPORT_PATH} in your browser to view the detailed results.`);
}

main().catch(err => {
  console.error('Critical Error:', err);
});
