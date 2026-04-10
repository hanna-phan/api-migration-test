const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { processRequestObject, cleanJsonComments, generateAuthVariables } = require('./utils');

async function executeRequest(reqData, envConfig, targetBaseUrl, options = {}) {
  // Generate dynamic auth variables
  const dynamicVars = generateAuthVariables(envConfig.variables.om_secret || 'om-secret');

  // Ensure the base url variables point to the target server
  const variables = {
    ...envConfig.variables,
    ...dynamicVars,
    base_url: targetBaseUrl,
    new_url: targetBaseUrl,
    localhost: targetBaseUrl
  };

  const finalReq = processRequestObject(reqData, variables);

  const method = (finalReq.method || 'GET').toUpperCase();

  let url = '';
  if (typeof finalReq.url === 'string') {
    url = finalReq.url;
  } else if (finalReq.url && finalReq.url.raw) {
    url = finalReq.url.raw;
  }

  if (!url) {
    return { url: 'Unknown', method, error: 'Invalid URL object in Postman request' };
  }

  // Conditionally override or add is_testing parameter based on target
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('is_testing', options.isPhp ? '1' : 'true');
    url = parsedUrl.toString();
  } catch (e) {
    // If invalid URL structure (e.g. lacks protocol), fallback check
    if (!url.includes('is_testing=')) {
      url += (url.includes('?') ? '&' : '?') + (options.isPhp ? 'is_testing=1' : 'is_testing=true');
    }
  }

  // Clean off any remaining query bindings if it's mangled, though axios handles well
  let headers = {};
  if (Array.isArray(finalReq.header)) {
    finalReq.header.forEach(h => {
      if (!h.disabled && h.key) {
        headers[h.key] = h.value;
      }
    });
  }

  // FORCE UPSERT HEADERS as requested
  headers['om-device-token'] = '123';

  let data = undefined;
  if (finalReq.body) {
    if (finalReq.body.mode === 'raw' && finalReq.body.raw) {
      let rawStr = finalReq.body.raw;
      
      // Auto-set Content-Type if it's JSON
      const isJsonOption = finalReq.body.options && 
                           finalReq.body.options.raw && 
                           finalReq.body.options.raw.language === 'json';
      
      const looksLikeJson = rawStr.trim().startsWith('{') || rawStr.trim().startsWith('[');
      
      if ((isJsonOption || looksLikeJson) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      // Attempt to strip comments if it's application/json
      if (headers['Content-Type'] && headers['Content-Type'].includes('json')) {
        rawStr = cleanJsonComments(rawStr);
      }
      data = rawStr;
    } else if (finalReq.body.mode === 'formdata' && Array.isArray(finalReq.body.formdata)) {
      const form = new FormData();
      finalReq.body.formdata.forEach(item => {
        if (item.disabled) return;
        if (item.type === 'file') {
          if (item.src && fs.existsSync(item.src)) {
            form.append(item.key, fs.createReadStream(item.src));
          } else {
            // Fallback for missing file: use a dummy buffer
            form.append(item.key, Buffer.from('dummy-file-content'), { filename: 'dummy.txt' });
          }
        } else {
          form.append(item.key, item.value || '');
        }
      });
      data = form;
      // Axios needs the form headers (especially boundary)
      headers = { ...headers, ...form.getHeaders() };
    }
  }

  const startTime = Date.now();
  let responseCode = null;
  let responseBody = null;
  let responseHeaders = null;
  let errorMsg = null;

  try {
    const response = await axios({
      method,
      url,
      headers,
      data,
      timeout: 15000,
      validateStatus: () => true // Allow all status codes (even 4xx/5xx) so we can compare them
    });
    responseCode = response.status;
    responseBody = response.data;
    responseHeaders = response.headers;
  } catch (err) {
    errorMsg = err.message;
  }

  const duration = Date.now() - startTime;

  let requestParams = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((v, k) => { requestParams[k] = v; });
  } catch (e) { }

  return {
    url,
    method,
    requestHeaders: headers,
    requestParams,
    requestData: data,
    statusCode: responseCode,
    body: responseBody,
    headers: responseHeaders,
    duration,
    error: errorMsg
  };
}

module.exports = { executeRequest };
