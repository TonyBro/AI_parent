export type QuizOptionDto = { 
  key: string; 
  label: string; 
  profile_patch: Record<string, unknown> 
};

export type QuizItemDto = {
  id: string;
  quiz_set_id: string;
  position: number;
  question: string;
  options: QuizOptionDto[];
  created_at: number;
};

export type QuizSetDto = {
  id: string;
  bot_project_id: string;
  parent_quiz_set_id: string | null;
  title: string;
  language: string;
  created_at: number;
  items: QuizItemDto[];
};
