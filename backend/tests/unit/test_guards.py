from __future__ import annotations

import pytest

from agent.browser.guards import (
    GuardError,
    NetworkGuard,
    check_click,
    derive_allowed_origins,
    detect_blocker,
    is_allowed_origin,
    is_blocked_ip,
    origin_of,
)

# ---------- origins ----------


def test_origin_normalizes_default_ports_and_case() -> None:
    assert origin_of("HTTPS://Shop.Example.com:443/cart?x=1") == "https://shop.example.com"
    assert origin_of("http://localhost:8100/a") == "http://localhost:8100"


def test_derive_allowed_origins_adds_www_sibling() -> None:
    assert derive_allowed_origins("https://shop.example.com/x") == [
        "https://shop.example.com",
        "https://www.shop.example.com",
    ]
    assert derive_allowed_origins("https://www.example.com") == [
        "https://www.example.com",
        "https://example.com",
    ]
    assert derive_allowed_origins("http://shop:8100") == ["http://shop:8100"]


@pytest.mark.parametrize(
    ("url", "allowed"),
    [
        ("https://shop.example.com/cart", True),
        ("https://shop.example.com:443/", True),
        ("http://shop.example.com/", False),  # scheme matters
        ("https://evil.example.com/", False),
        ("https://shop.example.com.evil.com/", False),
        ("javascript:alert(1)", False),
        ("file:///etc/passwd", False),
    ],
)
def test_is_allowed_origin(url: str, allowed: bool) -> None:
    assert is_allowed_origin(url, ["https://shop.example.com"]) is allowed


# ---------- private network ----------


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.5",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "::1",
        "fd00:ec2::254",
        "::ffff:127.0.0.1",
        "fe80::1",
        "224.0.0.1",
    ],
)
def test_private_and_metadata_ips_blocked(ip: str) -> None:
    assert is_blocked_ip(ip)


@pytest.mark.parametrize("ip", ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])
def test_public_ips_allowed(ip: str) -> None:
    assert not is_blocked_ip(ip)


async def test_network_guard_blocks_private_hosts_and_honors_exemption() -> None:
    guard = NetworkGuard(exempt_origins=["http://shop:8100"])
    assert not await guard.is_safe("http://169.254.169.254/latest/meta-data/")
    assert not await guard.is_safe("http://localhost:9000/")
    assert not await guard.is_safe("http://[::1]/")
    assert not await guard.is_safe("http://does-not-exist.invalid/")
    assert not await guard.is_safe("file:///etc/passwd")
    assert await guard.is_safe("http://shop:8100/products")  # demo shop exemption
    assert await guard.is_safe("data:image/png;base64,AAAA")
    with pytest.raises(GuardError):
        await guard.check("http://127.0.0.1/")


# ---------- payment & destructive guards ----------


@pytest.mark.parametrize(
    "label", ["Pay now €16.10", "Place order", "Complete purchase", "BUY NOW", "Confirm order"]
)
def test_payment_guard_blocks_on_payment_page(label: str) -> None:
    with pytest.raises(GuardError, match="payment guard"):
        check_click(label, page_has_payment_fields=True)


@pytest.mark.parametrize("label", ["Pay now", "Place order"])
def test_payment_words_allowed_without_card_fields(label: str) -> None:
    check_click(label, page_has_payment_fields=False)


@pytest.mark.parametrize("label", ["Continue to payment", "Payment options", "PayPal info"])
def test_payment_guard_does_not_overmatch(label: str) -> None:
    check_click(label, page_has_payment_fields=True)


@pytest.mark.parametrize("label", ["Delete account", "Close account", "Unsubscribe"])
def test_destructive_actions_blocked(label: str) -> None:
    with pytest.raises(GuardError, match="destructive"):
        check_click(label, page_has_payment_fields=False)


# ---------- blocker detection ----------


def test_detect_blocker() -> None:
    assert detect_blocker(403, "Forbidden", []) == "access denied (403)"
    assert detect_blocker(200, "Apply", [{"title": "reCAPTCHA", "src": "/x"}]) == (
        "CAPTCHA on the page"
    )
    assert detect_blocker(200, "x", [{"title": "", "src": "https://js.hcaptcha.com/1"}])
    assert "challenge" in (detect_blocker(200, "Just a moment...", []) or "")
    assert detect_blocker(200, "Shop", [], "Welcome to our shop") is None
