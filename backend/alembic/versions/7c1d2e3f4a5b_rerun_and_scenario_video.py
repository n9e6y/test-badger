"""re-run parent link (D21) and scenario video (D22)

Revision ID: 7c1d2e3f4a5b
Revises: 3489b6ff7b80
Create Date: 2026-10-07 23:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c1d2e3f4a5b"
down_revision: str | Sequence[str] | None = "3489b6ff7b80"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("runs", sa.Column("parent_run_id", sa.String(length=36), nullable=True))
    op.create_index(op.f("ix_runs_parent_run_id"), "runs", ["parent_run_id"], unique=False)
    op.create_foreign_key("fk_runs_parent_run_id_runs", "runs", "runs", ["parent_run_id"], ["id"])
    op.add_column("scenarios", sa.Column("video_artifact_id", sa.String(length=36), nullable=True))
    op.add_column("scenarios", sa.Column("video_start_s", sa.Float(), nullable=True))
    op.add_column("scenarios", sa.Column("video_end_s", sa.Float(), nullable=True))
    op.create_foreign_key(
        "fk_scenarios_video_artifact_id_artifacts",
        "scenarios",
        "artifacts",
        ["video_artifact_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_scenarios_video_artifact_id_artifacts", "scenarios", type_="foreignkey")
    op.drop_column("scenarios", "video_end_s")
    op.drop_column("scenarios", "video_start_s")
    op.drop_column("scenarios", "video_artifact_id")
    op.drop_constraint("fk_runs_parent_run_id_runs", "runs", type_="foreignkey")
    op.drop_index(op.f("ix_runs_parent_run_id"), table_name="runs")
    op.drop_column("runs", "parent_run_id")
