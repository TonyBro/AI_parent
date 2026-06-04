export type IntegrationDto = {
  id: string;
  bot_project_id: string;
  integration_type: string;
  display_name: string;
  status: string;
  is_connected: boolean;
  token_expires_at: number | null;
  settings: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};
