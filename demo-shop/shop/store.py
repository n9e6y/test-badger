"""SQLite storage: accounts and bug/distractor switches. Seed catalog and coupons."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from dataclasses import dataclass
from pathlib import Path

DB_PATH = Path(os.environ.get("SHOP_DB_PATH", "shop.sqlite3"))
ADMIN_TOKEN = os.environ.get("SHOP_ADMIN_TOKEN", "dev-admin")

BUGS = {
    "B1": "Signup accepts an invalid email",
    "B2": "Password confirmation is not checked",
    "B3": "Duplicate email shows a fake success",
    "B4": "Empty name crashes the server",
    "B5": "Cart remove button does nothing",
    "B6": "Zero / negative quantity accepted",
    "B7": "Expired coupon accepted",
    "B8": "Out-of-stock item can be bought",
    "B9": "Postal code with a space silently blocks checkout",
}
DISTRACTORS = {"D1": "Cookie banner on first visit", "D2": "Newsletter popup on product pages"}


@dataclass(frozen=True)
class Product:
    slug: str
    name: str
    price_cents: int
    stock: int
    blurb: str
    on_sale: bool = False


PRODUCTS = [
    Product("ceramic-mug", "Ceramic Mug", 1400, 25, "Hand-glazed stoneware, 350 ml."),
    Product("linen-tote-bag", "Linen Tote Bag", 2200, 0, "Washed linen, roomy and sturdy."),
    Product("oak-cutting-board", "Oak Cutting Board", 3800, 10, "Solid oak, oiled by hand."),
    Product("wool-throw", "Wool Throw", 6400, 5, "Soft merino blend, 130 × 170 cm.", on_sale=True),
    Product("scented-candle", "Scented Candle", 1800, 40, "Cedar and fig, 40 hours."),
    Product("plant-pot-small", "Plant Pot (Small)", 1200, 15, "Terracotta, 12 cm, with saucer."),
]
PRODUCTS_BY_SLUG = {p.slug: p for p in PRODUCTS}

# code -> (percent off, expired)
COUPONS = {"WELCOME10": (10, False), "SUMMER24": (20, True)}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    defaults = os.environ.get("BUGS_ENABLED", ",".join(BUGS))
    enabled = {b.strip() for b in defaults.split(",") if b.strip()}
    with _connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL,"
            " email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)"
        )
        conn.execute("CREATE TABLE IF NOT EXISTS switches (key TEXT PRIMARY KEY, enabled INTEGER)")
        for key in BUGS:
            conn.execute("INSERT OR IGNORE INTO switches VALUES (?, ?)", (key, int(key in enabled)))
        for key in DISTRACTORS:
            conn.execute("INSERT OR IGNORE INTO switches VALUES (?, 1)", (key,))


def switches() -> dict[str, bool]:
    with _connect() as conn:
        return {r["key"]: bool(r["enabled"]) for r in conn.execute("SELECT * FROM switches")}


def enabled(key: str) -> bool:
    """Read on every request so admin changes apply immediately."""
    with _connect() as conn:
        row = conn.execute("SELECT enabled FROM switches WHERE key = ?", (key,)).fetchone()
    return bool(row and row["enabled"])


bug_enabled = enabled


def set_switch(key: str, on: bool) -> None:
    with _connect() as conn:
        conn.execute("UPDATE switches SET enabled = ? WHERE key = ?", (int(on), key))


def set_all_bugs(on: bool) -> None:
    for key in BUGS:
        set_switch(key, on)


def reset_data() -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM users")


def _hash(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


def create_user(name: str, email: str, password: str) -> int:
    salt = secrets.token_hex(8)
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, f"{salt}${_hash(password, salt)}"),
        )
        return int(cur.lastrowid or 0)


def find_user(email: str) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def get_user(user_id: int) -> sqlite3.Row | None:
    with _connect() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def check_password(user: sqlite3.Row, password: str) -> bool:
    salt, digest = user["password_hash"].split("$", 1)
    return secrets.compare_digest(_hash(password, salt), digest)
