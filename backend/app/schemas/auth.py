from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    # D25: what this account may do (filled by the auth routes)
    is_judge: bool = False
    modes: list[str] = ["quick"]
    runs_per_day: int = 0
    runs_left_today: int = 0
    budget_left_usd: float | None = None  # D26: the tier's AI money left (None = no limit)
