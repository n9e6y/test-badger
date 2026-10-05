"""Pine & Pebble — demo shop with planted bugs B1–B9 (see doc 05). DO NOT FIX THE BUGS."""

from __future__ import annotations

import os
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from shop import store
from shop.store import COUPONS, PRODUCTS, PRODUCTS_BY_SLUG, bug_enabled

ROOT = Path(__file__).resolve().parent.parent
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
POSTAL_RE = re.compile(r"^\d{5}$|^\d{2} \d{3}$")
PHONE_RE = re.compile(r"^\+?[\d\s()-]{7,20}$")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    store.init_db()
    yield


app = FastAPI(
    title="Pine & Pebble", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
)
app.add_middleware(
    SessionMiddleware, secret_key=os.environ.get("SHOP_SESSION_SECRET", "pine-and-pebble-dev")
)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
templates = Jinja2Templates(directory=ROOT / "templates")
templates.env.filters["eur"] = lambda cents: f"€{cents / 100:,.2f}"


# ---------- helpers ----------


def cart_of(request: Request) -> dict[str, int]:
    return dict(request.session.get("cart", {}))


def save_cart(request: Request, cart: dict[str, int]) -> None:
    # Assign a new value: the session is only re-saved when a top-level key is set.
    request.session["cart"] = cart


def flash(request: Request, message: str, kind: str = "error") -> None:
    request.session["flash"] = {"message": message, "kind": kind}


def cart_summary(request: Request) -> dict[str, Any]:
    lines = []
    for slug, qty in cart_of(request).items():
        product = PRODUCTS_BY_SLUG[slug]
        lines.append({"product": product, "qty": qty, "total": product.price_cents * qty})
    subtotal = sum(line["total"] for line in lines)
    code = request.session.get("coupon")
    percent = COUPONS[code][0] if code in COUPONS else 0
    discount = round(subtotal * percent / 100)
    shipping = 0 if subtotal >= 5000 or not lines else 490
    return {
        "lines": lines,
        "subtotal": subtotal,
        "coupon": code,
        "percent": percent,
        "discount": discount,
        "shipping": shipping,
        "total": subtotal - discount + shipping,
    }


def render(request: Request, template: str, status_code: int = 200, **ctx: Any) -> HTMLResponse:
    user_id = request.session.get("user_id")
    ctx.update(
        user=store.get_user(user_id) if user_id else None,
        cart_count=sum(cart_of(request).values()),
        flash=request.session.pop("flash", None),
        switches=store.switches(),
    )
    return templates.TemplateResponse(request, template, ctx, status_code=status_code)


def parse_qty(raw: str) -> int | None:
    try:
        return int(raw.strip())
    except ValueError:
        return None


def qty_error(product: store.Product, qty: int | None, adding: bool) -> str | None:
    if qty is None:
        return "Enter a whole number for the quantity."
    if qty < 1 and not bug_enabled("B6"):
        if qty == 0 and not adding:
            return None  # 0 in the cart means "remove the item"
        return "Quantity must be at least 1."
    if product.stock == 0:
        if not bug_enabled("B8"):
            return f"{product.name} is out of stock."
    elif qty > product.stock:
        return f"Only {product.stock} left in stock."
    return None


def back_to(path: str) -> RedirectResponse:
    return RedirectResponse(path, status_code=303)


# ---------- catalog ----------


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    return render(request, "home.html", products=PRODUCTS)


@app.get("/products", response_class=HTMLResponse)
def catalog(request: Request) -> HTMLResponse:
    return render(request, "products.html", products=PRODUCTS)


@app.get("/products/{slug}", response_class=HTMLResponse)
def product_page(request: Request, slug: str) -> HTMLResponse:
    product = PRODUCTS_BY_SLUG.get(slug)
    if product is None:
        raise HTTPException(404)
    return render(request, "product.html", product=product)


# ---------- cart ----------


@app.post("/cart/add")
def cart_add(request: Request, slug: str = Form(...), quantity: str = Form("1")) -> Response:
    product = PRODUCTS_BY_SLUG.get(slug)
    if product is None:
        raise HTTPException(404)
    qty = parse_qty(quantity)
    cart = cart_of(request)
    error = qty_error(product, qty, adding=True)
    if not error and qty and product.stock and cart.get(slug, 0) + qty > product.stock:
        error = f"Only {product.stock} left in stock."
    if error:
        flash(request, error)
        return back_to(f"/products/{slug}")
    cart[slug] = cart.get(slug, 0) + (qty or 0)
    save_cart(request, cart)
    flash(request, f"{product.name} was added to your cart.", "success")
    return back_to("/cart")


@app.get("/cart", response_class=HTMLResponse)
def cart_page(request: Request) -> HTMLResponse:
    return render(request, "cart.html", cart=cart_summary(request))


@app.post("/cart/update")
def cart_update(request: Request, slug: str = Form(...), quantity: str = Form(...)) -> Response:
    cart = cart_of(request)
    product = PRODUCTS_BY_SLUG.get(slug)
    if product is None or slug not in cart:
        return back_to("/cart")
    qty = parse_qty(quantity)
    if error := qty_error(product, qty, adding=False):
        flash(request, error)
    elif qty == 0:
        cart.pop(slug)
    else:
        cart[slug] = qty or 0
    save_cart(request, cart)
    return back_to("/cart")


@app.post("/cart/remove", status_code=204)
def cart_remove(request: Request, slug: str = Form(...)) -> None:
    cart = cart_of(request)
    cart.pop(slug, None)
    save_cart(request, cart)


@app.post("/cart/coupon")
def cart_coupon(request: Request, code: str = Form("")) -> Response:
    code = code.strip().upper()
    if code not in COUPONS:
        flash(request, "This coupon code is not valid.")
    elif COUPONS[code][1] and not bug_enabled("B7"):
        flash(request, "This coupon has expired.")
    else:
        request.session["coupon"] = code
        flash(request, f"Coupon {code} applied: {COUPONS[code][0]}% off.", "success")
    return back_to("/cart")


# ---------- checkout ----------

CHECKOUT_FIELDS = ["full_name", "email", "phone", "address", "city", "postal_code"]


def checkout_errors(data: dict[str, str]) -> dict[str, str]:
    errors = {}
    labels = {"full_name": "Full name", "address": "Address", "city": "City"}
    for key, label in labels.items():
        if not data[key]:
            errors[key] = f"{label} is required."
    if not EMAIL_RE.match(data["email"]):
        errors["email"] = "Enter a valid email address."
    if not PHONE_RE.match(data["phone"]):
        errors["phone"] = "Enter a valid phone number."
    if not POSTAL_RE.match(data["postal_code"]):
        errors["postal_code"] = "Enter a valid postal code, e.g. 10115."
    return errors


def stock_problem(request: Request) -> str | None:
    if bug_enabled("B8"):
        return None
    for slug, qty in cart_of(request).items():
        product = PRODUCTS_BY_SLUG[slug]
        if qty > product.stock:
            return f"{product.name} is out of stock. Remove it to continue."
    return None


@app.get("/checkout", response_class=HTMLResponse)
def checkout_page(request: Request) -> Response:
    if not cart_of(request):
        return back_to("/cart")
    if problem := stock_problem(request):
        flash(request, problem)
        return back_to("/cart")
    data = request.session.get("shipping") or dict.fromkeys(CHECKOUT_FIELDS, "")
    return render(request, "checkout.html", cart=cart_summary(request), data=data, errors={})


@app.post("/checkout", response_class=HTMLResponse)
async def checkout_submit(request: Request) -> Response:
    form = await request.form()
    data = {key: str(form.get(key, "")).strip() for key in CHECKOUT_FIELDS}
    if not cart_of(request):
        return back_to("/cart")
    if errors := checkout_errors(data):
        return render(
            request, "checkout.html", 422, cart=cart_summary(request), data=data, errors=errors
        )
    request.session["shipping"] = data
    return back_to("/checkout/payment")


@app.get("/checkout/payment", response_class=HTMLResponse)
def payment_page(request: Request) -> Response:
    if not cart_of(request) or not request.session.get("shipping"):
        return back_to("/checkout")
    return render(
        request, "payment.html", cart=cart_summary(request), shipping=request.session["shipping"]
    )


# ---------- accounts ----------


@app.get("/signup", response_class=HTMLResponse)
def signup_page(request: Request) -> HTMLResponse:
    return render(request, "signup.html", data={}, errors={})


@app.post("/signup", response_class=HTMLResponse)
def signup_submit(
    request: Request,
    full_name: str = Form(""),
    email: str = Form(""),
    password: str = Form(""),
    confirm_password: str = Form(""),
) -> Response:
    name, email = full_name.strip(), email.strip().lower()
    errors: dict[str, str] = {}
    if not name:
        if bug_enabled("B4"):
            raise RuntimeError("NOT NULL constraint failed: users.name")
        errors["full_name"] = "Name is required."
    if not email:
        errors["email"] = "Email is required."
    elif not EMAIL_RE.match(email) and not bug_enabled("B1"):
        errors["email"] = "Enter a valid email."
    if len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."
    elif password != confirm_password and not bug_enabled("B2"):
        errors["confirm_password"] = "Passwords don't match."
    if not errors and store.find_user(email):
        if bug_enabled("B3"):
            return render(request, "welcome.html", name=name)
        errors["email"] = "An account with this email already exists."
    if errors:
        data = {"full_name": full_name, "email": email}
        return render(request, "signup.html", 422, data=data, errors=errors)
    request.session["user_id"] = store.create_user(name, email, password)
    return render(request, "welcome.html", name=name)


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request) -> HTMLResponse:
    return render(request, "login.html", email="", error=None)


@app.post("/login", response_class=HTMLResponse)
def login_submit(request: Request, email: str = Form(""), password: str = Form("")) -> Response:
    user = store.find_user(email.strip().lower())
    if user is None or not store.check_password(user, password):
        return render(request, "login.html", 401, email=email, error="Wrong email or password.")
    request.session["user_id"] = user["id"]
    return back_to("/account")


@app.post("/logout")
def logout(request: Request) -> Response:
    request.session.pop("user_id", None)
    return back_to("/")


@app.get("/account", response_class=HTMLResponse)
def account(request: Request) -> Response:
    if not request.session.get("user_id"):
        return back_to("/login")
    return render(request, "account.html")


# ---------- partners (fake CAPTCHA → Blocked) ----------


@app.get("/partners/apply", response_class=HTMLResponse)
def partners_page(request: Request) -> HTMLResponse:
    return render(request, "partners.html", error=None)


@app.post("/partners/apply", response_class=HTMLResponse)
def partners_submit(request: Request) -> HTMLResponse:
    return render(request, "partners.html", 400, error="Please complete the CAPTCHA.")


@app.get("/partners/captcha", response_class=HTMLResponse)
def captcha_frame(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "captcha_frame.html", {})


# ---------- admin (for us, not judges) ----------


def require_admin(token: str) -> None:
    if token != store.ADMIN_TOKEN:
        raise HTTPException(404)


@app.get("/__admin", response_class=HTMLResponse)
def admin_page(request: Request, token: str = "") -> HTMLResponse:
    require_admin(token)
    ctx = {"token": token, "bugs": store.BUGS, "distractors": store.DISTRACTORS}
    return render(request, "admin.html", **ctx)


@app.post("/__admin")
async def admin_submit(request: Request, token: str = "") -> Response:
    require_admin(token)
    form = await request.form()
    action = form.get("action")
    if action == "clean":
        store.set_all_bugs(False)
    elif action == "all_bugs":
        store.set_all_bugs(True)
    elif action == "reset":
        store.reset_data()
    elif action == "save":
        for key in [*store.BUGS, *store.DISTRACTORS]:
            store.set_switch(key, form.get(key) == "on")
    return back_to(f"/__admin?token={token}")


@app.get("/__health")
def health() -> dict[str, str]:
    return {"status": "ok"}
