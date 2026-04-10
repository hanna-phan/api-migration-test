const _ = require('lodash');
const Diff = require('diff');

// Normalize datetime strings: truncate sub-second decimals before comparing
// e.g. "2026-04-08T06:46:48.481615Z" → "2026-04-08T06:46:48Z"
function normalizeTimestamps(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // ISO 8601 datetime with fractional seconds: YYYY-MM-DDTHH:mm:ss.xxxZ or +00:00
    return obj.replace(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d+([Z+-])/g, '$1$2');
  }
  if (Array.isArray(obj)) return obj.map(normalizeTimestamps);
  if (typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = normalizeTimestamps(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Checks if 'actual' matches 'expected' as a subset.
 * 'actual' matches 'expected' if all properties in 'expected' exist and match in 'actual'.
 * 'actual' can have extra keys not present in 'expected'.
 */
function isSubsetMatch(expected, actual, path = 'root') {
  if (expected === actual) return true;

  const typeExpected = Array.isArray(expected) ? 'array' : typeof expected;
  const typeActual = Array.isArray(actual) ? 'array' : typeof actual;

  if (typeExpected !== typeActual) return false;

  if (typeExpected === 'array') {
    if (expected.length !== actual.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (!isSubsetMatch(expected[i], actual[i], `${path}[${i}]`)) return false;
    }
    return true;
  }

  if (typeExpected === 'object' && expected !== null && actual !== null) {
    // Log extra keys that exist in Go but not in PHP
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    const extraKeys = actualKeys.filter(k => !expectedKeys.includes(k));

    if (extraKeys.length > 0) {
      extraKeys.forEach(k => {
        const fullPath = path === 'root' ? k : `${path}.${k}`;
        console.log(`\x1b[33m[Bypass]\x1b[0m Key chỉ có ở Go: \x1b[36m${fullPath}\x1b[0m`);
      });
    }

    for (const key of expectedKeys) {
      if (!Object.prototype.hasOwnProperty.call(actual, key)) return false;
      if (!isSubsetMatch(expected[key], actual[key], path === 'root' ? key : `${path}.${key}`)) return false;
    }
    return true;
  }

  return _.isEqual(expected, actual);
}

/**
 * Returns a version of 'target' that only contains keys present in 'reference'.
 * Useful for generating a "clean" diff when extra keys are ignored.
 */
function filterToSubset(reference, target) {
  if (reference === null || reference === undefined || target === null || target === undefined) return target;

  const typeRef = Array.isArray(reference) ? 'array' : typeof reference;
  const typeTar = Array.isArray(target) ? 'array' : typeof target;

  if (typeRef !== typeTar) return target;

  if (typeRef === 'array') {
    return target.slice(0, reference.length).map((item, i) => filterToSubset(reference[i], item));
  }

  if (typeRef === 'object') {
    const result = {};
    for (const key of Object.keys(reference)) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        result[key] = filterToSubset(reference[key], target[key]);
      }
    }
    return result;
  }

  return target;
}

function formatValue(val) {
  if (val === undefined) return '<i>undefined</i>';
  const str = JSON.stringify(val, null, 2);
  if (str && str.length > 200) {
    return `<details style="display:inline-block; vertical-align:top; background:#f9f9f9; padding:2px 6px; border:1px solid #ccc; border-radius:4px; max-width:100%;"><summary style="cursor:pointer; font-weight:bold; color:#0056b3; outline:none; user-select:none; font-size:12px;">Xem chi tiết (Dữ liệu dài)</summary><pre style="margin:8px 0 0 0; background:#fff; padding:8px; border-radius:4px; overflow-x:auto; max-height:400px; font-size:12px; border:1px solid #eee; color:#333;">${str.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></details>`;
  }
  return `<code style="background:#f4f4f4; padding:2px 4px; border-radius:3px; color:#333; font-size:13px;">${JSON.stringify(val).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
}

function getHumanReadableDiff(oldObj, newObj, path = 'Response root', options = {}) {
  let diffs = [];
  const strict = options.strict || false;

  if (oldObj === newObj) return diffs;

  const typeOld = Array.isArray(oldObj) ? 'array' : typeof oldObj;
  const typeNew = Array.isArray(newObj) ? 'array' : typeof newObj;

  if (oldObj !== undefined && newObj === undefined) {
    diffs.push(`<b>${path}:</b> có (PHP) &rarr; null / missing (Go)`);
    return diffs;
  }

  if (oldObj === undefined && newObj !== undefined) {
    if (strict) {
      diffs.push(`<b>${path}:</b> null / missing (PHP) &rarr; có (Go)<br><span style="color:#005500">Go:</span> ${formatValue(newObj)}`);
    }
    // Else: BYPASS: Key exists in Go but not in PHP - treat as match/ignore
    return diffs;
  }

  // Handle Arrays
  if (typeOld === 'array' && typeNew === 'array') {
    const maxLength = Math.max(oldObj.length, newObj.length);
    for (let i = 0; i < maxLength; i++) {
      const currentPath = `${path}[${i}]`;
      diffs = diffs.concat(getHumanReadableDiff(oldObj[i], newObj[i], currentPath, options));
    }
    return diffs;
  }

  // Handle Objects
  if (typeOld === 'object' && oldObj !== null && newObj !== null && typeOld === typeNew) {
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of keys) {
      const currentPath = path === 'Response root' ? key : `${path}.${key}`;
      diffs = diffs.concat(getHumanReadableDiff(oldObj[key], newObj[key], currentPath, options));
    }
    return diffs;
  }

  // Different types or value changes
  diffs.push(`<b>${path}:</b><br><span style="color:#aa0000">PHP:</span> ${formatValue(oldObj)}<br><span style="color:#005500">Go:</span> ${formatValue(newObj)}`);

  return diffs;
}

function excludeFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => excludeFields(item, fields));

  const newObj = {};
  for (const key of Object.keys(obj)) {
    if (fields.includes(key)) continue;
    newObj[key] = excludeFields(obj[key], fields);
  }
  return newObj;
}

function compareResponses(phpRes, goRes, options = {}) {
  const ignoreFields = options.ignoreFields || [];

  let phpBody = phpRes.body;
  let goBody = goRes.body;

  if (ignoreFields.length > 0) {
    phpBody = excludeFields(phpBody, ignoreFields);
    goBody = excludeFields(goBody, ignoreFields);
  }

  // Normalize datetime values: ignore sub-second decimals (compare up to seconds only)
  phpBody = normalizeTimestamps(phpBody);
  goBody = normalizeTimestamps(goBody);

  const statusMatch = phpRes.statusCode === goRes.statusCode;
  // Check for body match using subset logic (Go can have more keys than PHP) unless strict mode is enabled
  const bodyMatch = options.strict ? _.isEqual(phpBody, goBody) : isSubsetMatch(phpBody, goBody);

  const isMatch = statusMatch && bodyMatch && !phpRes.error && !goRes.error;

  let bodyDiff = null;
  let humanDiff = [];
  if (!bodyMatch && phpBody && goBody) {
    try {
      // For the visual diff, we might still want to see everything, 
      // but let's filter goBody to the subset of PHP to see if there are other differences
      const filteredGoBody = options.strict ? goBody : filterToSubset(phpBody, goBody);
      bodyDiff = Diff.diffJson(phpBody, filteredGoBody);
      humanDiff = getHumanReadableDiff(phpBody, goBody, 'Response root', options);
    } catch (e) {
      // Ignored
    }
  }

  return {
    statusMatch,
    bodyMatch,
    isMatch,
    bodyDiff,
    humanDiff
  };
}

module.exports = { compareResponses };
