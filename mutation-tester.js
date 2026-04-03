const path = require('path');
const fs = require('fs');
const { parseCollection } = require('./parser');
const { executeRequest } = require('./executor');
const { cleanJsonComments } = require('./utils');
const { generateMutationReport } = require('./reporter');
const { compareResponses } = require('./comparator');

const COLLECTION_PATH = '/Users/dungqc/.gemini/antigravity/scratch/OneMobile - Mobile API.postman_collection.json';
const CONFIG_PATH = path.join(__dirname, 'config.json');

async function main() {
  const args = process.argv.slice(2);
  const nameFilter = args.find(a => a.startsWith('--name='))?.split('=')[1]?.toLowerCase();

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Missing config.json!');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  const allRequests = parseCollection(COLLECTION_PATH);
  let targets = allRequests.filter(req => {
    const method = (req.request.method || 'GET').toUpperCase();
    return ['POST', 'PUT', 'DELETE'].includes(method) && req.request.body && req.request.body.mode === 'raw';
  });

  if (nameFilter) {
    targets = targets.filter(t => t.name.toLowerCase().includes(nameFilter));
  }

  console.log(`--- Automated Mutation Testing ---`);
  console.log(`Targets: ${targets.length} APIs\n`);

  const mutationResults = [];

  for (const target of targets) {
    console.log(`\nTesting API: [${target.request.method}] ${target.name}`);
    
    const apiResult = {
      name: target.name,
      method: target.request.method,
      testResults: []
    };
    let baseBody = {};
    try {
      baseBody = JSON.parse(cleanJsonComments(target.request.body.raw));
    } catch(e) {
      console.warn(`  ⚠️ Could not parse raw body for ${target.name}. Skipping automated variations.`);
      continue;
    }

    const testCases = generateTestCases(baseBody);
    console.log(`  Generated ${testCases.length} test cases (Success + Negative Variations).`);

    for (const testCase of testCases) {
      const modifiedRequest = {
        ...target.request,
        body: {
          mode: 'raw',
          raw: JSON.stringify(testCase.body)
        }
      };

      const [phpRes, goRes] = await Promise.all([
        executeRequest(modifiedRequest, config, config.php_base_url, { isPhp: true }),
        executeRequest(modifiedRequest, config, config.go_base_url, { isPhp: false })
      ]);

      const comparison = compareResponses(phpRes, goRes, { ignoreFields: config.ignore_fields });

      if (comparison.isMatch) {
         process.stdout.write('✅ ');
      } else {
         process.stdout.write('❌ ');
      }

      apiResult.testResults.push({
        type: testCase.type,
        field: testCase.field,
        phpStatus: phpRes.statusCode,
        goStatus: goRes.statusCode,
        statusMatch: comparison.statusMatch,
        bodyMatch: comparison.bodyMatch,
        humanDiff: comparison.humanDiff,
        requestBody: testCase.body,
        phpBody: phpRes.body,
        goBody: goRes.body
      });
    }
    const passed = apiResult.testResults.filter(t => t.statusMatch && t.bodyMatch).length;
    process.stdout.write(`  [${passed}/${apiResult.testResults.length} Passed]\n`);
    mutationResults.push(apiResult);
  }

  const REPORT_PATH = path.join(__dirname, 'mutation-report.html');
  await generateMutationReport(mutationResults, REPORT_PATH);
}

function generateTestCases(baseBody) {
  const cases = [];

  // 1. Success Path
  cases.push({ type: 'SUCCESS', field: null, body: baseBody });

  const keys = Object.keys(baseBody);

  // 2. Missing Fields
  keys.forEach(key => {
    const newBody = { ...baseBody };
    delete newBody[key];
    cases.push({ type: 'MISSING', field: key, body: newBody });
  });

  // 3. Explicit NULL
  keys.forEach(key => {
    if (baseBody[key] !== null) {
      const newBody = { ...baseBody, [key]: null };
      cases.push({ type: 'EXPLICIT_NULL', field: key, body: newBody });
    }
  });

  // 4. Type Mismatch
  keys.forEach(key => {
    const val = baseBody[key];
    let newVal;
    if (typeof val === 'string') newVal = 12345;
    else if (typeof val === 'number') newVal = "invalid_string";
    else if (typeof val === 'boolean') newVal = "not_a_bool";
    else if (Array.isArray(val)) newVal = { not: "an_array" };
    else newVal = "unexpected_type";

    const newBody = { ...baseBody, [key]: newVal };
    cases.push({ type: 'TYPE_MISMATCH', field: key, body: newBody });
  });

  // 5. Boundary / Edge Values (Numeric & String)
  keys.forEach(key => {
    const val = baseBody[key];
    if (typeof val === 'number') {
      [0, -1, 2147483647, 9007199254740991].forEach(edge => {
        if (val !== edge) {
          cases.push({ type: 'BOUNDARY_VALUE', field: `${key}=${edge}`, body: { ...baseBody, [key]: edge } });
        }
      });
    } else if (typeof val === 'string') {
      const longStr = 'A'.repeat(2000);
      cases.push({ type: 'BOUNDARY_VALUE', field: `${key}=LongStr`, body: { ...baseBody, [key]: longStr } });
    }
  });

  // 6. Format Validation (Inferred)
  keys.forEach(key => {
    const keyLower = key.toLowerCase();
    if (keyLower.includes('email')) {
      cases.push({ type: 'BAD_FORMAT', field: `${key}=invalid_email`, body: { ...baseBody, [key]: "not-an-email" } });
    }
    if (keyLower.includes('date') || keyLower.includes('_at')) {
      cases.push({ type: 'BAD_FORMAT', field: `${key}=invalid_date`, body: { ...baseBody, [key]: "2024-99-99 88:88:88" } });
    }
    if (keyLower.includes('id') && typeof baseBody[key] === 'string' && baseBody[key].length > 20) {
      // Possible UUID/Hash
      cases.push({ type: 'BAD_FORMAT', field: `${key}=invalid_id`, body: { ...baseBody, [key]: "short-id" } });
    }
  });

  // 7. Empty / Whitespace
  keys.forEach(key => {
    if (typeof baseBody[key] === 'string') {
      cases.push({ type: 'EMPTY_VAL', field: `${key}=empty`, body: { ...baseBody, [key]: "" } });
      cases.push({ type: 'EMPTY_VAL', field: `${key}=whitespace`, body: { ...baseBody, [key]: "   " } });
    }
  });

  // 8. Extra Field
  const extraBody = { ...baseBody, "__unexpected_field__": "security_test_payload" };
  cases.push({ type: 'EXTRA_FIELD', field: "__unexpected_field__", body: extraBody });

  return cases;
}

main().catch(err => console.error('Critical Error:', err));
