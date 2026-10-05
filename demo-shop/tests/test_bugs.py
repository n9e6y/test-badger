"""Each planted bug: buggy with the switch on, correct with it off (clean mode)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from shop import store

VALID = {
    "full_name": "Anna Becker",
    "email": "anna@example.com",
    "password": "Secret123!",
    "confirm_password": "Secret123!",
}
SHIPPING = {
    "full_name": "Anna Becker",
    "email": "anna@example.com",
    "phone": "+49 30 1234567",
    "address": "Torstr. 1",
    "city": "Berlin",
    "postal_code": "10115",
}


def signup(c: TestClient, **over: str):
    return c.post("/signup", data={**VALID, **over})


def add(c: TestClient, slug: str = "ceramic-mug", qty: str = "1"):
    return c.post("/cart/add", data={"slug": slug, "quantity": qty})


def test_all_pages_render(client: TestClient) -> None:
    for path in [
        "/",
        "/products",
        "/products/ceramic-mug",
        "/cart",
        "/signup",
        "/login",
        "/partners/apply",
        "/partners/captcha",
    ]:
        assert client.get(path).status_code == 200, path


def test_valid_signup_then_login(bugs_off: TestClient) -> None:
    assert "Welcome!" in signup(bugs_off).text
    bugs_off.post("/logout")
    r = bugs_off.post("/login", data={"email": VALID["email"], "password": VALID["password"]})
    assert "Hello, Anna Becker" in r.text


def test_b1_invalid_email(client: TestClient, bugs_off: TestClient) -> None:
    assert "Enter a valid email." in signup(bugs_off, email="anna@").text
    store.set_switch("B1", True)
    assert "Welcome!" in signup(client, email="anna@").text


def test_b2_password_confirmation(bugs_off: TestClient) -> None:
    assert "Passwords don&#39;t match." in signup(bugs_off, confirm_password="Secret999!").text
    store.set_switch("B2", True)
    assert "Welcome!" in signup(bugs_off, confirm_password="Secret999!").text


def test_weak_password_always_rejected(client: TestClient) -> None:
    r = signup(client, password="123", confirm_password="123")
    assert "at least 8 characters" in r.text


def test_b3_duplicate_email(bugs_off: TestClient) -> None:
    signup(bugs_off)
    assert "already exists" in signup(bugs_off).text
    store.set_switch("B3", True)
    r = signup(bugs_off, password="Other1234!", confirm_password="Other1234!")
    assert "Welcome!" in r.text
    bugs_off.post("/logout")
    r = bugs_off.post("/login", data={"email": VALID["email"], "password": "Other1234!"})
    assert "Wrong email or password." in r.text


def test_b4_empty_name(client: TestClient, bugs_off: TestClient) -> None:
    r = signup(bugs_off, full_name="")
    assert r.status_code == 422 and "Name is required." in r.text
    store.set_switch("B4", True)
    assert signup(client, full_name="").status_code == 500


def test_b5_remove_button(client: TestClient) -> None:
    add(client)
    assert "removeLine(" in client.get("/cart").text  # undefined in shop.js -> ReferenceError
    store.set_switch("B5", False)
    assert "removeCartItem(" in client.get("/cart").text
    assert client.post("/cart/remove", data={"slug": "ceramic-mug"}).status_code == 204
    assert "Your cart is empty." in client.get("/cart").text


def test_b6_negative_quantity(client: TestClient, bugs_off: TestClient) -> None:
    add(bugs_off)
    r = bugs_off.post("/cart/update", data={"slug": "ceramic-mug", "quantity": "-2"})
    assert "Quantity must be at least 1." in r.text
    store.set_switch("B6", True)
    r = client.post("/cart/update", data={"slug": "ceramic-mug", "quantity": "-2"})
    assert "−€28.00" in r.text or "€-28.00" in r.text


def test_b7_expired_coupon(client: TestClient, bugs_off: TestClient) -> None:
    add(bugs_off)
    r = bugs_off.post("/cart/coupon", data={"code": "SUMMER24"})
    assert "This coupon has expired." in r.text
    assert "10% off" in bugs_off.post("/cart/coupon", data={"code": "WELCOME10"}).text
    assert "not valid" in bugs_off.post("/cart/coupon", data={"code": "INVALID123"}).text
    store.set_switch("B7", True)
    assert "20% off" in client.post("/cart/coupon", data={"code": "SUMMER24"}).text


def test_b8_out_of_stock(client: TestClient, bugs_off: TestClient) -> None:
    page = bugs_off.get("/products/linen-tote-bag").text
    assert "disabled>Out of stock" in page
    assert "out of stock" in add(bugs_off, "linen-tote-bag").text
    store.set_switch("B8", True)
    assert "Linen Tote Bag was added" in add(client, "linen-tote-bag").text
    client.post("/checkout", data=SHIPPING)
    assert "Pay now" in client.get("/checkout/payment").text


def test_b9_postal_code_with_space(client: TestClient, bugs_off: TestClient) -> None:
    add(bugs_off)
    assert "data-strict-postal" not in bugs_off.get("/checkout").text
    r = bugs_off.post("/checkout", data={**SHIPPING, "postal_code": "10 115"})
    assert "Pay now" in r.text  # followed redirect to payment
    store.set_switch("B9", True)
    assert "data-strict-postal" in client.get("/checkout").text


def test_checkout_field_errors(bugs_off: TestClient) -> None:
    add(bugs_off)
    r = bugs_off.post("/checkout", data={**SHIPPING, "full_name": "", "email": "nope"})
    assert r.status_code == 422
    assert "Full name is required." in r.text and "Enter a valid email address." in r.text


def test_partners_captcha_blocks(client: TestClient) -> None:
    page = client.get("/partners/apply").text
    assert 'title="reCAPTCHA"' in page and "g-recaptcha" in page
    assert "Please complete the CAPTCHA." in client.post("/partners/apply").text


def test_admin_requires_token(client: TestClient) -> None:
    assert client.get("/__admin").status_code == 404
    assert client.get(f"/__admin?token={store.ADMIN_TOKEN}").status_code == 200
    client.post(f"/__admin?token={store.ADMIN_TOKEN}", data={"action": "clean"})
    assert not any(v for k, v in store.switches().items() if k.startswith("B"))


def test_checkout_empty_fields_say_required(bugs_off: TestClient) -> None:
    add(bugs_off)
    r = bugs_off.post("/checkout", data={**SHIPPING, "postal_code": "", "phone": ""})
    assert "Postal code is required." in r.text and "Phone is required." in r.text
    r = bugs_off.post("/checkout", data={**SHIPPING, "postal_code": "ABC"})
    assert "Enter a valid postal code" in r.text
