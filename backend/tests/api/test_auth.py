from __future__ import annotations

from httpx import AsyncClient

SIGNUP = {"name": "Anna Becker", "email": "Anna@Example.com", "password": "Secret123!"}


async def test_signup_sets_cookie_and_me_works(client: AsyncClient) -> None:
    r = await client.post("/api/auth/signup", json=SIGNUP)
    assert r.status_code == 201
    assert "shipcheck_session" in r.cookies
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "anna@example.com"


async def test_duplicate_email_rejected(client: AsyncClient) -> None:
    await client.post("/api/auth/signup", json=SIGNUP)
    r = await client.post("/api/auth/signup", json=SIGNUP)
    assert r.status_code == 409


async def test_short_password_rejected(client: AsyncClient) -> None:
    r = await client.post("/api/auth/signup", json={**SIGNUP, "password": "short"})
    assert r.status_code == 422


async def test_login_wrong_password_is_generic(client: AsyncClient) -> None:
    await client.post("/api/auth/signup", json=SIGNUP)
    client.cookies.clear()
    bad = {"email": SIGNUP["email"], "password": "nope1234"}
    r = await client.post("/api/auth/login", json=bad)
    assert r.status_code == 401
    assert r.json()["detail"] == "Wrong email or password."
    unknown = await client.post(
        "/api/auth/login", json={"email": "who@example.com", "password": "nope1234"}
    )
    assert unknown.json()["detail"] == r.json()["detail"]


async def test_login_logout_flow(client: AsyncClient) -> None:
    await client.post("/api/auth/signup", json=SIGNUP)
    client.cookies.clear()
    r = await client.post(
        "/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
    )
    assert r.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200
    await client.post("/api/auth/logout")
    client.cookies.clear()
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_health(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.json() == {"status": "ok"}


async def test_failed_logins_are_rate_limited_per_ip(client: AsyncClient) -> None:
    """Hardening before going public: 10 failed log-ins per IP per 15 minutes, then 429."""
    await client.post("/api/auth/signup", json=SIGNUP)
    await client.post("/api/auth/logout")
    for _ in range(10):
        r = await client.post(
            "/api/auth/login", json={"email": SIGNUP["email"], "password": "wrong-password"}
        )
        assert r.status_code == 401
    r = await client.post(
        "/api/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
    )
    assert r.status_code == 429 and "15 minutes" in r.json()["detail"]


async def test_signups_are_rate_limited_per_ip(client: AsyncClient) -> None:
    for i in range(10):
        r = await client.post(
            "/api/auth/signup",
            json={"name": "N", "email": f"n{i}@example.com", "password": "Secret123!"},
        )
        assert r.status_code == 201
    r = await client.post(
        "/api/auth/signup", json={"name": "N", "email": "n10@example.com", "password": "Secret123!"}
    )
    assert r.status_code == 429
