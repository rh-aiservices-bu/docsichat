#!/usr/bin/env python3
"""docsichat dev server: SimpleHTTPRequestHandler + Cache-Control: no-store.

Usage:
    python3 scripts/serve.py
    python3 scripts/serve.py --port 3020 --directory docs

Replaces the plain `python3 -m http.server 3010 --directory docs` workflow.
SimpleHTTP sends Last-Modified, so Chrome heuristic-caches edited plugin
JS/CSS and changes silently don't load on reload. This server answers every
request with `Cache-Control: no-store`, which removes the hard-reload dance.

Stdlib only.
"""

import argparse
import http.server
import os


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_HEAD(self):
        # SimpleHTTPRequestHandler has no do_HEAD; answer it with headers only,
        # mirroring what GET would return.
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            # Directory: mirror SimpleHTTPRequestHandler's index.html lookup.
            index = None
            for name in ('index.html', 'Index.html'):
                candidate = os.path.join(path, name)
                if os.path.isfile(candidate):
                    index = candidate
                    break
            if index is None:
                self.send_error(404, 'File not found')
                return
            path = index
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, 'File not found')
            return
        with f:
            size = os.fstat(f.fileno()).st_size
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(path))
            self.send_header('Content-Length', str(size))
            self.end_headers()

def make_handler(directory):
    class Handler(NoStoreHandler):
        def __init__(self, *a, **kw):
            kw['directory'] = directory
            super().__init__(*a, **kw)
    return Handler


def main():
    parser = argparse.ArgumentParser(
        description='docsichat dev server (no-store responses)',
    )
    parser.add_argument('--directory', default='docs',
                        help='directory to serve (default: docs)')
    parser.add_argument('--port', type=int, default=3010,
                        help='port to bind (default: 3010)')
    args = parser.parse_args()

    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', args.port), make_handler(args.directory))
    print('Serving %s at http://localhost:%d/ (Cache-Control: no-store)'
          % (args.directory, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
