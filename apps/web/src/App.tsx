import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  adminListSessions,
  completeSession,
  createSession,
  deleteSessionWithKey,
  deleteStudentSessionsWithKey,
  getSession,
  getPublicConfig,
  listSessions,
  recalcSupervisionWithKey,
  resumeSession,
  sendUserMessage
} from "./api";
import type { SessionDetail, SessionSummary } from "./types";
import "./styles.css";

type RoleMode = "student" | "admin";

function speakerLabel(role: "user" | "assistant" | "system"): string {
  if (role === "assistant") return "Ruth";
  if (role === "user") return "You";
  return "System";
}

function speakerAvatar(role: "user" | "assistant" | "system"): string {
  if (role === "assistant") return "🧑‍⚕️";
  if (role === "user") return "🙂";
  return "⚙️";
}

export default function App() {
  const [roleMode, setRoleMode] = useState<RoleMode>("student");
  const [studentName, setStudentName] = useState("Guest Student");
  const [studentSessions, setStudentSessions] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionDetail | null>(null);
  const [adminSessions, setAdminSessions] = useState<SessionSummary[]>([]);
  const [adminSessionDetail, setAdminSessionDetail] = useState<SessionDetail | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [adminProtected, setAdminProtected] = useState(false);
  const [maxTurns, setMaxTurns] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStudentSessionId = currentSession?.id ?? "";
  const canChat = useMemo(() => {
    if (!currentSession) return false;
    return currentSession.status === "practice" && currentSession.turn_count < maxTurns;
  }, [currentSession, maxTurns]);

  async function refreshStudentSessions() {
    const normalized = studentName.trim();
    if (!normalized) {
      setStudentSessions([]);
      return;
    }
    const sessions = await listSessions(normalized);
    setStudentSessions(sessions);
  }

  async function refreshAdminSessions() {
    const sessions = await adminListSessions(adminKey.trim() || undefined);
    setAdminSessions(sessions);
  }

  useEffect(() => {
    getPublicConfig()
      .then((cfg) => {
        setMaxTurns(cfg.max_turns);
        setAdminProtected(cfg.admin_protected);
      })
      .catch((err: unknown) => setError(String(err)));
    refreshStudentSessions().catch((err: unknown) => setError(String(err)));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshStudentSessions().catch((err: unknown) => setError(String(err)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [studentName]);

  useEffect(() => {
    if (roleMode === "admin") {
      refreshAdminSessions().catch((err: unknown) => setError(String(err)));
    }
  }, [roleMode]);

  async function onCreateSession() {
    setBusy(true);
    setError(null);
    try {
      const session = await createSession(studentName.trim() || "Guest Student");
      setCurrentSession(session);
      await refreshStudentSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onLoadStudentSession(sessionId: string) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await getSession(sessionId);
      setCurrentSession(session);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSendMessage(e: FormEvent) {
    e.preventDefault();
    await submitMessage();
  }

  async function submitMessage() {
    if (!currentSession || !messageInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendUserMessage(currentSession.id, messageInput.trim());
      setCurrentSession(result.session);
      setMessageInput("");
      await refreshStudentSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function onMessageKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (!canChat || busy || !messageInput.trim()) return;
    void submitMessage();
  }

  async function onCompleteSession() {
    if (!currentSession) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeSession(currentSession.id);
      setCurrentSession(result.session);
      await refreshStudentSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onResumeSession() {
    if (!currentSession) return;
    setBusy(true);
    setError(null);
    try {
      const session = await resumeSession(currentSession.id);
      setCurrentSession(session);
      await refreshStudentSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSelectAdminSession(sessionId: string) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await getSession(sessionId);
      setAdminSessionDetail(detail);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRecalcAdmin() {
    if (!adminSessionDetail) return;
    setBusy(true);
    setError(null);
    try {
      const result = await recalcSupervisionWithKey(adminSessionDetail.id, adminKey.trim() || undefined);
      setAdminSessionDetail(result.session);
      await refreshAdminSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAdminSession() {
    if (!adminSessionDetail) return;
    if (!window.confirm("Delete this session?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSessionWithKey(adminSessionDetail.id, adminKey.trim() || undefined);
      setAdminSessionDetail(null);
      await refreshAdminSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAdminStudentSessions() {
    if (!adminSessionDetail) return;
    const name = adminSessionDetail.student_name;
    if (!window.confirm(`Delete all sessions for ${name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStudentSessionsWithKey(name, adminKey.trim() || undefined);
      setAdminSessionDetail(null);
      await refreshAdminSessions();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>PCC Counseling Web (No Auth)</h1>
        <div className="role-switch">
          <button
            className={roleMode === "student" ? "active" : ""}
            onClick={() => setRoleMode("student")}
            type="button"
          >
            Student
          </button>
          <button
            className={roleMode === "admin" ? "active" : ""}
            onClick={() => setRoleMode("admin")}
            type="button"
          >
            Admin
          </button>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {roleMode === "student" ? (
        <div className="layout">
          <aside className="panel">
            <h2>Student</h2>
            <label>
              Name
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Enter student name"
              />
            </label>
            <div className="row">
              <button type="button" onClick={onCreateSession} disabled={busy}>
                New Session
              </button>
              <button type="button" onClick={() => refreshStudentSessions()} disabled={busy}>
                Refresh
              </button>
            </div>

            <h3>My Sessions</h3>
            <select
              value={selectedStudentSessionId}
              onChange={(e) => onLoadStudentSession(e.target.value)}
              size={10}
            >
              <option value="">Select a session</option>
              {studentSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.updated_at} | {s.status} | {s.turn_count} turns | {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </aside>

          <main className="panel chat-panel">
            <h2>Ruth / PCC</h2>
            {!currentSession ? (
              <p>Create or load a session to start.</p>
            ) : (
              <>
                <p className="meta">
                  Session: {currentSession.id} | Status: {currentSession.status} | Turns:{" "}
                  {currentSession.turn_count}/{maxTurns}
                </p>

                <div className="chat-box">
                  {currentSession.messages.map((m) => (
                    <div key={m.id} className={`chat-row ${m.role}`}>
                      <div className="avatar" aria-hidden="true">
                        {speakerAvatar(m.role)}
                      </div>
                      <div className={`bubble ${m.role}`}>
                        <strong>{speakerLabel(m.role)}</strong>
                        <p>{m.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={onSendMessage} className="chat-form">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={onMessageKeyDown}
                    placeholder="Type your response to Ruth..."
                    disabled={!canChat || busy}
                  />
                  <button type="submit" disabled={!canChat || busy || !messageInput.trim()}>
                    Send
                  </button>
                </form>

                <div className="row">
                  <button type="button" onClick={onCompleteSession} disabled={busy}>
                    Generate Supervision
                  </button>
                  <button type="button" onClick={onResumeSession} disabled={busy}>
                    Resume Practice
                  </button>
                </div>

                <section className="feedback">
                  <h3>Supervision Feedback</h3>
                  <pre>{currentSession.feedback || "No feedback yet."}</pre>
                </section>
              </>
            )}
          </main>
        </div>
      ) : (
        <div className="layout">
          <aside className="panel">
            <h2>Admin</h2>
            <label>
              Admin Key
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder={adminProtected ? "Required by backend" : "Not required in current backend config"}
              />
            </label>
            <button type="button" onClick={() => refreshAdminSessions()} disabled={busy}>
              Refresh All Sessions
            </button>
            <h3>All Sessions</h3>
            <select size={14} onChange={(e) => onSelectAdminSession(e.target.value)} defaultValue="">
              <option value="">Select a session</option>
              {adminSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.student_name} | {s.updated_at} | {s.status} | {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </aside>

          <main className="panel chat-panel">
            <h2>Session Detail</h2>
            {!adminSessionDetail ? (
              <p>Select a session to inspect.</p>
            ) : (
              <>
                <p className="meta">
                  Student: {adminSessionDetail.student_name} | Status: {adminSessionDetail.status} | Turns:{" "}
                  {adminSessionDetail.turn_count}
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={onRecalcAdmin}
                    disabled={busy || (adminProtected && !adminKey.trim())}
                  >
                    Recalculate Feedback
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteAdminSession}
                    disabled={busy || (adminProtected && !adminKey.trim())}
                  >
                    Delete Session
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteAdminStudentSessions}
                    disabled={busy || (adminProtected && !adminKey.trim())}
                  >
                    Delete Student Sessions
                  </button>
                </div>

                <div className="chat-box">
                  {adminSessionDetail.messages.map((m) => (
                    <div key={m.id} className={`chat-row ${m.role}`}>
                      <div className="avatar" aria-hidden="true">
                        {speakerAvatar(m.role)}
                      </div>
                      <div className={`bubble ${m.role}`}>
                        <strong>{speakerLabel(m.role)}</strong>
                        <p>{m.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <section className="feedback">
                  <h3>Supervision Feedback</h3>
                  <pre>{adminSessionDetail.feedback || "No feedback yet."}</pre>
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
