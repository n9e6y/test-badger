"""Tools + guards against local fixture pages in real headless Chromium."""

from __future__ import annotations

from pathlib import Path

from agent.browser.session import BrowserSession
from agent.browser.snapshot import format_snapshot
from agent.browser.tools import BrowserTools, describe_action


async def open_page(tools: BrowserTools, site: str, page: str) -> None:
    result = await tools.run("navigate", {"url": f"{site}/{page}"})
    assert result.ok, result.message
    await tools.session.snapshot()


async def test_snapshot_lists_elements_messages_and_overlays(
    session: BrowserSession, site: str
) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "form.html")
    snap = session.last_snapshot
    assert snap is not None
    name = snap.find("Full name", role="textbox")
    assert name and name.required and name.form == "Create account"
    assert snap.find("Password").type == "password"  # type: ignore[union-attr]
    assert snap.find("Hidden button") is None
    assert snap.find("Accept all").in_overlay  # type: ignore[union-attr]
    assert any("We use cookies" in o for o in snap.overlays)
    text = format_snapshot(snap, "console errors: 0, failed requests: 0")
    assert 'FORM "Create account":' in text and "IN OVERLAY:" in text
    assert 'textbox "Full name" (required)' in text


async def test_type_click_and_validation_message(session: BrowserSession, site: str) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "form.html")
    snap = session.last_snapshot
    assert snap is not None
    submit = snap.find("Create account", role="button")
    assert submit is not None
    await tools.run("dismiss_overlay", {})
    await session.snapshot()
    submit = session.last_snapshot.find("Create account", role="button")  # type: ignore[union-attr]
    r = await tools.run("click", {"ref": submit.ref})  # type: ignore[union-attr]
    assert r.ok and r.target_label == "Create account"
    assert r.locator and r.locator["role"] == "button"
    snap = await session.snapshot()
    # `required` makes Chrome block the submit with a native bubble that is not in the DOM.
    assert any(
        m.kind == "native_validation" and m.text.startswith("Full name") for m in snap.messages
    ), snap.messages

    await tools.run("type_text", {"ref": snap.find("Full name").ref, "text": "Anna"})  # type: ignore[union-attr]
    await tools.run("check", {"ref": snap.find("I accept the terms").ref})  # type: ignore[union-attr]
    r = await tools.run("select_option", {"ref": snap.find("Country").ref, "value": "France"})  # type: ignore[union-attr]
    assert r.ok, r.message
    await tools.run("click", {"ref": snap.find("Create account", role="button").ref})  # type: ignore[union-attr]
    assert (await session.snapshot()).title == "Welcome"


async def test_secrets_substituted_but_never_logged(session: BrowserSession, site: str) -> None:
    tools = BrowserTools(session, secrets={"TEST_PASSWORD": "hunter2-secret"})
    await open_page(tools, site, "form.html")
    pw = session.last_snapshot.find("Password")  # type: ignore[union-attr]
    r = await tools.run("type_text", {"ref": pw.ref, "text": "{{TEST_PASSWORD}}"})  # type: ignore[union-attr]
    assert r.ok
    assert await session.page.input_value("#pw") == "hunter2-secret"
    assert "hunter2" not in r.message and r.logged_args["text"] == "••••••"
    snap = await session.snapshot()
    assert "hunter2" not in format_snapshot(snap)
    bad = await tools.run("type_text", {"ref": pw.ref, "text": "{{UNKNOWN}}"})  # type: ignore[union-attr]
    assert not bad.ok and "unknown placeholder" in bad.message


async def test_navigation_outside_allowlist_is_blocked(session: BrowserSession, site: str) -> None:
    tools = BrowserTools(session)
    r = await tools.run("navigate", {"url": "https://example.org/"})
    assert not r.ok and "outside the allowed origins" in r.message
    await open_page(tools, site, "form.html")
    link = session.last_snapshot.find("External link")  # type: ignore[union-attr]
    r = await tools.run("click", {"ref": link.ref})  # type: ignore[union-attr]
    assert not r.ok and "navigation blocked" in r.message
    assert session.page.url.startswith(site), session.page.url
    assert any("outside allowed origins" in b for b in session.drain_signals().blocked_requests)


async def test_redirect_out_of_site_is_blocked(session: BrowserSession, site: str) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "form.html")
    offer = session.last_snapshot.find("Partner offer")  # type: ignore[union-attr]
    await tools.run("click", {"ref": offer.ref})  # type: ignore[union-attr]
    assert session.page.url.startswith(site), session.page.url


async def test_private_network_requests_blocked_and_signals_collected(
    session: BrowserSession, site: str
) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "leak.html")
    await session.page.wait_for_timeout(300)
    signals = session.drain_signals()
    assert any("169.254.169.254" in b for b in signals.blocked_requests)
    assert any("/missing.json → 404" in e for e in signals.http_errors)


async def test_console_errors_recorded(session: BrowserSession, site: str) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "form.html")
    session.drain_signals()
    await tools.run("dismiss_overlay", {})
    await session.snapshot()
    await tools.run("click", {"ref": session.last_snapshot.find("Broken").ref})  # type: ignore[union-attr]
    errors = session.drain_signals().console_errors
    assert any("undefinedFn is not defined" in e for e in errors)


async def test_payment_guard_refuses_pay_click_and_enter(
    session: BrowserSession, site: str
) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "payment.html")
    assert session.last_snapshot.payment_fields  # type: ignore[union-attr]
    pay = session.last_snapshot.find("Pay now €16.10")  # type: ignore[union-attr]
    r = await tools.run("click", {"ref": pay.ref})  # type: ignore[union-attr]
    assert not r.ok and "payment guard" in r.message
    assert not (await tools.run("press_key", {"key": "Enter"})).ok
    assert await session.page.title() == "Payment"  # never clicked


async def test_blocker_detection_captcha(session: BrowserSession, site: str) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "captcha.html")
    assert session.blocker(session.last_snapshot) == "CAPTCHA on the page"  # type: ignore[arg-type]


async def test_screenshot_and_unknown_ref(
    session: BrowserSession, site: str, tmp_path: Path
) -> None:
    tools = BrowserTools(session)
    await open_page(tools, site, "form.html")
    size = await session.screenshot(tmp_path / "s.jpg")
    assert size > 1000
    r = await tools.run("click", {"ref": 999})
    assert not r.ok and "not found" in r.message


def test_describe_action() -> None:
    assert describe_action("click", {"ref": 3}, "Remove", "") == 'Click "Remove"'
    assert describe_action("type_text", {"text": "SUMMER24"}, "Coupon code", "") == (
        'Type "SUMMER24" in "Coupon code"'
    )
    assert describe_action("navigate", {"url": "https://s.example/cart"}, None, "") == "Open /cart"
