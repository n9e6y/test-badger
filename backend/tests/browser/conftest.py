from __future__ import annotations

import threading
from collections.abc import AsyncIterator, Iterator
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from agent.browser.session import BrowserSession

PAGES = Path(__file__).parent.parent / "fixtures" / "pages"


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/redirect-out":
            self.send_response(302)
            self.send_header("Location", "https://example.org/")
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture(scope="session")
def site() -> Iterator[str]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(PAGES)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture
async def session(site: str) -> AsyncIterator[BrowserSession]:
    # The fixture server is on loopback, so it is exempt like our demo shop.
    async with BrowserSession(allowed_origins=[site], exempt_origins=[site]) as s:
        yield s
