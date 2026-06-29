export type UserRole = 'super_admin' | 'coordinator' | 'participant';
export type MeetingType = 'presencial' | 'virtual' | 'llamada';
export type MeetingStatus = 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed';
export type ActionItemPriority = 'alta' | 'media' | 'baja';
export type ActionItemStatus = 'pendiente' | 'en_progreso' | 'completado';
export type EmailType = 'personal' | 'coordinator_summary';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  role: UserRole;
  full_name: string;
  email: string;
  created_at: string;
}

export interface Meeting {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  coordination: string;
  type: MeetingType;
  status: MeetingStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  audio_segments: AudioSegment[];
  transcript_raw: string | null;
  transcript_diarized: DiarizedSegment[] | null;
  speaker_map: Record<string, string>;
  created_at: string;
}

export interface AudioSegment {
  r2_key: string;
  segment_index: number;
  duration_s: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
}

export interface DiarizedSegment {
  speaker: string;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  email_override: string | null;
  attended: boolean;
}

export interface Minute {
  id: string;
  meeting_id: string;
  summary: string;
  topics: string[];
  decisions: string[];
  changes: string[];
  next_steps: string[];
  raw_llm_output: string;
  generated_at: string;
  approved: boolean;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  minute_id: string;
  assignee_user_id: string | null;
  assignee_email: string;
  assignee_name: string;
  description: string;
  due_date: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  created_at: string;
}

export interface EmailLog {
  id: string;
  meeting_id: string;
  recipient_email: string;
  type: EmailType;
  sent_at: string;
  resend_id: string;
  status: string;
}

export interface MinuteJSON {
  summary: string;
  topics: string[];
  decisions: string[];
  changes: string[];
  action_items: {
    assignee_name: string;
    description: string;
    due_date: string | null;
    priority: ActionItemPriority;
  }[];
  next_steps: string[];
}
