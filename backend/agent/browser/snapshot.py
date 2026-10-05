"""Typed page snapshot + the compact text the executor LLM reads (03 §5.1)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

SNAPSHOT_JS = (Path(__file__).parent / "snapshot.js").read_text()


class Locator(BaseModel):
    role: str
    name: str
    css: str


class Element(BaseModel):
    ref: int
    role: str
    name: str
    tag: str
    type: str | None = None
    value: str | None = None
    has_value: bool | None = None
    required: bool = False
    disabled: bool = False
    checked: bool | None = None
    invalid: bool = False
    href: str | None = None
    autocomplete: str | None = None
    form: str | None = None
    in_overlay: bool = False
    options: list[str] | None = None
    locator: Locator

    @property
    def label(self) -> str:
        """Human-readable target used in step logs and repro steps (never the ref)."""
        return self.name or self.locator.css


class Message(BaseModel):
    kind: str
    text: str


class PageSnapshot(BaseModel):
    url: str
    title: str
    elements: list[Element] = Field(default_factory=list)
    messages: list[Message] = Field(default_factory=list)
    overlays: list[str] = Field(default_factory=list)
    frames: list[dict[str, str]] = Field(default_factory=list)
    payment_fields: bool = False
    text: str = ""

    def element(self, ref: int) -> Element | None:
        return next((e for e in self.elements if e.ref == ref), None)

    def find(self, name: str, role: str | None = None) -> Element | None:
        """Lookup by visible name (case-insensitive). Used by scripts and tests, not the LLM."""
        needle = name.lower()
        for e in self.elements:
            if (role is None or e.role == role) and e.name.lower() == needle:
                return e
        return next(
            (
                e
                for e in self.elements
                if (role is None or e.role == role) and needle in e.name.lower()
            ),
            None,
        )


def _describe(e: Element) -> str:
    parts = [f"[{e.ref}] {e.role}", f'"{e.name}"' if e.name else '""']
    if e.type and e.role == "textbox" and e.type not in ("text", "textarea"):
        parts.append(f"type={e.type}")
    flags = [
        f
        for f, on in (("required", e.required), ("disabled", e.disabled), ("invalid", e.invalid))
        if on
    ]
    if flags:
        parts.append(f"({', '.join(flags)})")
    if e.checked is not None:
        parts.append("checked" if e.checked else "unchecked")
    if e.has_value is not None:
        parts.append("value=••••••" if e.has_value else 'value=""')
    elif e.value is not None:
        parts.append(f'value="{e.value}"')
    if e.options:
        parts.append(f"options={e.options}")
    if e.href and e.role == "link":
        parts.append(f"-> {e.href}")
    return " ".join(parts)


def format_snapshot(snap: PageSnapshot, signals_line: str = "") -> str:
    """Compact text observation. Groups form fields by form; overlay elements are marked."""
    lines = [f"URL: {snap.url}", f"TITLE: {snap.title}"]
    if snap.messages:
        lines.append("MESSAGES:")
        lines += [f"  ({m.kind}) {m.text}" for m in snap.messages]
    else:
        lines.append("MESSAGES: (none)")
    lines.append("OVERLAYS: " + (" | ".join(snap.overlays) if snap.overlays else "(none)"))

    overlay = [e for e in snap.elements if e.in_overlay]
    if overlay:
        lines.append("IN OVERLAY:")
        lines += [f"  {_describe(e)}" for e in overlay]
    forms: dict[str, list[Element]] = {}
    for e in snap.elements:
        if not e.in_overlay and e.form is not None:
            forms.setdefault(e.form or "(unnamed form)", []).append(e)
    for name, items in forms.items():
        lines.append(f'FORM "{name}":')
        lines += [f"  {_describe(e)}" for e in items]
    other = [e for e in snap.elements if not e.in_overlay and e.form is None]
    if other:
        lines.append("OTHER ELEMENTS:")
        lines += [f"  {_describe(e)}" for e in other]
    if snap.text:
        lines.append(f"PAGE TEXT: {snap.text}")
    if signals_line:
        lines.append(f"NEW SINCE LAST STEP: {signals_line}")
    return "\n".join(lines)


def parse_snapshot(raw: dict[str, Any]) -> PageSnapshot:
    return PageSnapshot.model_validate(raw)
