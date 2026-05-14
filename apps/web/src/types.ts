export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  seq_no: number;
  created_at: string;
}

export interface SessionSummary {
  id: string;
  student_name: string;
  case_name: string;
  theory: string;
  status: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionDetail extends SessionSummary {
  feedback: string | null;
  messages: Message[];
}

export interface ChatTurn {
  session: SessionDetail;
  assistant_message: Message;
}

export interface CompleteResult {
  session: SessionDetail;
  generated_feedback: string;
}
