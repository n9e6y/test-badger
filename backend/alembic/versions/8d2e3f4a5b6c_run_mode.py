"""run mode thorough/quick (D17)

Revision ID: 8d2e3f4a5b6c
Revises: 7c1d2e3f4a5b
Create Date: 2026-10-08 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8d2e3f4a5b6c"
down_revision: str | Sequence[str] | None = "7c1d2e3f4a5b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema. Existing runs were all thorough (Sonnet executor)."""
    op.add_column(
        "runs",
        sa.Column("mode", sa.String(length=10), server_default="thorough", nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("runs", "mode")
