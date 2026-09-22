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

  function apiConfigPlugin(hook) {
    hook.doneEach(function () {
      refreshPlaceholders(document);
      var container = document.querySelector('#api-config-form');
      if (container) mountForm(container);
    });
  }

  // Programmatic access: window.DocsifyApiConfig.get('endpoint') etc.
  window.DocsifyApiConfig = { get: get, set: set, mask: MASK };

  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = [apiConfigPlugin, ...(window.$docsify.plugins || [])];
})();
