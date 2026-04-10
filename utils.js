const crypto = require('crypto');

function generateAuthVariables(secret = 'om-secret') {
  const timestamp = Date.now().toString();
  // Node.js equivalent of btoa() is Buffer.from().toString('base64')
  const secretEncodedBase64 = Buffer.from(secret).toString('base64');
  const keyEncodedBase64 = Buffer.from(secretEncodedBase64).toString('base64');
  const queryStringData = `secret=${secretEncodedBase64}&timestamp=${timestamp}`;
  
  const hmacDigest = crypto
    .createHmac('sha256', keyEncodedBase64)
    .update(queryStringData)
    .digest('hex');

  return {
    timestamp,
    om_hmac: hmacDigest,
    om_bundle_id: 'io.onemobile.preview.development'
  };
}

function replaceVariables(str, variables) {
  if (typeof str !== 'string') return str;
  // Replace {{var}} syntax
  let res = str.replace(/{{\s*([\w_-]+)\s*}}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
  return res;
}

function processRequestObject(reqObj, variables) {
  if (typeof reqObj === 'string') {
    return replaceVariables(reqObj, variables);
  }
  if (Array.isArray(reqObj)) {
    return reqObj.map(item => processRequestObject(item, variables));
  }
  if (reqObj !== null && typeof reqObj === 'object') {
    const newObj = {};
    for (const key of Object.keys(reqObj)) {
      newObj[key] = processRequestObject(reqObj[key], variables);
    }
    return newObj;
  }
  return reqObj;
}

// Special JSON cleaning function to strip simple // comments often found in Postman raw JSON bodies
function cleanJsonComments(jsonStr) {
  if (typeof jsonStr !== 'string') return jsonStr;
  return jsonStr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

module.exports = { replaceVariables, processRequestObject, cleanJsonComments, generateAuthVariables };
