import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Routes, Route, useLocation } from 'react-router-dom';
import { useBots } from '../domains/bot/store';
import { useTranslation } from '../shared/i18n';
import { Quizzes } from '../Quizzes';
import { Page, ProfileHeader, Avatar, Loader } from '../components';
import { LanguagePicker } from './LanguagePicker';
import { useBackButton } from '../shared/hooks/useBackButton';
import { useMainButton } from '../shared/hooks/useMainButton';

export const QuizzesWrapper: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();
  const { getBotById, loading: botsLoading } = useBots();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const bot = botId ? getBotById(botId) : null;

  const [canSaveQuiz, setCanSaveQuiz] = useState(false);
  const quizSaveRef = useRef<() => void>(() => {});
  const [canSaveQuestion, setCanSaveQuestion] = useState(false);
  const questionSaveRef = useRef<() => void>(() => {});

  const [quizForm, setQuizForm] = useState({
    title: "",
    language: "en", // default
    useAI: false,
    aiTheme: "",
    aiDataToCollect: "",
    aiCount: 7
  });

  useBackButton(() => {
    navigate(-1);
  });

  // Sync language when bot loads
  useEffect(() => {
    if (bot?.default_language) {
      setQuizForm(f => ({ ...f, language: bot.default_language }));
    }
  }, [bot]);

  if (botsLoading && !bot) return <Page><Loader /></Page>;
  if (!bot) return <Page><div>{t("miniapp.bot_not_found")}</div></Page>;

  const isLanguageRoute = location.pathname.endsWith('/language');

  return (
    <Routes>
      <Route path="language" element={
        <LanguagePicker 
          onSelect={(code) => {
            setQuizForm(f => ({ ...f, language: code }));
            navigate(-1);
          }}
          onBack={() => navigate(-1)}
        />
      } />
      <Route path="*" element={
        <Page className="no-padding">
          <div style={{ padding: '0 16px' }}>
            <header className="header bot-details-header">
              <ProfileHeader
                avatar={
                    <Avatar 
                        src={bot.bot_username ? `https://t.me/i/userpic/320/${bot.bot_username}.jpg` : `/api/bots/${bot.id}/avatar`} 
                        fallback={(bot.name || bot.bot_username || "B").trim()} 
                        size="large"
                        userId={bot.id}
                    />
                }
                name={bot.name || t("miniapp.unnamed_bot")}
                username={`@${bot.bot_username}`}
              />
            </header>

            <Routes>
              <Route index element={
                <QuizzesList 
                  botId={bot.id} 
                  onSelectSet={(id: string | null) => navigate(`/bot/${bot.id}/quizzes/${id}/questions`)} 
                  onAdd={() => navigate(`/bot/${bot.id}/quizzes/create`)}
                  quizForm={quizForm}
                  onQuizFormChange={setQuizForm}
                  isVisible={!isLanguageRoute}
                />
              } />
              <Route path="create" element={
                <QuizEdit 
                  botId={bot.id} 
                  quizForm={quizForm} 
                  onQuizFormChange={setQuizForm} 
                  canSave={canSaveQuiz}
                  onCanSaveChange={setCanSaveQuiz}
                  saveRef={quizSaveRef}
                  onBack={() => navigate(-1)}
                  onLanguageClick={() => navigate(`/bot/${botId}/quizzes/language`)}
                  isVisible={!isLanguageRoute}
                />
              } />
              <Route path="edit/:quizSetId" element={
                <QuizEdit 
                  botId={bot.id} 
                  quizForm={quizForm} 
                  onQuizFormChange={setQuizForm} 
                  canSave={canSaveQuiz}
                  onCanSaveChange={setCanSaveQuiz}
                  saveRef={quizSaveRef}
                  onBack={() => navigate(-1)}
                  onLanguageClick={() => navigate(`/bot/${botId}/quizzes/language`)}
                  isVisible={!isLanguageRoute}
                />
              } />
              <Route path=":quizSetId/questions" element={
                <QuestionsList 
                  botId={bot.id} 
                  navigate={navigate}
                  onBack={() => navigate(-1)}
                  quizForm={quizForm}
                  onQuizFormChange={setQuizForm}
                  isVisible={!isLanguageRoute}
                />
              } />
              <Route path=":quizSetId/questions/create" element={
                <QuestionEdit 
                  botId={bot.id} 
                  canSave={canSaveQuestion}
                  onCanSaveChange={setCanSaveQuestion}
                  saveRef={questionSaveRef}
                  onBack={() => navigate(-1)}
                  quizForm={quizForm}
                  onQuizFormChange={setQuizForm}
                  isVisible={!isLanguageRoute}
                />
              } />
              <Route path=":quizSetId/questions/:questionId" element={
                <QuestionEdit 
                  botId={bot.id} 
                  canSave={canSaveQuestion}
                  onCanSaveChange={setCanSaveQuestion}
                  saveRef={questionSaveRef}
                  onBack={() => navigate(-1)}
                  quizForm={quizForm}
                  onQuizFormChange={setQuizForm}
                  isVisible={!isLanguageRoute}
                />
              } />
            </Routes>
          </div>
        </Page>
      } />
    </Routes>
  );
};

// Sub-components that wrap Quizzes with specific view props and MainButton logic

const QuizzesList: React.FC<{ 
  botId: string; 
  onSelectSet: (id: string) => void; 
  onAdd: () => void;
  quizForm: any;
  onQuizFormChange: any;
  isVisible?: boolean;
}> = ({ botId, onSelectSet, onAdd, quizForm, onQuizFormChange, isVisible = true }) => {
  const { t } = useTranslation();
  useMainButton({
    text: "+ " + t("miniapp.add_quiz"),
    onClick: onAdd,
    isVisible: isVisible
  });
  return <Quizzes botId={botId} view="list" onSelectSet={onSelectSet} quizForm={quizForm} onQuizFormChange={onQuizFormChange} />;
};

const QuizEdit: React.FC<any> = ({ botId, quizForm, onQuizFormChange, canSave, onCanSaveChange, saveRef, onBack, onLanguageClick, isVisible = true }) => {
  const { t } = useTranslation();
  const { quizSetId } = useParams();
  useMainButton({
    text: quizSetId ? t("miniapp.save") : t("miniapp.generate_quiz"),
    onClick: () => saveRef.current(),
    isVisible: isVisible,
    isEnabled: canSave
  });
  return (
    <Quizzes 
      botId={botId} 
      view="quiz-edit" 
      selectedSetId={quizSetId}
      quizForm={quizForm} 
      onQuizFormChange={onQuizFormChange}
      onCanSaveQuizChange={onCanSaveChange}
      quizSaveRef={saveRef}
      onBack={onBack}
      onLanguageClick={onLanguageClick}
    />
  );
};

const QuestionsList: React.FC<any> = ({ botId, navigate, onBack, quizForm, onQuizFormChange, isVisible = true }) => {
  const { t } = useTranslation();
  const { quizSetId } = useParams();
  useMainButton({
    text: "+ " + t("miniapp.add_question"),
    onClick: () => navigate(`/bot/${botId}/quizzes/${quizSetId}/questions/create`),
    isVisible: isVisible
  });
  return (
    <Quizzes 
      botId={botId} 
      view="questions" 
      selectedSetId={quizSetId}
      onSelectQuestion={(id: string) => navigate(`/bot/${botId}/quizzes/${quizSetId}/questions/${id}`)}
      onBack={onBack}
      quizForm={quizForm} 
      onQuizFormChange={onQuizFormChange}
    />
  );
};

const QuestionEdit: React.FC<any> = ({ botId, canSave, onCanSaveChange, saveRef, onBack, quizForm, onQuizFormChange, isVisible = true }) => {
  const { t } = useTranslation();
  const { quizSetId, questionId } = useParams();
  useMainButton({
    text: t("miniapp.save"),
    onClick: () => saveRef.current(),
    isVisible: isVisible,
    isEnabled: canSave
  });
  return (
    <Quizzes 
      botId={botId} 
      view="question-edit" 
      selectedSetId={quizSetId}
      selectedQuestionId={questionId === 'create' ? null : questionId}
      onCanSaveQuestionChange={onCanSaveChange}
      questionSaveRef={saveRef}
      onBack={onBack}
      quizForm={quizForm} 
      onQuizFormChange={onQuizFormChange}
    />
  );
};

