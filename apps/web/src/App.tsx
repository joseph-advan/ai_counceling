import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  adminListSessions,
  completeSession,
  createSession,
  deleteSession,
  deleteStudentSessions,
  getSession,
  getPublicConfig,
  listSessions,
  recalcSupervision,
  resumeSession,
  sendUserMessage
} from "./api";
import type { SessionDetail, SessionSummary } from "./types";
import "./styles.css";

type RoleMode = "student" | "admin";
type Language = "en" | "zh";

const copy = {
  en: {
    appTitle: "PCC Counseling Web",
    switchTo: "中文",
    student: "Student",
    admin: "Admin",
    name: "Name",
    namePlaceholder: "Enter your name",
    studentNotice: "Please enter your own name first, then choose New Session.",
    newSession: "New Session",
    refresh: "Refresh",
    mySessions: "My Sessions",
    selectSession: "Select a session",
    turnsShort: "turns",
    ruthTitle: "Ruth / PCC",
    startPrompt: "Create or load a session to start.",
    session: "Session",
    status: "Status",
    turns: "Turns",
    messagePlaceholder: "Type your response to Ruth...",
    send: "Send",
    generateSupervision: "Generate Supervision",
    resumePractice: "Resume Practice",
    supervisionFeedback: "Supervision Feedback",
    noFeedback: "No feedback yet.",
    enterNameError: "Please enter your name before creating a new session.",
    you: "You",
    ruth: "Ruth",
    system: "System",
    refreshAll: "Refresh All Sessions",
    allSessions: "All Sessions",
    sessionDetail: "Session Detail",
    inspectPrompt: "Select a session to inspect.",
    recalculateFeedback: "Recalculate Feedback",
    deleteSession: "Delete Session",
    deleteStudentSessions: "Delete Student Sessions",
    confirmDeleteSession: "Delete this session?",
    confirmDeleteStudentSessions: (name: string) => `Delete all sessions for ${name}?`,
    statusLabels: {
      practice: "practice",
      review_pending: "review pending",
      reviewed: "reviewed"
    }
  },
  zh: {
    appTitle: "PCC 諮商練習系統",
    switchTo: "English",
    student: "學生",
    admin: "管理",
    name: "姓名",
    namePlaceholder: "請輸入你的名字",
    studentNotice: "請先輸入你自己的名字，再按「建立新練習」。",
    newSession: "建立新練習",
    refresh: "重新整理",
    mySessions: "我的練習紀錄",
    selectSession: "選擇一筆練習",
    turnsShort: "回合",
    ruthTitle: "露絲 / PCC",
    startPrompt: "請先建立或載入一筆練習。",
    session: "練習編號",
    status: "狀態",
    turns: "回合",
    messagePlaceholder: "輸入你想回應露絲的內容...",
    send: "送出",
    generateSupervision: "產生督導回饋",
    resumePractice: "繼續練習",
    supervisionFeedback: "督導回饋",
    noFeedback: "目前尚無回饋。",
    enterNameError: "請先輸入你的名字，再建立新練習。",
    you: "你",
    ruth: "露絲",
    system: "系統",
    refreshAll: "重新整理所有練習",
    allSessions: "所有練習紀錄",
    sessionDetail: "練習內容",
    inspectPrompt: "請選擇一筆練習查看內容。",
    recalculateFeedback: "重新產生回饋",
    deleteSession: "刪除這筆練習",
    deleteStudentSessions: "刪除此學生所有練習",
    confirmDeleteSession: "確定要刪除這筆練習嗎？",
    confirmDeleteStudentSessions: (name: string) => `確定要刪除 ${name} 的所有練習嗎？`,
    statusLabels: {
      practice: "練習中",
      review_pending: "待回饋",
      reviewed: "已回饋"
    }
  }
} as const;

function speakerLabel(role: "user" | "assistant" | "system", lang: Language): string {
  if (role === "assistant") return copy[lang].ruth;
  if (role === "user") return copy[lang].you;
  return copy[lang].system;
}

function statusLabel(status: string, lang: Language): string {
  return copy[lang].statusLabels[status as keyof typeof copy.en.statusLabels] ?? status;
}

function speakerAvatar(role: "user" | "assistant" | "system"): string {
  if (role === "assistant") return "🧑‍⚕️";
  if (role === "user") return "🙂";
  return "⚙️";
}

export default function App() {
  const [roleMode, setRoleMode] = useState<RoleMode>("student");
  const [language, setLanguage] = useState<Language>("en");
  const [studentName, setStudentName] = useState("");
  const [studentSessions, setStudentSessions] = useState<SessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionDetail | null>(null);
  const [adminSessions, setAdminSessions] = useState<SessionSummary[]>([]);
  const [adminSessionDetail, setAdminSessionDetail] = useState<SessionDetail | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [maxTurns, setMaxTurns] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = copy[language];

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
    const sessions = await adminListSessions();
    setAdminSessions(sessions);
  }

  useEffect(() => {
    getPublicConfig()
      .then((cfg) => {
        setMaxTurns(cfg.max_turns);
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
    const normalizedName = studentName.trim();
    if (!normalizedName) {
      setError(t.enterNameError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await createSession(normalizedName);
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
      const result = await recalcSupervision(adminSessionDetail.id);
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
    if (!window.confirm(t.confirmDeleteSession)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSession(adminSessionDetail.id);
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
    if (!window.confirm(t.confirmDeleteStudentSessions(name))) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStudentSessions(name);
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
        <h1>{t.appTitle}</h1>
        <div className="topbar-actions">
          <button
            className="language-toggle"
            onClick={() => setLanguage(language === "en" ? "zh" : "en")}
            type="button"
          >
            {t.switchTo}
          </button>
          <div className="role-switch">
            <button
              className={roleMode === "student" ? "active" : ""}
              onClick={() => setRoleMode("student")}
              type="button"
            >
              {t.student}
            </button>
            <button
              className={roleMode === "admin" ? "active" : ""}
              onClick={() => setRoleMode("admin")}
              type="button"
            >
              {t.admin}
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      {roleMode === "student" ? (
        <div className="layout">
          <aside className="panel">
            <h2>{t.student}</h2>
            <p className="notice">{t.studentNotice}</p>
            <label>
              {t.name}
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder={t.namePlaceholder}
              />
            </label>
            <div className="row">
              <button type="button" onClick={onCreateSession} disabled={busy || !studentName.trim()}>
                {t.newSession}
              </button>
              <button type="button" onClick={() => refreshStudentSessions()} disabled={busy}>
                {t.refresh}
              </button>
            </div>

            <h3>{t.mySessions}</h3>
            <select
              value={selectedStudentSessionId}
              onChange={(e) => onLoadStudentSession(e.target.value)}
              size={10}
            >
              <option value="">{t.selectSession}</option>
              {studentSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.updated_at} | {statusLabel(s.status, language)} | {s.turn_count} {t.turnsShort} |{" "}
                  {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </aside>

          <main className="panel chat-panel">
            <h2>{t.ruthTitle}</h2>
            {!currentSession ? (
              <p>{t.startPrompt}</p>
            ) : (
              <>
                <p className="meta">
                  {t.session}: {currentSession.id} | {t.status}: {statusLabel(currentSession.status, language)} |{" "}
                  {t.turns}: {currentSession.turn_count}/{maxTurns}
                </p>

                <div className="chat-box">
                  {currentSession.messages.map((m) => (
                    <div key={m.id} className={`chat-row ${m.role}`}>
                      <div className="avatar" aria-hidden="true">
                        {speakerAvatar(m.role)}
                      </div>
                      <div className={`bubble ${m.role}`}>
                        <strong>{speakerLabel(m.role, language)}</strong>
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
                    placeholder={t.messagePlaceholder}
                    disabled={!canChat || busy}
                  />
                  <button type="submit" disabled={!canChat || busy || !messageInput.trim()}>
                    {t.send}
                  </button>
                </form>

                <div className="row">
                  <button type="button" onClick={onCompleteSession} disabled={busy}>
                    {t.generateSupervision}
                  </button>
                  <button type="button" onClick={onResumeSession} disabled={busy}>
                    {t.resumePractice}
                  </button>
                </div>

                <section className="feedback">
                  <h3>{t.supervisionFeedback}</h3>
                  <pre>{currentSession.feedback || t.noFeedback}</pre>
                </section>
              </>
            )}
          </main>
        </div>
      ) : (
        <div className="layout">
          <aside className="panel">
            <h2>{t.admin}</h2>
            <button type="button" onClick={() => refreshAdminSessions()} disabled={busy}>
              {t.refreshAll}
            </button>
            <h3>{t.allSessions}</h3>
            <select size={14} onChange={(e) => onSelectAdminSession(e.target.value)} defaultValue="">
              <option value="">{t.selectSession}</option>
              {adminSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.student_name} | {s.updated_at} | {statusLabel(s.status, language)} | {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </aside>

          <main className="panel chat-panel">
            <h2>{t.sessionDetail}</h2>
            {!adminSessionDetail ? (
              <p>{t.inspectPrompt}</p>
            ) : (
              <>
                <p className="meta">
                  {t.student}: {adminSessionDetail.student_name} | {t.status}:{" "}
                  {statusLabel(adminSessionDetail.status, language)} | {t.turns}: {adminSessionDetail.turn_count}
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={onRecalcAdmin}
                    disabled={busy}
                  >
                    {t.recalculateFeedback}
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteAdminSession}
                    disabled={busy}
                  >
                    {t.deleteSession}
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteAdminStudentSessions}
                    disabled={busy}
                  >
                    {t.deleteStudentSessions}
                  </button>
                </div>

                <div className="chat-box">
                  {adminSessionDetail.messages.map((m) => (
                    <div key={m.id} className={`chat-row ${m.role}`}>
                      <div className="avatar" aria-hidden="true">
                        {speakerAvatar(m.role)}
                      </div>
                      <div className={`bubble ${m.role}`}>
                        <strong>{speakerLabel(m.role, language)}</strong>
                        <p>{m.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <section className="feedback">
                  <h3>{t.supervisionFeedback}</h3>
                  <pre>{adminSessionDetail.feedback || t.noFeedback}</pre>
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
