import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Landing } from "./domains/onboarding/Landing";
import { BotProfile } from "./domains/bot/BotProfile";
import { BotSettings } from "./domains/bot/BotSettings";
import { CreateType } from "./domains/onboarding/CreateType";
import { CreateBot } from "./domains/onboarding/CreateBot";
import { LanguagePicker } from "./domains/onboarding/LanguagePicker";
import { QuizzesWrapper } from "./domains/quiz/QuizzesWrapper";
import { BroadcastWrapper } from "./domains/broadcast/BroadcastWrapper";
import { CommandsWrapper } from "./domains/command/CommandsWrapper";
import { IntegrationsWrapper } from "./domains/integration/IntegrationsWrapper";
import { ActionsWrapper } from "./domains/action/ActionsWrapper";
import { useBots } from "./domains/bot/store";

export function App() {
  const { isGlobalLoading } = useBots();
  return (
    <main className={`container ${isGlobalLoading ? 'global-loading' : ''}`}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="/create/type" element={<CreateType />} />
        <Route path="/create/*" element={<CreateBot />} />
        <Route path="/bot/:botId" element={<BotProfile />} />
        <Route path="/bot/:botId/settings/*" element={<BotSettings />} />
        <Route path="/bot/:botId/quizzes/*" element={<QuizzesWrapper />} />
        <Route path="/bot/:botId/broadcast/*" element={<BroadcastWrapper />} />
        <Route path="/bot/:botId/commands/*" element={<CommandsWrapper />} />
        <Route path="/bot/:botId/integrations/*" element={<IntegrationsWrapper />} />
        <Route path="/bot/:botId/actions/*" element={<ActionsWrapper />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
