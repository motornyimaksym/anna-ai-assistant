import { DebugLogs } from "./DebugLogs.js";
import { MediaStore } from "./MediaStore.js";
import { AssistantPrompt } from "./AssistantPrompt.js";
import { KnowledgeBase } from "./KnowledgeBase.js";
import { BotSettings } from "./BotSettings.js";
import { Conversations } from "./Conversations.js";
import { Schedule } from "./Schedule.js";
import { PrivacyPolicy, TermsAndConditions } from "./LegalPages.js";
import { FaqPage } from "./Faq.js";
import { CssBaseline, Box, Typography } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { onAuthStateChanged, onIdTokenChanged, type User } from "firebase/auth";
import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider, useI18n } from "./i18n.js";
const AdminShell = lazy(() =>
  import("./AdminShell.js").then((module) => ({ default: module.AdminShell })),
);
const Dashboard = lazy(() =>
  import("./AdminShell.js").then((module) => ({ default: module.Dashboard })),
);
const Login = lazy(() =>
  import("./AdminShell.js").then((module) => ({ default: module.Login })),
);
const Page = lazy(() =>
  import("./AdminShell.js").then((module) => ({ default: module.Page })),
);
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
const Loading = () => {
  const { t } = useI18n();
  return <Typography>{t("Loading…")}</Typography>;
};
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
        <Route path="/bookings" element={<Navigate to="/bot-settings" replace />} />
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
export const App = () => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const location = useLocation();
  const isPublicRoute =
    location.pathname === "/privacy-policy" ||
    location.pathname === "/terms-and-conditions" ||
    location.pathname === "/faq";
  useEffect(
    () => {
      if (isPublicRoute) return;
      let active = true;
      let unsubscribe = () => {};
      void import("./auth.js").then(({ auth }) => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(auth, (next) => {
          queryClient.clear();
          setUser(next);
        });
      }).catch(() => {
        if (active) setUser(null);
      });
      return () => {
        active = false;
        unsubscribe();
      };
    },
    [isPublicRoute],
  );
  useEffect(() => {
    if (isPublicRoute) return;
    let generation = 0;
    let active = true;
    let unsubscribe = () => {};
    let sessionSync = Promise.resolve();
    void import("./auth.js").then(({ auth }) => {
      if (!active) return;
      unsubscribe = onIdTokenChanged(auth, (next) => {
        const current = ++generation;
        sessionSync = sessionSync.then(async () => {
          if (current !== generation) return;
          if (!next) {
            await fetch("/api/docs/session", {
              method: "DELETE",
              credentials: "same-origin",
              keepalive: true,
            }).catch(() => undefined);
            return;
          }
          try {
            const token = await next.getIdToken();
            if (current !== generation) return;
            await fetch("/api/docs/session", {
              method: "POST",
              credentials: "same-origin",
              headers: { authorization: `Bearer ${token}` },
            });
          } catch {
            // Swagger authorization must not block the admin app.
          }
        });
      });
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isPublicRoute]);
  if (location.pathname === "/faq") return <FaqPage />;
  if (location.pathname === "/privacy-policy") return <PrivacyPolicy />;
  if (location.pathname === "/terms-and-conditions") return <TermsAndConditions />;
  if (user === undefined) return <Loading />;
  return (
    <Box>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route
            path="/google-calendar/callback"
            element={<GoogleCalendarCallback user={user} />}
          />
          <Route
            path="/ai-chat"
            element={<AiChatEntry user={user} />}
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/dashboard" replace /> : <Login />}
          />
          <Route path="/*" element={<Protected user={user} />} />
        </Routes>
      </Suspense>
    </Box>
  );
};
const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CssBaseline />
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}
