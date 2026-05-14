import type { ChatTurn, CompleteResult, SessionDetail, SessionSummary } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const mergedHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers ?? {})
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: mergedHeaders
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export interface PublicConfig {
  max_turns: number;
  admin_protected: boolean;
}

export function getPublicConfig(): Promise<PublicConfig> {
  return request<PublicConfig>("/public/config");
}

export function createSession(studentName: string): Promise<SessionDetail> {
  return request<SessionDetail>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      student_name: studentName,
      case_name: "Ruth",
      theory: "PCC"
    })
  });
}

export function listSessions(studentName: string): Promise<SessionSummary[]> {
  const query = `?student_name=${encodeURIComponent(studentName)}`;
  return request<SessionSummary[]>(`/sessions${query}`);
}

export function adminListSessions(adminKey?: string): Promise<SessionSummary[]> {
  return request<SessionSummary[]>("/admin/sessions", {
    method: "GET",
    headers: adminKey ? { "X-Admin-Key": adminKey } : undefined
  });
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${sessionId}`);
}

export function sendUserMessage(sessionId: string, content: string): Promise<ChatTurn> {
  return request<ChatTurn>(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
}

export function completeSession(sessionId: string): Promise<CompleteResult> {
  return request<CompleteResult>(`/sessions/${sessionId}/complete`, {
    method: "POST"
  });
}

export function resumeSession(sessionId: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${sessionId}/resume`, {
    method: "POST"
  });
}

export function recalcSupervision(sessionId: string): Promise<CompleteResult> {
  return recalcSupervisionWithKey(sessionId);
}

export function recalcSupervisionWithKey(
  sessionId: string,
  adminKey?: string
): Promise<CompleteResult> {
  return request<CompleteResult>(`/admin/sessions/${sessionId}/recalc-supervision`, {
    method: "POST",
    headers: adminKey ? { "X-Admin-Key": adminKey } : undefined
  });
}

export function deleteSession(sessionId: string): Promise<void> {
  return deleteSessionWithKey(sessionId);
}

export function deleteSessionWithKey(sessionId: string, adminKey?: string): Promise<void> {
  return request<void>(`/admin/sessions/${sessionId}`, {
    method: "DELETE",
    headers: adminKey ? { "X-Admin-Key": adminKey } : undefined
  });
}

export function deleteStudentSessions(studentName: string): Promise<{ deleted_count: number }> {
  return deleteStudentSessionsWithKey(studentName);
}

export function deleteStudentSessionsWithKey(
  studentName: string,
  adminKey?: string
): Promise<{ deleted_count: number }> {
  return request<{ deleted_count: number }>(
    `/admin/students/${encodeURIComponent(studentName)}/sessions`,
    {
      method: "DELETE",
      headers: adminKey ? { "X-Admin-Key": adminKey } : undefined
    }
  );
}
