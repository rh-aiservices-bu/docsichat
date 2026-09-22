# docsichat

An in-browser API companion for Red Hat OpenShift AI model endpoints, and for any OpenAI-compatible API. Deploy a model in the tutorial, then use these pages to save your endpoint and key, copy ready-made curl commands, and send test chats with serving metrics. There is no backend: your endpoint and key are stored in this browser only, and the key is shown masked wherever it appears. The full value is used only in requests to your endpoint and in the clipboard text that **Copy command** produces.

## Start here

1. [Configuration](configuration.md): save your API endpoint and key, then click **Test connection**. Bare host URLs get `/v1` appended automatically. A saved key is shown with its first 10 characters followed by a mask; **Clear** removes both values.
2. [cURL](curl.md): copy a curl command for `GET {endpoint}/models`, or run the same request in your browser with **List models**. A browser can only reach endpoints that answer CORS preflights; when yours doesn't, the curl command is the fallback.
3. [Basic Chat](basic-chat.md): send a single chat completion and read back usage metrics.
4. [Streaming](streaming.md): stream tokens live and watch time to first token and tokens per second, with notes on what typical values mean.

Model lists use full model ids in requests (Red Hat OpenShift AI needs the `namespace/name` form) and short names in the UI.

## How it works

Every page is plain Markdown under `docs/`, rendered by docsify v5 from the CDN. A single plugin, `docs/api-config.js`, mounts the interactive widgets: the settings form, the curl command, and the chat forms. Settings persist in `localStorage` under `docsichat:api:*`. There is no build step and no dependency to install.

## Contributing

Serve locally from the repo root:

```sh
python3 -m http.server 3010          # http://localhost:3010
```

`http.server` sends `Last-Modified`, which makes Chrome heuristic-cache edited plugin files, so reloads can silently serve stale JS and CSS; use a hard reload (Cmd+Shift+R) after edits. The repo also ships `scripts/serve.py`, which answers every request with `Cache-Control: no-store` and skips the hard-reload dance, and `scripts/smoke-check.js`, which drives a headless Chrome through the widget mount, key-masking, and console-error checks.

A new page is a Markdown file in `docs/` plus a link in `docs/_sidebar.md`. Deploy by pushing to the default branch: GitHub Pages serves `docs/`, and `.nojekyll` is present.
