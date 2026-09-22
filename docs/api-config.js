/**
 * docsichat API config plugin for Docsify v5.
 *
 * - Settings form (API Endpoint + API Key) injected on the Configuration page.
 * - Values persist in localStorage (`docsichat:api:*`).
 * - Any docs page can render saved values with:
 *     <span class="api-config" data-field="endpoint"></span>
 *     <span class="api-config" data-field="key"></span>
 *   The API key renders with its first 10 characters followed by a mask; the full key is never shown.
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'docsichat:api:';
  var FIELDS = ['endpoint', 'key'];
  var MASK = '••••••••';
  var PREVIEW_LEN = 10;
  var ENDPOINT_PREVIEW_LEN = 44;

  function get(field) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + field) || '';
    } catch (e) {
      return '';
    }
  }

  function set(field, value) {
    try {
      if (value) {
        localStorage.setItem(STORAGE_PREFIX + field, value);
      } else {
        localStorage.removeItem(STORAGE_PREFIX + field);
      }
    } catch (e) {
      /* storage unavailable (private mode etc.) */
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function previewKey(value) {
    // Short keys reveal nothing; longer keys show only the first PREVIEW_LEN chars.
    return value.length > PREVIEW_LEN
      ? escapeHtml(value.slice(0, PREVIEW_LEN)) + MASK
      : MASK;
  }

  function middleTruncate(value, max) {
    if (value.length <= max) return value;
    var keep = Math.floor((max - 1) / 2);
    return value.slice(0, keep) + '…' + value.slice(-keep);
  }

  function renderValue(field) {
    var value = get(field);
    if (!value) {
      return '<em class="api-config-empty">not set</em>';
    }
    if (field === 'key') return previewKey(value);
    var truncated = middleTruncate(value, ENDPOINT_PREVIEW_LEN);
    return truncated === value
      ? escapeHtml(value)
      : '<span title="' + escapeHtml(value) + '">' + escapeHtml(truncated) + '</span>';
  }

  function refreshPlaceholders(root) {
    var nodes = (root || document).querySelectorAll('.api-config[data-field]');
    Array.prototype.forEach.call(nodes, function (node) {
      var field = node.getAttribute('data-field');
      if (FIELDS.indexOf(field) === -1) return;
      node.innerHTML = renderValue(field);
    });
  }

  function formHtml() {
    var endpoint = get('endpoint');
    var hasKey = Boolean(get('key'));
    var hasAny = Boolean(endpoint) || hasKey;
    var endpointPreview = middleTruncate(endpoint, ENDPOINT_PREVIEW_LEN);
    return (
      '<form class="api-config-form">' +
      '<label for="api-config-endpoint">API Endpoint</label>' +
      '<input id="api-config-endpoint" name="endpoint" type="text" ' +
      'placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" ' +
      'value="' + escapeHtml(endpointPreview) + '"' +
      (endpointPreview !== endpoint ? ' data-preview="endpoint"' : '') + '>' +
      '<p class="api-config-hint" hidden></p>' +
      '<label for="api-config-key">API Key</label>' +
      '<input id="api-config-key" name="key" type="password" ' +
      'autocomplete="new-password" spellcheck="false" placeholder="' +
      (hasKey ? previewKey(get('key')) + ' (saved — type to replace)' : 'paste your API key') + '">' +
      '<div class="api-config-actions">' +
      '<button type="submit">Save</button>' +
      (hasAny ? '<button type="button" class="api-config-clear">Clear</button>' : '') +
      '<button type="button" class="api-config-test">Test connection</button>' +
      '</div>' +
      '<p class="api-config-status" role="status"></p>' +
      '</form>'
    );
  }

  function mountForm(container) {
    container.innerHTML = formHtml();

    var endpointInput = container.querySelector('#api-config-endpoint');
    // Long URLs: input renders a begin…end preview until focused; editing keeps the typed text.
    if (endpointInput) {
      endpointInput.addEventListener('focus', function () {
        if (endpointInput.hasAttribute('data-preview')) {
          endpointInput.value = get('endpoint');
        }
        endpointInput.removeAttribute('data-preview');
      });
      endpointInput.addEventListener('input', function () {
        endpointInput.removeAttribute('data-preview');
      });
      endpointInput.addEventListener('blur', function () {
        // Focused-but-untouched: collapse back to the preview on blur.
        var stored = get('endpoint');
        if (endpointInput.value === stored) {
          var preview = middleTruncate(stored, ENDPOINT_PREVIEW_LEN);
          endpointInput.value = preview;
          if (preview !== stored) endpointInput.setAttribute('data-preview', 'endpoint');
        }
      });
    }

    var clearBtn = container.querySelector('.api-config-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        set('key', '');
        set('endpoint', '');
        mountForm(container);
        refreshPlaceholders(document);
        container.querySelector('.api-config-status').textContent = 'Saved values cleared.';
      });
    }

    var form = container.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var keyInput = container.querySelector('#api-config-key');

      // Untouched preview input keeps the stored URL; any typed value replaces it.
      var endpointValue = endpointInput.hasAttribute('data-preview')
        ? get('endpoint')
        : endpointInput.value;
      set('endpoint', normalizeEndpoint(endpointValue.trim()));
      // Empty key field keeps the existing key; typing replaces it.
      if (keyInput.value) {
        set('key', keyInput.value);
        keyInput.value = '';
      }

      // Re-mount so placeholders and the key field state reflect saved values.
      mountForm(container);
      refreshPlaceholders(document);
      container.querySelector('.api-config-status').textContent =
        'Saved locally. Only the first 10 characters of the API key are ever displayed.';
    });

    var testBtn = container.querySelector('.api-config-test');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var endpoint = get('endpoint');
        var key = get('key');
        var status = container.querySelector('.api-config-status');
        if (!endpoint || !key) {
          status.textContent = 'Save an endpoint and API key first — the test uses the saved values.';
          return;
        }
        testBtn.disabled = true;
        testBtn.textContent = 'Testing…';
        checkConnection(endpoint, key, function (result) {
          testBtn.disabled = false;
          testBtn.textContent = 'Test connection';
          status.textContent = result.ok
            ? 'Connected — ' + result.models.length + ' model(s) at ' + normalizeEndpoint(endpoint) + '.'
            : 'Connection failed: ' + result.reason;
        });
      });
    }
  }

  function shellEscape(value) {
    // Escape for a double-quoted shell argument.
    return String(value).replace(/[\\"$`]/g, '\\$&');
  }

  function modelsUrl(endpoint) {
    return normalizeEndpoint(endpoint).replace(/\/+$/, '') + '/models';
  }

  function curlCommand(keyValue) {
    return (
      'curl -sS "' + shellEscape(modelsUrl(get('endpoint'))) + '" \\\n' +
      '  -H "Authorization: Bearer ' + shellEscape(keyValue) + '"'
    );
  }

  function fallbackCopy(text, done) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* clipboard unavailable */ }
    document.body.removeChild(textarea);
  }

  function mountCurl(container) {
    var endpoint = get('endpoint');
    var key = get('key');
    if (!endpoint || !key) {
      container.innerHTML =
        '<p class="api-config-empty">Set your <a href="#/configuration">API Endpoint and API Key</a> first — the command needs both.</p>';
      return;
    }
    // Displayed command masks the key; the copy button builds the real command from storage.
    container.innerHTML =
      '<pre class="api-curl-pre"><code>' + escapeHtml(curlCommand(key.slice(0, PREVIEW_LEN) + MASK)) + '</code></pre>' +
      '<button type="button" class="api-curl-copy">Copy command</button>' +
      '<p class="api-config-status" role="status"></p>';

    container.querySelector('.api-curl-copy').addEventListener('click', function () {
      var status = container.querySelector('.api-config-status');
      var full = curlCommand(key);
      var done = function () {
        status.textContent = 'Copied — the clipboard contains your full API key.';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(full).then(done, function () { fallbackCopy(full, done); });
      } else {
        fallbackCopy(full, done);
      }
    });
  }

  function formatModelError(error) {
    var reason = error && error.message ? error.message : String(error);
    return '<p class="api-config-empty">Request failed: ' + escapeHtml(reason) + '</p>';
  }

  function extractModels(payload) {
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.models)) return payload.models;
    return null;
  }

  function normalizeEndpoint(endpoint) {
    // OpenAI-compatible base URLs include a path segment (e.g. /v1). Bare hosts
    // get /v1 appended; endpoints with any other path are preserved as-is.
    var trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!trimmed) return trimmed;
    return trimmed.indexOf('/', trimmed.indexOf('//') + 2) === -1 ? trimmed + '/v1' : trimmed;
  }

  function checkConnection(endpoint, key, done) {
    fetch(modelsUrl(normalizeEndpoint(endpoint)), {
      headers: { Authorization: 'Bearer ' + key }
    })
      .then(function (response) {
        return response.text().then(function (text) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status + ' ' + response.statusText + (text ? ' — ' + text.slice(0, 200) : ''));
          }
          var payload;
          try { payload = JSON.parse(text); } catch (e) { throw new Error('Non-JSON response: ' + text.slice(0, 200)); }
          return { httpStatus: response.status, models: extractModels(payload) || [] };
        });
      })
      .then(function (result) {
        done({ ok: true, httpStatus: result.httpStatus, models: result.models });
      })
      .catch(function (error) {
        var reason = error && error.message ? error.message : String(error);
        if (error instanceof TypeError) {
          reason = 'Failed to fetch — network or CORS blocked';
        }
        done({ ok: false, reason: reason });
      });
  }

  function chatCompletionUrl(endpoint) {
    return normalizeEndpoint(endpoint).replace(/\/+$/, '') + '/chat/completions';
  }

  function normalizeModelId(model) {
    if (typeof model !== 'string' || model.indexOf('/') === -1) return model;
    return model.slice(model.lastIndexOf('/') + 1);
  }

  function renderModelRetry(container, selectEl, endpoint, key) {
    var parent = selectEl.parentNode;
    if (!parent) return;
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'api-models-retry';
    retry.textContent = 'Retry';
    parent.insertBefore(retry, selectEl.nextSibling);
    retry.addEventListener('click', function () {
      listModelsForSelect(endpoint, key, selectEl, null);
    });
  }

  function listModelsForSelect(endpoint, key, selectEl, done) {
    checkConnection(endpoint, key, function (status) {
      selectEl.innerHTML = '';
      if (!status.ok) {
        // The reason is the diagnostic: CORS, 401, typo — surface it verbatim.
        selectEl.appendChild(new Option('Model list unavailable — ' + status.reason, '', true, true));
        selectEl.options[0].disabled = true;
        renderModelRetry(selectEl.parentNode, selectEl, endpoint, key);
      } else {
        // Option value = full model id (RHOAI needs namespace/name for the request);
        // label = short display name only.
        var ids = status.models
          .map(function (model) { return model && (model.id || model.name); })
          .filter(Boolean);
        selectEl.appendChild(new Option('— select a model —', '', true, true));
        if (!ids.length) {
          selectEl.appendChild(new Option('No models returned', '', false, false));
          selectEl.options[0].disabled = true;
          selectEl.options[1].disabled = true;
        } else {
          selectEl.options[0].disabled = true;
          Array.prototype.forEach.call(ids, function (id) {
            selectEl.appendChild(new Option(normalizeModelId(id), id, false, false));
          });
        }
      }
      if (done) done();
    });
  }

  function parseUsage(usage) {
    usage = usage || {};
    var prompt = usage.prompt_tokens || usage.input_tokens || 0;
    var completion = usage.completion_tokens || usage.output_tokens || 0;
    var parsed = {
      prompt: prompt,
      completion: completion,
      total: usage.total_tokens || prompt + completion,
      reasoning:
        (usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens) || 0,
      reasoningTokens: usage.reasoning_tokens || 0
    };
    return parsed;
  }

  function reasoningValue(parsed) {
    return parsed.reasoning || parsed.reasoningTokens || 0;
  }

  function noUsage(usage) {
    return !usage || (!usage.prompt && !usage.completion && !usage.total);
  }

function metricsFromTimes(tStart, tFirst, tEnd, outputTokens, tokPerSecOverride) {
    var latencyMs = Math.round(tEnd - tStart);
    var ttftMs = tFirst ? Math.round(tFirst - tStart) : null;
    var genMs = tEnd - (tFirst || tStart);
    var tokensPerSec = genMs > 0 ? (outputTokens * 1000) / genMs : null;
    if (tokPerSecOverride != null) tokensPerSec = tokPerSecOverride;
    return { latencyMs: latencyMs, ttftMs: ttftMs, tokensPerSec: tokensPerSec };
  }

  function metricsHtml(metrics, usage) {
    var rows =
      '<dt>Input tokens</dt><dd>' + usage.prompt + '</dd>' +
      '<dt>Output tokens</dt><dd>' + usage.completion + (usage.usageMissing ? ' (no usage in stream)' : '') + '</dd>' +
      '<dt>Total tokens</dt><dd>' + usage.total + '</dd>' +
      '<dt>Reasoning tokens</dt><dd>' + reasoningValue(usage) + '</dd>' +
      '<dt>Total latency</dt><dd>' + metrics.latencyMs + ' ms</dd>';
    if (metrics.ttftMs != null) {
      rows += '<dt>Time to first token</dt><dd>' + metrics.ttftMs + ' ms</dd>';
    }
if (metrics.tokensPerSec != null) {
      var tpsSuffix = usage.usageMissing && usage.tokensPerSecEstimate != null ? ' est.' : '';
      rows += '<dt>Output tokens/sec</dt><dd>' + metrics.tokensPerSec.toFixed(1) + ' tok/s' + tpsSuffix + '</dd>';
    }
    return '<dl class="api-test-metrics">' + rows + '</dl>';
  }
  function guardOrEmpty(container) {
    var endpoint = get('endpoint');
    var key = get('key');
    if (!endpoint || !key) {
      container.innerHTML =
        '<p class="api-config-empty">Set your <a href="#/configuration">API Endpoint and API Key</a> first — this needs both.</p>';
      return true;
    }
    return false;
  }

  function testFormHtml(prefix, extraControls) {
    return (
      '<form class="api-test-form">' +
      '<label for="' + prefix + '-system">System prompt</label>' +
      '<textarea id="' + prefix + '-system" rows="2" placeholder="optional"></textarea>' +
      '<label for="' + prefix + '-prompt">Prompt</label>' +
      '<textarea id="' + prefix + '-prompt" rows="3"></textarea>' +
      '<label for="' + prefix + '-model">Model</label>' +
      '<select id="' + prefix + '-model"></select>' +
      (extraControls || '') +
      '<button type="submit">Run</button>' +
      '<p class="api-config-status" role="status"></p>' +
      '</form>'
    );
  }

  function readTestForm(container, prefix) {
    return {
      system: container.querySelector('#' + prefix + '-system').value,
      prompt: container.querySelector('#' + prefix + '-prompt').value,
      model: container.querySelector('#' + prefix + '-model').value
    };
  }

  function chatRequestBody(fields, stream) {
    var messages = [];
    if (fields.system) {
      messages.push({ role: 'system', content: fields.system });
    }
    messages.push({ role: 'user', content: fields.prompt });
    var body = { messages: messages, stream: stream };
    if (stream) {
      body.stream_options = { include_usage: true };
    }
    if (fields.model) {
       body.model = fields.model;
    }
    return body;
  }

  function chatRequestOptions(key, body) {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body)
    };
  }

  function renderTestError(container, response, text) {
    // Keep the result div in the DOM: the mounts re-query it per submit, and
    // removing it makes the next submit throw on a null result.
    var result = container.querySelector('.api-test-result');
    if (!result) {
      result = document.createElement('div');
      result.className = 'api-test-result';
      container.appendChild(result);
    }
    result.innerHTML =
      '<p class="api-config-empty">Request failed: HTTP ' + response.status + ' ' + escapeHtml(response.statusText) +
      (text ? ' — ' + escapeHtml(text.slice(0, 400)) : '') + '</p>';
  }
  function renderFetchError(container, error) {
    var result = container.querySelector('.api-test-result');
    if (!result) {
      result = document.createElement('div');
      result.className = 'api-test-result';
      container.appendChild(result);
    }
    result.innerHTML = formatModelError(error);
  }

  function mountChat(container) {
    if (guardOrEmpty(container)) return;
    container.innerHTML =
      '<div class="api-test-wrap">' + testFormHtml('api-test') + '</div>' +
      '<div class="api-test-result"></div>';
    var selectEl = container.querySelector('#api-test-model');
    listModelsForSelect(get('endpoint'), get('key'), selectEl, null);
    var form = container.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var status = container.querySelector('.api-config-status');
      var result = container.querySelector('.api-test-result');
      var fields = readTestForm(container, 'api-test');
      if (!fields.prompt) {
        status.textContent = 'Enter a prompt.';
        return;
      }
      status.textContent = 'Running…';
      var tStart = performance.now();
      var tEnd = null;
      fetch(chatCompletionUrl(get('endpoint')), chatRequestOptions(get('key'), chatRequestBody(fields, false)))
        .then(function (response) {
          tEnd = performance.now();
          return response.text().then(function (text) {
            if (!response.ok) {
              throw { isHttpError: true, response: response, text: text };
            }
            return { payload: JSON.parse(text), text: text };
          });
        })
        .then(function (parsed) {
          var payload = parsed.payload;
          var content = '';
          if (payload && payload.choices && payload.choices[0] && payload.choices[0].message) {
            content = payload.choices[0].message.content || '';
          }
          var usage = parseUsage(payload && payload.usage);
          result.innerHTML =
            '<h3>Response</h3>' +
            '<pre class="api-test-response">' + escapeHtml(content) + '</pre>' +
            metricsHtml({ latencyMs: Math.round(tEnd - tStart), ttftMs: null, tokensPerSec: null }, usage);
        })
        .catch(function (error) {
          if (error && error.isHttpError) {
            renderTestError(container, error.response, error.text);
          } else {
            renderFetchError(container, error);
          }
          status.textContent = '';
        });
    });
  }

  function mountStream(container) {
    if (guardOrEmpty(container)) return;
    container.innerHTML =
      '<div class="api-test-wrap">' + testFormHtml('api-stream', '') + '</div>' +
      '<div class="api-test-result"></div>';
    var form = container.querySelector('form');
    var selectEl = container.querySelector('#api-stream-model');
    var runButton = form.querySelector('button[type="submit"]');
    listModelsForSelect(get('endpoint'), get('key'), selectEl, null);
    var stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.textContent = 'Stop';
    stopButton.disabled = true;
    stopButton.title = 'Stop the stream in progress';
    runButton.insertAdjacentElement('afterend', stopButton);
    var streamController = null;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (streamController) return;
      var status = container.querySelector('.api-config-status');
      var result = container.querySelector('.api-test-result');
      var fields = readTestForm(container, 'api-stream');
      if (!fields.prompt) { status.textContent = 'Enter a prompt.'; return; }
      var body = chatRequestBody(fields, true);
      var renderedPanel = document.createElement('pre');
      renderedPanel.className = 'api-test-response api-test-live';
      renderedPanel.textContent = '';
      result.innerHTML = '';
      result.appendChild(renderedPanel);
      status.textContent = 'Streaming…';
      runButton.disabled = true;
      stopButton.disabled = false;
      streamController = new AbortController();
      var aborted = false;
      var tStart = performance.now();
      var tFirst = null;
      var renderedText = '';
      var contentDeltas = 0;
      var finalUsage = null;
      var rawRing = [];
      var RAW_RING_SIZE = 20;
      function pushRaw(line) {
        rawRing.push(line);
        if (rawRing.length > RAW_RING_SIZE) rawRing.shift();
      }
      function debugRaw(reason) {
        try {
          console.debug('[docsichat] last ' + rawRing.length + ' raw SSE events (' + reason + '):', rawRing.slice());
        } catch (e) { /* console.debug unavailable; nothing else to do */ }
      }
      // CORS is required for this call to work at all: the endpoint must send
      // Access-Control-Allow-Origin for this origin plus Access-Control-Allow-Headers
      // "Authorization, Content-Type", or fetch rejects (TypeError) before any body.
      // The Basic Chat page has the same requirement; fetch errors surface through
      // formatModelError so the user sees a clear network/CORS message.
      var requestOptions = chatRequestOptions(get('key'), body);
      requestOptions.signal = streamController.signal;
      fetch(chatCompletionUrl(get('endpoint')), requestOptions)
        .then(function (response) {
          if (!response.ok) {
            return response.text().then(function (text) {
              throw { isHttpError: true, response: response, text: text };
            });
          }
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var sawDone = false;
          function processEvent(eventText) {
            var lines = eventText.split('\n');
            Array.prototype.forEach.call(lines, function (line) {
              if (line.slice(0, 5) !== 'data:') return;
              pushRaw(line.replace(/\r$/, ''));
              var payloadText = line.slice(5).replace(/\r$/, '');
              if (payloadText.charAt(0) === ' ') payloadText = payloadText.slice(1);
              if (payloadText === '[DONE]') {
                sawDone = true;
                return;
              }
              var chunk;
              try { chunk = JSON.parse(payloadText); } catch (e) { return; }
              if (chunk && chunk.usage) finalUsage = chunk.usage;
              var deltaContent =
                chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].delta
                  ? chunk.choices[0].delta.content
                  : null;
              if (deltaContent) {
                if (tFirst === null) tFirst = performance.now();
                contentDeltas += 1;
                renderedText += deltaContent;
                renderedPanel.textContent = renderedText;
              }
            });
          }
          function readChunk() {
            if (sawDone) return;
            return reader.read().then(function (result) {
              if (result.done) return;
              buffer += decoder.decode(result.value, { stream: true });
              var parts = buffer.split('\n\n');
              buffer = parts.pop();
              Array.prototype.forEach.call(parts, processEvent);
              return readChunk();
            });
          }
          return readChunk().then(function () {
            buffer += decoder.decode();
            if (buffer) processEvent(buffer);
          });
        })
        .then(function () {
          var tEnd = performance.now();
          var parsedUsage = parseUsage(finalUsage);
          parsedUsage.usageMissing = noUsage(parsedUsage);
          if (parsedUsage.usageMissing && tFirst !== null && contentDeltas > 0) {
            // No usage chunk arrived (stream cut short or server omits it):
            // estimate throughput from received content deltas instead of
            // rendering a misleading 0.0 tok/s.
            var estTok = Math.max(1, Math.round(renderedText.length / 4));
            var genMs = tEnd - tFirst;
            parsedUsage.tokensPerSecEstimate =
              genMs > 0 ? (estTok * 1000) / genMs : null;
          }
          var metricsDiv = document.createElement('div');
          metricsDiv.innerHTML = metricsHtml(
            metricsFromTimes(tStart, tFirst, tEnd, parsedUsage.usageMissing ? 0 : parsedUsage.completion, parsedUsage.tokensPerSecEstimate),
            parsedUsage
          );
          result.appendChild(metricsDiv);
          status.textContent = '';
        })
        .catch(function (error) {
          if (error && error.isHttpError) {
            debugRaw('HTTP error');
            renderTestError(container, error.response, error.text);
          } else if (error && error.name === 'AbortError') {
            aborted = true;
            status.textContent = 'Stopped.';
          } else {
            debugRaw('stream failed: ' + (error && error.message ? error.message : String(error)));
            renderFetchError(container, error);
          }
          if (!aborted) status.textContent = '';
        })
        .then(function () {
          streamController = null;
          runButton.disabled = false;
          stopButton.disabled = true;
        });
    });
    stopButton.addEventListener('click', function () {
      if (streamController) streamController.abort();
    });
  }

  function mountModels(container) {
    var endpoint = get('endpoint');
    var key = get('key');
    if (!endpoint || !key) {
      container.innerHTML =
        '<p class="api-config-empty">Set your <a href="#/configuration">API Endpoint and API Key</a> first — this needs both.</p>';
      return;
    }
    container.innerHTML =
      '<button type="button" class="api-models-run">List models</button>' +
      '<pre class="api-models-pre" hidden></pre>' +
      '<p class="api-config-status" role="status"></p>';

    container.querySelector('.api-models-run').addEventListener('click', function () {
      var pre = container.querySelector('.api-models-pre');
      var status = container.querySelector('.api-config-status');
      var button = container.querySelector('.api-models-run');
      button.disabled = true;
      button.textContent = 'Listing…';
      fetch(modelsUrl(endpoint), { headers: { Authorization: 'Bearer ' + key } })
        .then(function (response) {
          return response.text().then(function (text) {
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ' ' + response.statusText + (text ? ' — ' + text.slice(0, 200) : ''));
            }
            var payload;
            try { payload = JSON.parse(text); } catch (e) { throw new Error('Non-JSON response: ' + text.slice(0, 200)); }
            return payload;
          });
        })
        .then(function (payload) {
          var models = extractModels(payload);
          if (!models) {
            pre.hidden = false;
            pre.textContent = JSON.stringify(payload, null, 2);
            status.textContent = 'Unrecognized response shape — raw body below.';
            return;
          }
          var names = models.map(function (model) { return model && (model.id || model.name); }).filter(Boolean);
          pre.hidden = false;
          pre.textContent = names.length ? names.join('\n') : '(no models returned)';
          status.textContent = models.length + ' model(s).';
        })
        .catch(function (error) {
          pre.hidden = true;
          status.innerHTML = formatModelError(error);
        })
        .then(function () {
          button.disabled = false;
          button.textContent = 'List models';
        });
    });
  }

  function settingsHeaderHtml() {
    return (
      '<span class="api-settings-label">Endpoint:</span> ' +
      '<span class="api-config" data-field="endpoint"></span>' +
      '<span class="api-settings-sep">·</span>' +
      '<span class="api-settings-label">Key:</span> ' +
      '<span class="api-config" data-field="key"></span>' +
      '<a class="api-settings-link" href="#/configuration">Configuration</a>'
    );
  }

  function mountSettingsHeader() {
    // docsify v5 has no #docsify-container; section.content is the per-page wrapper.
    var content = document.querySelector('main section.content');
    if (!content) return;
    var header = document.getElementById('api-settings-header');
    if (!header) {
      header = document.createElement('div');
      header.id = 'api-settings-header';
      header.className = 'api-settings-header';
      content.insertBefore(header, content.firstChild);
    }
    header.innerHTML = settingsHeaderHtml();
    refreshPlaceholders(header);
  }

  function apiConfigPlugin(hook) {
    hook.doneEach(function () {
      refreshPlaceholders(document);
      var container = document.querySelector('#api-config-form');
      if (container) mountForm(container);
      var curlContainer = document.querySelector('#api-curl-command');
      if (curlContainer) mountCurl(curlContainer);

      var modelsContainer = document.querySelector('#api-models');
      if (modelsContainer) mountModels(modelsContainer);
      var chatContainer = document.querySelector('#api-test-chat');
      if (chatContainer) mountChat(chatContainer);
      var streamContainer = document.querySelector('#api-test-stream');
      if (streamContainer) mountStream(streamContainer);

      mountSettingsHeader();
    });
  }

  // Programmatic access: window.DocsifyApiConfig.get('endpoint') etc.
  window.DocsifyApiConfig = { get: get, set: set, mask: MASK };

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = [apiConfigPlugin, ...(window.$docsify.plugins || [])];
})();
