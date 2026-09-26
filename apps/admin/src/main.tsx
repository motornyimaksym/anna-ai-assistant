import { Bookings } from './Bookings.js';
import { MediaStore } from './MediaStore.js';
import { AssistantPrompt } from './AssistantPrompt.js';
import { KnowledgeBase } from './KnowledgeBase.js';
import { BotSettings } from './BotSettings.js';
import { Conversations } from './Conversations.js';
import { Schedule } from './Schedule.js';
import { CssBaseline, AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'; import { onAuthStateChanged, type User } from 'firebase/auth'; import { lazy, Suspense, useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client';
import { auth, signIn } from './auth.js';
const GoogleCalendarCallback = lazy(() => import('./GoogleCalendarCallback.js').then((module) => ({ default: module.GoogleCalendarCallback })));
const AiChatEntry = lazy(() => import('./AiChat.js').then((module) => ({ default: module.AiChatEntry })));
const Specs = lazy(() => import('./Specs.js').then((module) => ({ default: module.Specs })));
const queryClient = new QueryClient();
const Loading = () => <Typography>Loading…</Typography>;
const Login = () => <Container sx={{ mt: 10 }}><Typography variant="h4">Admin login</Typography><Button sx={{ mt: 2 }} variant="contained" onClick={() => void signIn()}>Sign in with Google</Button></Container>;
const Dashboard = () => <Page title="Dashboard"><Typography>Manage media, bookings, schedule, and assistant automation.</Typography></Page>;
const Page = ({ title, children }: { title: string; children: React.ReactNode }) => <Container sx={{ mt: 3 }}><Typography variant="h4" gutterBottom>{title}</Typography>{children}</Container>;
const adminRoutes = [
  { path: 'dashboard', label: 'Dashboard' }, { path: 'bookings', label: 'Bookings' }, { path: 'media', label: 'Media Store' },
  { path: 'schedule', label: 'Schedule' }, { path: 'conversations', label: 'Conversations' }, { path: 'specs', label: 'Specs' }, { path: 'prompt', label: 'Assistant prompt' }, { path: 'knowledge-base', label: 'Knowledge Base' }, { path: 'bot-settings', label: 'Bot settings' },
];
const Protected = ({ user }: { user: User | null }) => user ? <><AppBar position="static"><Toolbar sx={{ gap: 0.5, overflowX: 'auto' }}><Typography sx={{ flexGrow: 1, minWidth: 'fit-content' }}>Massage assistant</Typography>{adminRoutes.map(({ path, label }) => <Button color="inherit" key={path} component={NavLink} to={`/${path}`} sx={{ whiteSpace: 'nowrap' }}>{label}</Button>)}</Toolbar></AppBar><Routes><Route path="/dashboard" element={<Dashboard />} /><Route path="/bookings" element={<Page title="Bookings"><Bookings /></Page>} /><Route path="/media" element={<Page title="Media Store"><MediaStore /></Page>} /><Route path="/services" element={<Navigate to="/media" replace />} /><Route path="/schedule" element={<Page title="Schedule"><Schedule /></Page>} /><Route path="/conversations" element={<Page title="Conversations"><Conversations /></Page>} /><Route path="/specs" element={<Page title="Specs"><Suspense fallback={<Loading />}><Specs /></Suspense></Page>} /><Route path="/prompt" element={<Page title="Assistant prompt"><AssistantPrompt /></Page>} /><Route path="/knowledge-base" element={<Page title="Knowledge Base"><KnowledgeBase /></Page>} /><Route path="/bot-settings" element={<Page title="Bot settings"><BotSettings /></Page>} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></> : <Navigate to="/login" replace />;
const App = () => { const [user, setUser] = useState<User | null | undefined>(undefined); useEffect(() => onAuthStateChanged(auth, setUser), []); if (user === undefined) return <Loading />; return <Box><Routes><Route path="/google-calendar/callback" element={<Suspense fallback={<Loading />}><GoogleCalendarCallback user={user} /></Suspense>} /><Route path="/ai-chat" element={<Suspense fallback={<Loading />}><AiChatEntry user={user} /></Suspense>} /><Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} /><Route path="/*" element={<Protected user={user} />} /></Routes></Box>; };
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><BrowserRouter><CssBaseline /><App /></BrowserRouter></QueryClientProvider>);
