"""initial schema

Revision ID: 20260503_0001
Revises:
Create Date: 2026-05-03 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260503_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "counseling_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("student_name", sa.String(length=120), nullable=False),
        sa.Column("case_name", sa.String(length=50), nullable=False, server_default="Ruth"),
        sa.Column("theory", sa.String(length=30), nullable=False, server_default="PCC"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="practice"),
        sa.Column("turn_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_counseling_sessions_student_name", "counseling_sessions", ["student_name"])
    op.create_index("ix_counseling_sessions_status", "counseling_sessions", ["status"])

    op.create_table(
        "session_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True, nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("seq_no", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["counseling_sessions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_id", "seq_no", name="uq_session_seq_no"),
    )


def downgrade() -> None:
    op.drop_table("session_messages")
    op.drop_index("ix_counseling_sessions_status", table_name="counseling_sessions")
    op.drop_index("ix_counseling_sessions_student_name", table_name="counseling_sessions")
    op.drop_table("counseling_sessions")
