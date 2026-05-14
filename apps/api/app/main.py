from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect as sa_inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .db import engine, get_db
from .llm import generate_case_reply, generate_supervision_feedback
from .models import CounselingSession, SessionMessage
from .schemas import (
    ChatTurnOut,
    CompleteOut,
    DeleteManyOut,
    PublicConfigOut,
    SessionCreateIn,
    SessionDetailOut,
    SessionSummaryOut,
    UserMessageIn,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_schema_ready() -> None:
    inspector = sa_inspect(engine)
    required_tables = {"counseling_sessions", "session_messages"}
    existing_tables = set(inspector.get_table_names())
    missing = sorted(required_tables - existing_tables)
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(
            f"Database schema is not ready (missing tables: {joined}). "
            "Run `alembic upgrade head` before starting the API."
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    _ensure_schema_ready()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_admin_access(x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")) -> None:
    if not settings.admin_api_key:
        return
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin key.")


def _get_session_or_404(
    db: Session,
    session_id: str,
    *,
    with_messages: bool = True,
    for_update: bool = False,
) -> CounselingSession:
    stmt = select(CounselingSession).where(CounselingSession.id == session_id)
    if with_messages:
        stmt = stmt.options(selectinload(CounselingSession.messages))
    if for_update:
        stmt = stmt.with_for_update()
    session_obj = db.scalar(stmt)
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return session_obj


def _session_detail(session_obj: CounselingSession) -> SessionDetailOut:
    return SessionDetailOut.model_validate(session_obj)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/public/config", response_model=PublicConfigOut)
def get_public_config() -> PublicConfigOut:
    return PublicConfigOut(
        max_turns=settings.max_turns,
        admin_protected=bool(settings.admin_api_key),
    )


@app.post("/sessions", response_model=SessionDetailOut, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreateIn, db: Session = Depends(get_db)) -> SessionDetailOut:
    session_obj = CounselingSession(
        id=str(uuid4()),
        student_name=payload.student_name.strip(),
        case_name=payload.case_name.strip() or "Ruth",
        theory=payload.theory.strip() or "PCC",
        status="practice",
        turn_count=0,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)
    return _session_detail(session_obj)


@app.get("/sessions", response_model=list[SessionSummaryOut])
def list_sessions(
    student_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[SessionSummaryOut]:
    normalized_name = (student_name or "").strip()
    if not normalized_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="student_name is required for this endpoint.",
        )
    stmt = (
        select(CounselingSession)
        .where(CounselingSession.student_name == normalized_name)
        .order_by(CounselingSession.updated_at.desc())
    )
    rows = list(db.scalars(stmt))
    return [SessionSummaryOut.model_validate(row) for row in rows]


@app.get(
    "/admin/sessions",
    response_model=list[SessionSummaryOut],
    dependencies=[Depends(require_admin_access)],
)
def admin_list_sessions(db: Session = Depends(get_db)) -> list[SessionSummaryOut]:
    stmt = select(CounselingSession).order_by(CounselingSession.updated_at.desc())
    rows = list(db.scalars(stmt))
    return [SessionSummaryOut.model_validate(row) for row in rows]


@app.get("/sessions/{session_id}", response_model=SessionDetailOut)
def get_session(session_id: str, db: Session = Depends(get_db)) -> SessionDetailOut:
    session_obj = _get_session_or_404(db, session_id, with_messages=True)
    return _session_detail(session_obj)


@app.post("/sessions/{session_id}/messages", response_model=ChatTurnOut)
def add_message(
    session_id: str,
    payload: UserMessageIn,
    db: Session = Depends(get_db),
) -> ChatTurnOut:
    # Step 1: Read current history for LLM generation.
    session_obj = _get_session_or_404(db, session_id, with_messages=True)
    if session_obj.turn_count >= settings.max_turns:
        session_obj.status = "review_pending"
        session_obj.updated_at = utc_now()
        db.add(session_obj)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Max turns reached ({settings.max_turns}). Complete the session for supervision.",
        )

    history = [{"role": m.role, "content": m.content} for m in session_obj.messages]
    assistant_text = generate_case_reply(payload.content.strip(), history)

    # Step 2: Lock the target session before writing to avoid concurrent seq/turn conflicts.
    try:
        locked_session = _get_session_or_404(db, session_id, with_messages=False, for_update=True)
        if locked_session.turn_count >= settings.max_turns:
            locked_session.status = "review_pending"
            locked_session.updated_at = utc_now()
            db.add(locked_session)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Max turns reached ({settings.max_turns}). Complete the session for supervision.",
            )

        max_seq = db.scalar(select(func.max(SessionMessage.seq_no)).where(SessionMessage.session_id == session_id)) or 0
        user_msg = SessionMessage(
            session_id=session_id,
            role="user",
            content=payload.content.strip(),
            seq_no=max_seq + 1,
            created_at=utc_now(),
        )
        assistant_msg = SessionMessage(
            session_id=session_id,
            role="assistant",
            content=assistant_text,
            seq_no=max_seq + 2,
            created_at=utc_now(),
        )
        db.add(user_msg)
        db.add(assistant_msg)

        locked_session.turn_count += 1
        locked_session.status = "review_pending" if locked_session.turn_count >= settings.max_turns else "practice"
        locked_session.updated_at = utc_now()
        if locked_session.status == "practice":
            locked_session.feedback = None
        db.add(locked_session)
        db.commit()
        db.refresh(assistant_msg)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent update detected. Please retry this message.",
        ) from None

    refreshed = _get_session_or_404(db, session_id, with_messages=True)
    return ChatTurnOut(session=_session_detail(refreshed), assistant_message=assistant_msg)


@app.post("/sessions/{session_id}/complete", response_model=CompleteOut)
def complete_session(session_id: str, db: Session = Depends(get_db)) -> CompleteOut:
    session_obj = _get_session_or_404(db, session_id, with_messages=True)
    history = [{"role": m.role, "content": m.content} for m in session_obj.messages]
    if not history:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No messages to review.")

    feedback = generate_supervision_feedback(history)
    session_obj.feedback = feedback
    session_obj.status = "reviewed"
    session_obj.updated_at = utc_now()
    db.add(session_obj)
    db.commit()
    refreshed = _get_session_or_404(db, session_id, with_messages=True)
    return CompleteOut(session=_session_detail(refreshed), generated_feedback=feedback)


@app.post("/sessions/{session_id}/resume", response_model=SessionDetailOut)
def resume_session(session_id: str, db: Session = Depends(get_db)) -> SessionDetailOut:
    session_obj = _get_session_or_404(db, session_id, with_messages=True)
    session_obj.status = "practice"
    session_obj.feedback = None
    if session_obj.turn_count >= settings.max_turns:
        session_obj.turn_count = settings.max_turns - 1
    session_obj.updated_at = utc_now()
    db.add(session_obj)
    db.commit()
    refreshed = _get_session_or_404(db, session_id, with_messages=True)
    return _session_detail(refreshed)


@app.post(
    "/admin/sessions/{session_id}/recalc-supervision",
    response_model=CompleteOut,
    dependencies=[Depends(require_admin_access)],
)
def admin_recalc_supervision(session_id: str, db: Session = Depends(get_db)) -> CompleteOut:
    session_obj = _get_session_or_404(db, session_id, with_messages=True)
    history = [{"role": m.role, "content": m.content} for m in session_obj.messages]
    if not history:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No messages to review.")

    feedback = generate_supervision_feedback(history)
    session_obj.feedback = feedback
    session_obj.status = "reviewed"
    session_obj.updated_at = utc_now()
    db.add(session_obj)
    db.commit()
    refreshed = _get_session_or_404(db, session_id, with_messages=True)
    return CompleteOut(session=_session_detail(refreshed), generated_feedback=feedback)


@app.delete(
    "/admin/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin_access)],
)
def admin_delete_session(session_id: str, db: Session = Depends(get_db)) -> Response:
    session_obj = db.get(CounselingSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    db.delete(session_obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete(
    "/admin/students/{student_name}/sessions",
    response_model=DeleteManyOut,
    dependencies=[Depends(require_admin_access)],
)
def admin_delete_student_sessions(student_name: str, db: Session = Depends(get_db)) -> DeleteManyOut:
    stmt = select(CounselingSession).where(CounselingSession.student_name == student_name)
    rows = list(db.scalars(stmt))
    deleted = len(rows)
    for row in rows:
        db.delete(row)
    db.commit()
    return DeleteManyOut(deleted_count=deleted)
