export type CommandDto = {
  id: string;
  bot_project_id: string;
  command: string;
  description: string;
  show_in_menu: boolean;
  integration_id: string | null;
  ai_instructions: string | null;
  quiz_set_ids: string[];
  use_quiz_results: boolean;
  created_at: number;
  updated_at: number;
};
