#!/usr/bin/env node
/* docsichat smoke check — drives headless Chrome over CDP (Node built-ins only).
 *
 * Usage:
 *   node scripts/smoke-check.js [--url http://localhost:3010/]
 *
 * Checks (per BACKLOG item 28):
 *   - widgets mount (#api-config-form, #api-curl-command, #api-models,
 *     #api-test-chat, #api-test-stream on their respective pages)
 *   - settings round-trip: save via the form, verify localStorage
 *     (docsichat:api:*) + re-rendered saved-configuration values
 *   - the full API key never renders unmasked in the DOM
 *   - no console errors / uncaught exceptions on the pages exercised
 *
 * Chrome resolution: probes http://localhost:9222/json/version for an
 * already-running Chrome with --remote-debugging-port; if absent, launches the
 * platform binary headless with a throwaway profile and kills it on exit.
 * If no CDP endpoint can be established: prints SKIP and exits 0.
 *
 * CDP transport: the DevTools HTTP endpoint (/json/new, /json) is used to
 * create the tab and resolve the page target; the WebSocket transport for
 * Runtime.evaluate is driven by the harness's browser tool when available,
 * or a built-in minimal ws client otherwise.
 */
'use strict';

const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');

// ---------------------------------------------------------------- CLI args
const argv = process.argv.slice(2);
let siteUrl = 'http://localhost:3010/';
const urlIdx = argv.indexOf('--url');
if (urlIdx !== -1 && argv[urlIdx + 1]) siteUrl = argv[urlIdx + 1];
else if (argv.length === 1) siteUrl = argv[0];

// ---------------------------------------------------------------- helpers
function httpJson(url, method = 'GET', timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad JSON from ' + url)); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout: ' + url)));
    req.on('error', reject);
    req.end();
  });
}

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Chromium Dev.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser', '/usr/bin/chromium',
  '/snap/bin/chromium',
];
function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* next */ }
  }
  return null;
}

// ---------------------------------------------------------------- CDP setup
async function acquireBrowser() {
  // 1) Probe for an already-running Chrome with remote debugging on 9222.
  try {
    const ver = await httpJson('http://127.0.0.1:9222/json/version');
    if (ver.webSocketDebuggerUrl) {
      return { listUrl: 'http://127.0.0.1:9222/json', ws: ver.webSocketDebuggerUrl, owned: false };
    }
  } catch (e) { /* not running */ }
  // 2) Launch our own headless instance with a throwaway profile.
  const bin = findChrome();
  if (!bin) throw new Error('no Chrome/Chromium binary found');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docsichat-smoke-'));
  const child = cp.spawn(bin, [
    '--headless',
    '--remote-debugging-port=0',
    '--user-data-dir=' + tmpDir,
    '--disable-background-networking',
    '--no-first-run',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ws = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('timed out waiting for DevTools URL')), 15000);
    const onData = (c) => {
      buf += c.toString('utf8');
      const m = buf.match(/(ws:\/\/[^\s"']+\/devtools\/browser\/[0-9a-f-]+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error('chrome exited early: ' + code)); });
  });
  const port = new URL(ws).port;
  return { listUrl: 'http://127.0.0.1:' + port + '/json', ws, owned: true, child, tmpDir };
}

function failBrowser(err) {
  console.log('SKIP: could not establish a CDP endpoint (' + err.message + ')');
  console.log('       Run Chrome with --remote-debugging-port=9222 or install Chrome/Chromium.');
  process.exit(0);
}

// ---------------------------------------------------------------- ws client
// Minimal RFC6455 client over net.Socket. Client frames are masked per §5.3.
// Server frames (unmasked) are parsed; the 101 upgrade response is buffered
// until the "\r\n\r\n" terminator so HTTP headers are not misread as frames.
class Ws {
  constructor(wsUrl) {
    const u = new URL(wsUrl);
    this.socket = new net.Socket();
    this._buf = Buffer.alloc(0);
    this._id = 0;
    this._pending = new Map();
    this._events = [];
    this._upgraded = false;
    this.readyState = 0; // 0 connecting, 1 open, 3 closed
    const key = crypto.randomBytes(16).toString('base64');
    this.socket.connect(Number(u.port), u.hostname, () => {
      this.readyState = 1;
      this.socket.write([
        'GET ' + u.pathname + u.search + ' HTTP/1.1',
        'Host: ' + u.host,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Key: ' + key,
        'Sec-WebSocket-Version: 13',
        '', '',
      ].join('\r\n'));
    });
    this.socket.on('data', (c) => this._onData(c));
    this.socket.on('close', () => this._close());
    this.socket.on('error', () => this._close());
  }
  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    if (!this._upgraded) {
      const sep = this._buf.indexOf('\r\n\r\n');
      if (sep === -1) return;
      const head = this._buf.slice(0, sep);
      if (head.indexOf(' 101 ') === -1) return this._close();
      this._upgraded = true;
      this._buf = this._buf.slice(sep + 4);
    }
    for (;;) {
      if (this._buf.length < 2) return;
      const op = this._buf[0] & 0x0f;
      const len = this._buf[1] & 0x7f;
      const off = len === 126 ? 4 : len === 127 ? 10 : 2;
      if (this._buf.length < off + len) return;
      const payload = this._buf.slice(off, off + len);
      this._buf = this._buf.slice(off + len);
      if (op === 0x8) return this._close();
      if (op === 0x9) { // ping → pong
        const mask = crypto.randomBytes(4);
        const masked = Buffer.from(payload);
        for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
        this.socket.write(Buffer.concat([Buffer.from([0x8a | 0x80, masked.length]), mask, masked]));
        continue;
      }
      if (op !== 0x1) continue;
      let msg;
      try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
      if (msg.id != null && this._pending.has(msg.id)) {
        const p = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        p(msg);
      } else {
        this._events.push(msg);
      }
    }
  }
  send(method, params) {
    const id = ++this._id;
    const payload = Buffer.from(JSON.stringify({ id, method, params: params || {} }), 'utf8');
    const mask = crypto.randomBytes(4);
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    const frame = [];
    if (payload.length < 126) frame.push(Buffer.from([0x81 | 0x80, payload.length]));
    else if (payload.length < 65536) frame.push(Buffer.from([0x81 | 0x80, 126, (payload.length >> 8) & 0xff, payload.length & 0xff]));
    else {
      const ext = Buffer.alloc(10);
      ext[0] = 0x81 | 0x80; ext[1] = 127;
      ext.writeBigUInt64BE(BigInt(payload.length), 2);
      frame.push(ext);
    }
    frame.push(mask);
    frame.push(masked);
    this.socket.write(Buffer.concat(frame));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this._pending.delete(id); reject(new Error('timeout: ' + method)); }, 20000);
      this._pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
    });
  }
  events() { return this._events.splice(0, this._events.length); }
  close() { try { this.socket.destroy(); } catch (e) { /* noop */ } }
  _close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    for (const p of this._pending.values()) p({ id: 0, error: { message: 'ws closed' } });
    this._pending.clear();
  }
}

function waitForOpen(ws, ms = 10000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (ws.readyState === 1 && ws._upgraded) { clearInterval(timer); resolve(); }
      else if (ws.readyState === 3 || Date.now() - t0 > ms) { clearInterval(timer); reject(new Error('ws open timeout')); }
    }, 50);
  });
}

// ---------------------------------------------------------------- checks
const PAGES = [
  { route: 'configuration.md', id: '#api-config-form', label: 'Configuration: #api-config-form' },
  { route: 'curl.md', id: '#api-curl-command', label: 'cURL: #api-curl-command' },
  { route: 'curl.md', id: '#api-models', label: 'cURL: #api-models' },
  { route: 'basic-chat.md', id: '#api-test-chat', label: 'Basic Chat: #api-test-chat' },
  { route: 'streaming.md', id: '#api-test-stream', label: 'Streaming: #api-test-stream' },
];

function evalJs(ws, expression) {
  return ws.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    .then((r) => {
      if (r.result && r.result.exceptionDetails) {
        const d = r.result.exceptionDetails;
        return { error: (d.exception && d.exception.description) || d.text };
      }
      return r.result && r.result.result ? r.result.result.value : undefined;
    });
}

function pageErrors(ws) {
  const errs = [];
  for (const ev of ws.events()) {
    if (ev.method === 'Runtime.exceptionThrown') {
      const d = ev.params.exceptionDetails;
      errs.push('uncaught: ' + ((d.exception || {}).description || d.text));
    } else if (ev.method === 'Runtime.consoleAPICalled') {
      if (ev.params.type === 'error') {
        errs.push('console.error: ' + (ev.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
    } else if (ev.method === 'Log.entryAdded') {
      if (ev.params.entry && ev.params.entry.level === 'error') errs.push('log: ' + ev.params.entry.text);
    }
  }
  return errs;
}

function waitForRender(ws, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return (function poll() {
    return evalJs(ws, 'return !document.body.classList.contains("loading") && !!document.querySelector("main section.content");')
      .then((ok) => {
        if (ok === true) return ok;
        if (Date.now() > deadline) throw new Error('docsify did not finish rendering in ' + timeoutMs + 'ms');
        return new Promise((r) => setTimeout(r, 250)).then(poll);
      });
  })();
}

function navigateToRoute(ws, route) {
  return evalJs(ws, 'return new Promise(function(resolve){ var target = "#/' + route + '"; if (location.hash === target) { location.href = "about:blank"; setTimeout(function(){ location.href = ' + JSON.stringify(siteUrl) + target + '; setTimeout(resolve, 2000); }, 300); } else { location.hash = target; setTimeout(resolve, 1500); } });')
    .then(() => null);
}

function setNativeValue(ws, selector, value) {
  const js = 'var el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) throw new Error("missing " + ' + JSON.stringify(selector) + ');' +
    'var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;' +
    'setter.call(el, ' + JSON.stringify(value) + ');' +
    'el.dispatchEvent(new Event("input", { bubbles: true }));' +
    'el.dispatchEvent(new Event("change", { bubbles: true }));' +
    'return el.value;';
  return evalJs(ws, js);
}

function submitForm(ws) {
  return evalJs(ws, 'var f = document.querySelector("#api-config-form form"); if (!f) throw new Error("missing form"); if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); return true;');
}

// ---------------------------------------------------------------- main
async function main() {
  let browser;
  try { browser = await acquireBrowser(); } catch (e) { return failBrowser(e); }

  const results = [];
  let failed = false;
  const check = (name, ok, detail) => {
    results.push({ name, ok });
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
    if (!ok) failed = true;
  };

  const cleanup = () => {
    try { if (browser.owned && browser.child) browser.child.kill('SIGKILL'); } catch (e) { /* noop */ }
    if (browser.tmpDir) fs.rmSync(browser.tmpDir, { recursive: true, force: true });
  };

  let pageWs, tabId;
  try {
    // Create the tab via the CDP HTTP endpoint (version-robust).
    const port = new URL(browser.ws).port;
    const created = await httpJson(
      'http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(siteUrl), 'PUT');
    tabId = created && created.id;
    if (!tabId || !created.webSocketDebuggerUrl) {
      throw new Error('could not create target: ' + JSON.stringify(created));
    }

    // Attach to the page target via its own ws endpoint.
    pageWs = new Ws(created.webSocketDebuggerUrl);
    await waitForOpen(pageWs);
    await pageWs.send('Runtime.enable');

    await waitForRender(pageWs);
    check('site renders (docsify ready at ' + siteUrl + ')', true);

    // --- widget mount checks
    for (const p of PAGES) {
      try {
        await navigateToRoute(pageWs, p.route);
        const mounted = await evalJs(pageWs, 'var el = document.querySelector(' + JSON.stringify(p.id) + '); return !!(el && el.innerHTML && el.innerHTML.trim().length > 0);');
        check('mounts ' + p.label, mounted === true);
      } catch (e) {
        check('mounts ' + p.label, false, e.message);
      }
    }

    // --- settings round-trip
    const probeEndpoint = 'https://smoke.example/v1';
    const probeKey = 'sk-smoke-check-abcdefghijklmnopqrstuvwxyz';
    try {
      await navigateToRoute(pageWs, 'configuration.md');
      await setNativeValue(pageWs, '#api-config-endpoint', probeEndpoint);
      await setNativeValue(pageWs, '#api-config-key', probeKey);
      await submitForm(pageWs);
      await new Promise((r) => setTimeout(r, 300));
      const stored = await evalJs(pageWs, 'return { endpoint: localStorage.getItem("docsichat:api:endpoint"), key: localStorage.getItem("docsichat:api:key") };');
      check('settings round-trip: localStorage (docsichat:api:*)',
        stored && stored.endpoint === probeEndpoint && stored.key === probeKey,
        JSON.stringify(stored));
      await navigateToRoute(pageWs, 'curl.md');
      await navigateToRoute(pageWs, 'configuration.md');
      await new Promise((r) => setTimeout(r, 400));
      const table = await evalJs(pageWs, 'var rows = document.querySelectorAll("section.content .api-config[data-field]"); return Array.prototype.map.call(rows, function(n){ return n.getAttribute("data-field") + "=" + n.textContent; });');
      const hasEndpoint = table && table.some((s) => s.indexOf('endpoint=' + probeEndpoint) === 0);
      const hasMasked = table && table.some((s) => s.indexOf('key=' + probeKey.slice(0, 10)) === 0 && s.indexOf('••••') !== -1);
      check('settings re-render after navigation (masked preview)', hasEndpoint && hasMasked, JSON.stringify(table));
    } catch (e) {
      check('settings round-trip', false, e.message);
    }

    // --- full key never unmasked in DOM (across all pages)
    let leaked = false;
    for (const p of PAGES) {
      try {
        await navigateToRoute(pageWs, p.route);
        await new Promise((r) => setTimeout(r, 250));
        const dom = await evalJs(pageWs, 'return document.documentElement.innerHTML;');
        if (typeof dom === 'string' && dom.indexOf(probeKey) !== -1) leaked = true;
      } catch (e) { /* page errors counted below */ }
    }
    check('full API key never unmasked in DOM', !leaked);

    // --- console / uncaught errors
    const errs = pageErrors(pageWs).filter((e) => e.indexOf('favicon') === -1);
    check('no console errors / uncaught exceptions', errs.length === 0, errs.slice(0, 3).join(' | '));

    // Clean up the probe values (leave the site as found).
    try {
      await navigateToRoute(pageWs, 'configuration.md');
      await evalJs(pageWs, 'localStorage.removeItem("docsichat:api:endpoint"); localStorage.removeItem("docsichat:api:key"); return true;');
    } catch (e) { /* throwaway profile; harmless */ }
  } catch (e) {
    check('run completed', false, e.message);
  } finally {
    if (pageWs) pageWs.close();
    // Close the tab via the CDP HTTP endpoint.
    try {
      const port = new URL(browser.ws).port;
      if (tabId) await httpJson('http://127.0.0.1:' + port + '/json/close/' + tabId);
    } catch (e) { /* noop */ }
    cleanup();
  }

  console.log('');
  const pass = results.filter((r) => r.ok).length;
  console.log(pass + '/' + results.length + ' checks passed' + (failed ? ' — FAILURES PRESENT' : ''));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('smoke-check crashed: ' + e.stack); process.exit(1); });
