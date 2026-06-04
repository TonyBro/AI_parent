export type ActionDto = {
  id: string;
  bot_project_id: string;
  type: string;
  settings: Record<string, unknown>;
  status: string;
  created_at: number;
  updated_at: number;
};

export type WorkingHourDto = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_enabled: boolean;
};
