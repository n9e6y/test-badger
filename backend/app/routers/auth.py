from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.schemas.auth import LoginIn, SignupIn, UserOut
from app.security import (
    CurrentUser,
    clear_session_cookie,
    hash_password,
    set_session_cookie,
    verify_password,
)
from app.services.accounts import budget_left, policy_for, runs_today

router = APIRouter(prefix="/auth", tags=["auth"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def user_out(session: AsyncSession, user: User) -> UserOut:
    """The account plus its D25 rights, so the UI can offer only what will be accepted."""
    policy = policy_for(user.email)
    out = UserOut.model_validate(user)
    out.is_judge, out.modes, out.runs_per_day = (
        policy.is_judge,
        list(policy.modes),
        policy.runs_per_day,
    )
    out.runs_left_today = max(0, policy.runs_per_day - await runs_today(session, user.id))
    left = await budget_left(session, policy.key_tier)
    out.budget_left_usd = None if left is None else round(left, 2)
    return out


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupIn, response: Response, session: Session) -> UserOut:
    email = body.email.lower()
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    session.add(user)
    await session.commit()
    set_session_cookie(response, user.id)
    return await user_out(session, user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response, session: Session) -> UserOut:
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(user.password_hash, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password.")
    set_session_cookie(response, user.id)
    return await user_out(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    clear_session_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, session: Session) -> UserOut:
    return await user_out(session, user)
