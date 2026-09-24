import { Bookings } from './Bookings.js';
import { AssistantPrompt } from './AssistantPrompt.js';
import { CssBaseline, AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'; import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'; import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'; import { onAuthStateChanged, type User } from 'firebase/auth'; import { lazy, Suspense, useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client';
import { adminApi } from './api.js'; import { auth, signIn } from './auth.js';
const Specs = lazy(() => import('./Specs.js').then((module) => ({ default: module.Specs })));
const queryClient = new QueryClient();
const Loading = () => <Typography>Loading…</Typography>;
const Login = () => <Container sx={{ mt: 10 }}><Typography variant="h4">Admin login</Typography><Button sx={{ mt: 2 }} variant="contained" onClick={() => void signIn()}>Sign in with Google</Button></Container>;
const Services = () => { const query = useQuery({ queryKey: ['services'], queryFn: adminApi.services }); return <Page title="Services">{query.isPending ? <Loading /> : <pre>{JSON.stringify(query.data, null, 2)}</pre>}</Page>; };
const Conversations = () => { const query = useQuery({ queryKey: ['conversations'], queryFn: adminApi.conversations }); return <Page title="Conversations">{query.isPending ? <Loading /> : <pre>{JSON.stringify(query.data, null, 2)}</pre>}</Page>; };
const Dashboard = () => <Page title="Dashboard"><Typography>Manage bookings, services, schedule, and assistant automation.</Typography></Page>;
const Schedule = () => <Page title="Schedule"><Typography>Weekly hours and exceptions are managed through the protected API.</Typography></Page>;
const Page = ({ title, children }: { title: string; children: React.ReactNode }) => <Container sx={{ mt: 3 }}><Typography variant="h4" gutterBottom>{title}</Typography>{children}</Container>;
const adminRoutes = [
  { path: 'dashboard', label: 'Dashboard' }, { path: 'bookings', label: 'Bookings' }, { path: 'services', label: 'Services' },
  { path: 'schedule', label: 'Schedule' }, { path: 'conversations', label: 'Conversations' }, { path: 'specs', label: 'Specs' }, { path: 'prompt', label: 'Assistant prompt' },
];
const Protected = ({ user }: { user: User | null }) => user ? <><AppBar position="static"><Toolbar sx={{ gap: 0.5, overflowX: 'auto' }}><Typography sx={{ flexGrow: 1, minWidth: 'fit-content' }}>Massage assistant</Typography>{adminRoutes.map(({ path, label }) => <Button color="inherit" key={path} component={NavLink} to={`/${path}`} sx={{ whiteSpace: 'nowrap' }}>{label}</Button>)}</Toolbar></AppBar><Routes><Route path="/dashboard" element={<Dashboard />} /><Route path="/bookings" element={<Page title="Bookings"><Bookings /></Page>} /><Route path="/services" element={<Services />} /><Route path="/schedule" element={<Schedule />} /><Route path="/conversations" element={<Conversations />} /><Route path="/specs" element={<Page title="Specs"><Suspense fallback={<Loading />}><Specs /></Suspense></Page>} /><Route path="/prompt" element={<Page title="Assistant prompt"><AssistantPrompt /></Page>} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></> : <Navigate to="/login" replace />;
const App = () => { const [user, setUser] = useState<User | null | undefined>(undefined); useEffect(() => onAuthStateChanged(auth, setUser), []); if (user === undefined) return <Loading />; return <Box><Routes><Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} /><Route path="/*" element={<Protected user={user} />} /></Routes></Box>; };
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><BrowserRouter><CssBaseline /><App /></BrowserRouter></QueryClientProvider>);
