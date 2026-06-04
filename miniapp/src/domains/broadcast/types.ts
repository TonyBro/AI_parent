export type BroadcastSettings = {
  id?: string;
  enabled: boolean;
  use_quiz_results: boolean;
  quiz_set_ids?: string[];
  pre_prompt: string;
  send_time_hour: number;
  sentence_count: number;
  integration_id?: string | null;
};

export type BroadcastView = "list" | "schedule-list" | "schedule" | "schedule-quizzes" | "schedule-integration" | "now-menu" | "now-regular" | "now-ai" | "now-ai-quizzes" | "now-ai-integration" | "now-quiz";
