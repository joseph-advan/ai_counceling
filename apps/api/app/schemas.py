from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant", "system"]
    content: str
    seq_no: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionSummaryOut(BaseModel):
    id: str
    student_name: str
    case_name: str
    theory: str
    status: str
    turn_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionDetailOut(SessionSummaryOut):
    feedback: str | None = None
    messages: list[MessageOut] = Field(default_factory=list)


class SessionCreateIn(BaseModel):
    student_name: str = Field(min_length=1, max_length=120)
    case_name: str = "Ruth"
    theory: str = "PCC"


class UserMessageIn(BaseModel):
    content: str = Field(min_length=1)


class ChatTurnOut(BaseModel):
    session: SessionDetailOut
    assistant_message: MessageOut


class CompleteOut(BaseModel):
    session: SessionDetailOut
    generated_feedback: str


class DeleteManyOut(BaseModel):
    deleted_count: int


class PublicConfigOut(BaseModel):
    max_turns: int
    admin_protected: bool
