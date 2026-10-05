"""Safety guards (03 §8). Enforced in code before the browser acts — never only in prompts.

Everything here is pure or async-DNS only, so it is cheap to unit test.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit


class GuardError(Exception):
    """An action was refused. The message is safe to show to the agent and the user."""


# ---------- origins ----------


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    port = parts.port
    default = {"http": 80, "https": 443}.get(scheme)
    netloc = host if port in (None, default) else f"{host}:{port}"
    return f"{scheme}://{netloc}"


def derive_allowed_origins(base_url: str) -> list[str]:
    """`https://shop.example.com` -> itself plus the bare/`www.` sibling."""
    origin = origin_of(base_url)
    scheme, host = origin.split("://", 1)
    sibling = host.removeprefix("www.") if host.startswith("www.") else f"www.{host}"
    if ":" in host or _is_ip_literal(host.split(":")[0]):
        return [origin]
    return [origin, f"{scheme}://{sibling}"]


def is_allowed_origin(url: str, allowed_origins: list[str]) -> bool:
    if urlsplit(url).scheme.lower() not in ("http", "https"):
        return False
    return origin_of(url) in {origin_of(o) for o in allowed_origins}


# ---------- private network (SSRF) ----------

_EXTRA_BLOCKED = [
    ipaddress.ip_network("100.64.0.0/10"),  # carrier-grade NAT
    ipaddress.ip_network("fd00:ec2::254/128"),  # AWS IPv6 metadata
]


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return False
    return True


def is_blocked_ip(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local  # includes 169.254.169.254 cloud metadata
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
        or any(addr in net for net in _EXTRA_BLOCKED if addr.version == net.version)
    )


async def resolve(host: str) -> list[str]:
    if _is_ip_literal(host):
        return [host.strip("[]")]
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise GuardError(f"Could not resolve {host}") from exc
    return sorted({str(info[4][0]) for info in infos})


@dataclass
class NetworkGuard:
    """Refuses requests to private/internal addresses, except explicitly exempt origins
    (our own demo shop, which lives on the Docker network). Caches DNS per host."""

    exempt_origins: list[str]

    def __post_init__(self) -> None:
        self._exempt = {origin_of(o) for o in self.exempt_origins}
        self._cache: dict[str, bool] = {}

    async def is_safe(self, url: str) -> bool:
        parts = urlsplit(url)
        if parts.scheme.lower() not in ("http", "https"):
            return parts.scheme.lower() in ("data", "blob", "about")
        if origin_of(url) in self._exempt:
            return True
        host = (parts.hostname or "").lower()
        if host not in self._cache:
            try:
                ips = await resolve(host)
            except GuardError:
                self._cache[host] = False
            else:
                self._cache[host] = bool(ips) and not any(is_blocked_ip(ip) for ip in ips)
        return self._cache[host]

    async def check(self, url: str) -> None:
        if not await self.is_safe(url):
            raise GuardError("navigation blocked: private or internal network address")


# ---------- action guards ----------

PAYMENT_KEYWORDS = [
    "pay",
    "place order",
    "complete purchase",
    "buy now",
    "submit payment",
    "confirm order",
    "complete order",
    "confirm and pay",
]
_PAYMENT_RE = re.compile(r"\b(" + "|".join(re.escape(k) for k in PAYMENT_KEYWORDS) + r")\b", re.I)

DESTRUCTIVE_KEYWORDS = ["delete account", "close account", "deactivate account", "unsubscribe"]
_DESTRUCTIVE_RE = re.compile("|".join(re.escape(k) for k in DESTRUCTIVE_KEYWORDS), re.I)


def check_click(label: str, page_has_payment_fields: bool) -> None:
    """Payment guard + destructive-action guard for a click target."""
    if page_has_payment_fields and _PAYMENT_RE.search(label):
        raise GuardError(
            "click refused by payment guard: this would submit a real payment. "
            "Reaching the payment page is the end of the checkout test."
        )
    if _DESTRUCTIVE_RE.search(label):
        raise GuardError("click refused: destructive account action")


# ---------- blocker detection (no LLM) ----------

_BLOCK_STATUS = {
    401: "access denied (401)",
    403: "access denied (403)",
    429: "rate limited (429)",
    503: "service unavailable (503)",
}
_CAPTCHA_FRAME_RE = re.compile(r"recaptcha|hcaptcha|turnstile|challenges\.cloudflare|captcha", re.I)
_CHALLENGE_TITLE_RE = re.compile(
    r"just a moment|attention required|access denied|are you a robot|verify you are human"
    r"|security check|ddos protection",
    re.I,
)


def detect_blocker(
    status: int | None, title: str, frames: list[dict[str, str]], visible_text: str = ""
) -> str | None:
    """Returns a short reason when the page blocks automation, else None.

    `frames` are {"title", "src"} of iframes on the page."""
    if status in _BLOCK_STATUS:
        return _BLOCK_STATUS[status]
    for frame in frames:
        if _CAPTCHA_FRAME_RE.search(f"{frame.get('title', '')} {frame.get('src', '')}"):
            return "CAPTCHA on the page"
    if _CHALLENGE_TITLE_RE.search(title):
        return f"bot-protection challenge page ({title.strip()[:60]})"
    if re.search(r"\bI'?m not a robot\b", visible_text, re.I):
        return "CAPTCHA on the page"
    return None
