import { AdminShell, Dashboard, Login, Page } from "./AdminShell.js";
import { DebugLogs } from "./DebugLogs.js";
import { Bookings } from "./Bookings.js";
import { MediaStore } from "./MediaStore.js";
import { AssistantPrompt } from "./AssistantPrompt.js";
import { KnowledgeBase } from "./KnowledgeBase.js";
import { BotSettings } from "./BotSettings.js";
import { Conversations } from "./Conversations.js";
import { Schedule } from "./Schedule.js";
import { CssBaseline, Box, Typography } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { auth } from "./auth.js";
const GoogleCalendarCallback = lazy(() =>
  import("./GoogleCalendarCallback.js").then((module) => ({
    default: module.GoogleCalendarCallback,
  })),
);
const AiChatEntry = lazy(() =>
  import("./AiChat.js").then((module) => ({ default: module.AiChatEntry })),
);
const Specs = lazy(() =>
  import("./Specs.js").then((module) => ({ default: module.Specs })),
);
const queryClient = new QueryClient();
const Loading = () => <Typography>Loading…</Typography>;
const Protected = ({ user }: { user: User | null }) =>
  user ? (
    <AdminShell uid={user.uid}>
      <Routes>
        <Route
          path="/debug"
          element={
            <Page title="Debug">
              <DebugLogs uid={user.uid} />
            </Page>
          }
        />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/bookings"
          element={
            <Page title="Bookings">
              <Bookings />
            </Page>
          }
        />
        <Route
          path="/media"
          element={
            <Page title="Media Store">
              <MediaStore />
            </Page>
          }
        />
        <Route path="/services" element={<Navigate to="/media" replace />} />
        <Route
          path="/schedule"
          element={
            <Page title="Schedule">
              <Schedule />
            </Page>
          }
        />
        <Route
          path="/conversations"
          element={
            <Page title="Conversations">
              <Conversations />
            </Page>
          }
        />
        <Route
          path="/specs"
          element={
            <Page title="Specs">
              <Suspense fallback={<Loading />}>
                <Specs />
              </Suspense>
            </Page>
          }
        />
        <Route
          path="/prompt"
          element={
            <Page title="Assistant prompt">
              <AssistantPrompt />
            </Page>
          }
        />
        <Route
          path="/knowledge-base"
          element={
            <Page title="Knowledge Base">
              <KnowledgeBase />
            </Page>
          }
        />
        <Route
          path="/bot-settings"
          element={
            <Page title="Bot settings">
              <BotSettings />
            </Page>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AdminShell>
  ) : (
    <Navigate to="/login" replace />
  );
const App = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        queryClient.clear();
        setUser(next);
      }),
    [],
  );
  if (user === undefined) return <Loading />;
  return (
    <Box>
      <Routes>
        <Route
          path="/google-calendar/callback"
          element={
            <Suspense fallback={<Loading />}>
              <GoogleCalendarCallback user={user} />
            </Suspense>
          }
        />
        <Route
          path="/ai-chat"
          element={
            <Suspense fallback={<Loading />}>
              <AiChatEntry user={user} />
            </Suspense>
          }
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route path="/*" element={<Protected user={user} />} />
      </Routes>
    </Box>
  );
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <CssBaseline />
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
