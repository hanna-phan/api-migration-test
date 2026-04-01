const _ = require('lodash');
const Diff = require('diff');

function formatValue(val) {
  if (val === undefined) return '<i>undefined</i>';
  const str = JSON.stringify(val, null, 2);
  if (str && str.length > 200) {
    return `<details style="display:inline-block; vertical-align:top; background:#f9f9f9; padding:2px 6px; border:1px solid #ccc; border-radius:4px; max-width:100%;"><summary style="cursor:pointer; font-weight:bold; color:#0056b3; outline:none; user-select:none; font-size:12px;">Xem chi tiết (Dữ liệu dài)</summary><pre style="margin:8px 0 0 0; background:#fff; padding:8px; border-radius:4px; overflow-x:auto; max-height:400px; font-size:12px; border:1px solid #eee; color:#333;">${str.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></details>`;
  }
  return `<code style="background:#f4f4f4; padding:2px 4px; border-radius:3px; color:#333; font-size:13px;">${JSON.stringify(val).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
}

function getHumanReadableDiff(oldObj, newObj, path = 'Response root') {
  let diffs = [];

  if (oldObj === newObj) return diffs;

  const typeOld = Array.isArray(oldObj) ? 'array' : typeof oldObj;
  const typeNew = Array.isArray(newObj) ? 'array' : typeof newObj;

  if (oldObj !== undefined && newObj === undefined) {
    diffs.push(`<b>${path}:</b> có (PHP) &rarr; null / missing (Go)`);
    return diffs;
  }

  if (oldObj === undefined && newObj !== undefined) {
    diffs.push(`<b>${path}:</b> null / missing (PHP) &rarr; có (Go)<br><span style="color:#005500">Go:</span> ${formatValue(newObj)}`);
    return diffs;
  }

  // Handle Arrays
  if (typeOld === 'array' && typeNew === 'array') {
    const maxLength = Math.max(oldObj.length, newObj.length);
    for (let i = 0; i < maxLength; i++) {
      const currentPath = `${path}[${i}]`;
      diffs = diffs.concat(getHumanReadableDiff(oldObj[i], newObj[i], currentPath));
    }
    return diffs;
  }

  // Handle Objects
  if (typeOld === 'object' && oldObj !== null && newObj !== null && typeOld === typeNew) {
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    for (const key of keys) {
      const currentPath = path === 'Response root' ? key : `${path}.${key}`;
      diffs = diffs.concat(getHumanReadableDiff(oldObj[key], newObj[key], currentPath));
    }
    return diffs;
  }

  // Different types or value changes
  diffs.push(`<b>${path}:</b><br><span style="color:#aa0000">PHP:</span> ${formatValue(oldObj)}<br><span style="color:#005500">Go:</span> ${formatValue(newObj)}`);

  return diffs;
}

function compareResponses(phpRes, goRes) {
  const statusMatch = phpRes.statusCode === goRes.statusCode;
  const bodyMatch = _.isEqual(phpRes.body, goRes.body);

  const isMatch = statusMatch && bodyMatch && !phpRes.error && !goRes.error;

  let bodyDiff = null;
  let humanDiff = [];
  if (!bodyMatch && phpRes.body && goRes.body) {
    try {
      bodyDiff = Diff.diffJson(phpRes.body, goRes.body);
      humanDiff = getHumanReadableDiff(phpRes.body, goRes.body);
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
