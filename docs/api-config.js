/**
 * docsichat API config plugin for Docsify v5.
 *
 * - Settings form (API Endpoint + API Key) injected on the settings page.
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

  function renderValue(field) {
    var value = get(field);
    if (!value) {
      return '<em class="api-config-empty">not set</em>';
    }
    return field === 'key' ? previewKey(value) : escapeHtml(value);
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
    return (
      '<form class="api-config-form">' +
      '<label for="api-config-endpoint">API Endpoint</label>' +
      '<input id="api-config-endpoint" name="endpoint" type="text" ' +
      'placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" ' +
      'value="' + escapeHtml(endpoint) + '">' +
      '<label for="api-config-key">API Key</label>' +
      '<input id="api-config-key" name="key" type="password" ' +
      'autocomplete="new-password" spellcheck="false" placeholder="' +
      (hasKey ? previewKey(get('key')) + ' (saved — type to replace)' : 'paste your API key') + '">' +
      '<button type="submit">Save</button>' +
      '<p class="api-config-status" role="status"></p>' +
      '</form>'
    );
  }

  function mountForm(container) {
    container.innerHTML = formHtml();

    var form = container.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var endpointInput = container.querySelector('#api-config-endpoint');
      var keyInput = container.querySelector('#api-config-key');
      var status = container.querySelector('.api-config-status');

      set('endpoint', endpointInput.value.trim());
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
  }

  function shellEscape(value) {
    // Escape for a double-quoted shell argument.
    return String(value).replace(/[\\"$`]/g, '\\$&');
  }

  function modelsUrl(endpoint) {
    return endpoint.replace(/\/+$/, '') + '/models';
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
        '<p class="api-config-empty">Set your <a href="#/settings">API Endpoint and API Key</a> first — the command needs both.</p>';
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

  function mountModels(container) {
    var endpoint = get('endpoint');
    var key = get('key');
    if (!endpoint || !key) {
      container.innerHTML =
        '<p class="api-config-empty">Set your <a href="#/settings">API Endpoint and API Key</a> first — this needs both.</p>';
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

  function apiConfigPlugin(hook) {
    hook.doneEach(function () {
      refreshPlaceholders(document);
      var container = document.querySelector('#api-config-form');
      if (container) mountForm(container);
      var curlContainer = document.querySelector('#api-curl-command');
      if (curlContainer) mountCurl(curlContainer);

      var modelsContainer = document.querySelector('#api-models');
      if (modelsContainer) mountModels(modelsContainer);
    });
  }

  // Programmatic access: window.DocsifyApiConfig.get('endpoint') etc.
  window.DocsifyApiConfig = { get: get, set: set, mask: MASK };

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = [apiConfigPlugin, ...(window.$docsify.plugins || [])];
})();
