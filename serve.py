"""試作を配信する小さなサーバー。public/ だけを出し、一覧表示はせず、毎回最新のファイルを返す。

使い方: python3 serve.py 8124 public
"""
import functools
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8124
    root = sys.argv[2] if len(sys.argv) > 2 else "public"
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root))
    print(f"serving {root} on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()
