from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from shop import store
from shop.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "shop.sqlite3")
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def bugs_off(client: TestClient) -> TestClient:
    store.set_all_bugs(False)
    return client
