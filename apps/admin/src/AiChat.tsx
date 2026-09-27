import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { signOut, type User } from "firebase/auth";
import type { AiChatThread } from "@booking/contracts";
import { auth, signIn } from "./auth.js";
import { aiChatApi } from "./api.js";
import {
  AddRounded,
  ArrowUpwardRounded,
  AutoAwesomeRounded,
  ChatBubbleOutlineRounded,
  CloseRounded,
  ForumOutlined,
  LogoutRounded,
  MenuRounded,
  ShieldOutlined,
} from "@mui/icons-material";
import { AdminAppearance, ThemeToggle } from "./AdminAppearance.js";

const ChatBrand = () => (
  <Stack direction="row" spacing={1.5} alignItems="center">
    <Box
      sx={{
        display: "grid",
        placeItems: "center",
        width: 40,
        height: 40,
        border: "1px solid var(--admin-accent-border)",
        bgcolor: "var(--admin-accent-wash)",
        color: "primary.main",
        borderRadius: "12px 4px 12px 4px",
      }}
    >
      <AutoAwesomeRounded />
    </Box>
    <Box>
      <Typography fontWeight={700} sx={{ letterSpacing: "-0.04em" }}>
        AI workspace
      </Typography>
      <Typography variant="overline" color="text.secondary">
        Private intelligence
      </Typography>
    </Box>
  </Stack>
);

export function AiChatEntry({ user }: { user: User | null }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const login = async () => {
    setPending(true);
    setError("");
    try {
      await signIn();
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setPending(false);
    }
  };
  if (user) return <AiChat key={user.uid} uid={user.uid} />;
  return (
    <AdminAppearance>
      <Box
        sx={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          p: 3,
          background:
            "radial-gradient(ellipse at 25% 20%, var(--admin-login-teal), transparent 55%), radial-gradient(ellipse at 90% 80%, var(--admin-login-violet), transparent 50%), var(--admin-canvas)",
        }}
      >
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, sm: 5 }, width: "100%", maxWidth: 480 }}
        >
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            <ChatBrand />
            <ThemeToggle />
          </Stack>
          <Typography
            variant="overline"
            color="primary.main"
            sx={{ display: "block", mt: 5 }}
          >
            Space to think. Tools to act.
          </Typography>
          <Typography component="h1" variant="h4" sx={{ mt: 1, mb: 2 }}>
            Your ideas.
            <br />A little more possibility.
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            A private place to think, search Telegram, and draft messages.
            Access is managed by the owner.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Button
            fullWidth
            variant="contained"
            disabled={pending}
            onClick={() => void login()}
            startIcon={
              pending ? (
                <CircularProgress size={18} color="inherit" />
              ) : undefined
            }
          >
            {pending ? "Signing in…" : "Sign in with Google"}
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 3, textAlign: "center" }}
          >
            Your workspace. Your conversations.
          </Typography>
        </Paper>
      </Box>
    </AdminAppearance>
  );
}

export function AiChat({ uid }: { uid: string }) {
  return (
    <AdminAppearance>
      <AiChatWorkspace uid={uid} />
    </AdminAppearance>
  );
}

function AiChatWorkspace({ uid }: { uid: string }) {
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const id = params.get("thread") ?? "";
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const threads = useQuery({
    queryKey: ["ai-threads", uid],
    queryFn: aiChatApi.threads,
    retry: false,
  });
  const thread = useQuery({
    queryKey: ["ai-thread", uid, id],
    queryFn: () => aiChatApi.thread(id),
    enabled: !!id && threads.isSuccess,
    retry: false,
  });
  const update = (data: AiChatThread) => {
    cache.setQueryData(["ai-thread", uid, data.id], data);
    void cache.invalidateQueries({ queryKey: ["ai-threads", uid] });
  };
  const create = useMutation({
    mutationFn: aiChatApi.create,
    onSuccess: (data) => {
      update(data);
      setParams({ thread: data.id });
      setDraft("");
      setHistoryOpen(false);
    },
  });
  const send = useMutation({
    mutationFn: ({ threadId, text }: { threadId: string; text: string }) =>
      aiChatApi.message(threadId, text),
    onSuccess: (data) => {
      update(data);
      setDraft("");
    },
  });
  const action = useMutation({
    mutationFn: ({
      threadId,
      actionId,
      confirm,
    }: {
      threadId: string;
      actionId: string;
      confirm: boolean;
    }) => aiChatApi.action(threadId, actionId, confirm),
    onSuccess: update,
    onError: () => {
      void cache.invalidateQueries({ queryKey: ["ai-thread", uid, id] });
    },
  });
  const busy = create.isPending || send.isPending || action.isPending;
  useEffect(() => {
    bottom.current?.scrollIntoView?.({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [thread.data?.messages.length, busy]);
  const error = create.error ?? send.error ?? action.error;
  const proposal = thread.data?.action;
  const submit = () => {
    if (draft.trim() && !busy && thread.data)
      send.mutate({ threadId: id, text: draft.trim() });
  };
  const changeThread = (next: string) => {
    setHistoryOpen(false);
    setParams({ thread: next });
    setDraft("");
    send.reset();
    action.reset();
  };
  const history = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        p: 2.5,
        gap: 2,
        minHeight: 0,
      }}
    >
      <Box sx={{ pt: 1, pb: 2 }}>
        <ChatBrand />
      </Box>
      <Button
        variant="contained"
        startIcon={<AddRounded />}
        disabled={busy || !threads.isSuccess}
        onClick={() => create.mutate()}
      >
        New chat
      </Button>
      <Typography variant="overline" color="text.secondary" sx={{ mt: 1 }}>
        Your conversations
      </Typography>
      <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {threads.isSuccess && threads.data.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
            A fresh start. Your chats will appear here.
          </Typography>
        )}
        {threads.data?.map((item) => (
          <Button
            key={item.id}
            fullWidth
            disabled={busy}
            aria-current={item.id === id ? "true" : undefined}
            startIcon={
              <ChatBubbleOutlineRounded sx={{ fontSize: "18px !important" }} />
            }
            sx={{
              justifyContent: "flex-start",
              textAlign: "left",
              mb: 0.75,
              py: 1.2,
              color: item.id === id ? "primary.main" : "text.secondary",
              bgcolor:
                item.id === id ? "var(--admin-active-wash)" : "transparent",
              border: "1px solid",
              borderColor:
                item.id === id ? "var(--admin-active-border)" : "transparent",
              boxShadow:
                item.id === id ? "inset 3px 0 var(--admin-accent)" : "none",
            }}
            onClick={() => changeThread(item.id)}
          >
            <Box
              component="span"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </Box>
          </Button>
        ))}
      </Box>
      <Divider />
      <Button
        startIcon={<LogoutRounded />}
        sx={{ justifyContent: "flex-start", color: "text.secondary" }}
        onClick={() =>
          void signOut(auth)
            .then(() => cache.clear())
            .catch(() => setSignOutError("Sign-out failed. Please try again."))
        }
      >
        Sign out
      </Button>
      {signOutError && <Alert severity="error">{signOutError}</Alert>}
    </Box>
  );
  return (
    <Box
      sx={{
        display: "flex",
        height: "100dvh",
        bgcolor: "background.default",
        background:
          "radial-gradient(ellipse at 80% 0%, var(--admin-ambient), transparent 55%), var(--admin-canvas)",
      }}
    >
      <Box
        component="a"
        href="#chat-content"
        sx={{
          position: "fixed",
          top: -100,
          left: 16,
          zIndex: 1500,
          p: 2,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&:focus": { top: 12 },
        }}
      >
        Skip to conversation
      </Box>
      <Box
        component="aside"
        aria-label="Chat history"
        sx={{
          display: { xs: "none", md: "block" },
          width: 280,
          bgcolor: "var(--admin-sidebar)",
          borderRight: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        {history}
      </Box>
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Chat history",
            sx: { width: 290, bgcolor: "var(--admin-sidebar)" },
          },
        }}
      >
        <IconButton
          aria-label="Close chat history"
          onClick={() => setHistoryOpen(false)}
          sx={{ position: "absolute", right: 4, top: 4 }}
        >
          <CloseRounded />
        </IconButton>
        {history}
      </Drawer>
      <Box
        component="main"
        id="chat-content"
        tabIndex={-1}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Stack
          component="header"
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "var(--admin-header)",
          }}
        >
          <IconButton
            aria-label="Open chat history"
            onClick={() => setHistoryOpen(true)}
            sx={{ display: { md: "none" } }}
          >
            <MenuRounded />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h1" variant="h6" noWrap>
              {thread.data?.title ?? "Private AI chat"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: "none", sm: "block" } }}
            >
              Connected owner’s Telegram account · Reads automatic · Sends
              require confirmation
            </Typography>
          </Box>
          <ThemeToggle />
        </Stack>
        <Container maxWidth="md" sx={{ flex: 1, overflowY: "auto", py: 3 }}>
          {threads.isLoading && (
            <CircularProgress aria-label="Checking access" />
          )}
          {threads.isError && (
            <Alert severity="error">
              Workspace unavailable. Sign in with the owner account or a
              verified email listed in stakeholder settings, then retry.
              <Button onClick={() => void threads.refetch()}>Retry</Button>
            </Alert>
          )}
          {threads.isSuccess && !id && (
            <Box
              sx={{
                maxWidth: 640,
                mx: "auto",
                textAlign: "center",
                mt: { xs: 3, sm: 8 },
              }}
            >
              <Box
                sx={{
                  mx: "auto",
                  mb: 3,
                  display: "grid",
                  placeItems: "center",
                  width: 72,
                  height: 72,
                  color: "primary.main",
                  border: "1px solid var(--admin-accent-border)",
                  bgcolor: "var(--admin-accent-wash)",
                  borderRadius: "24px 8px 24px 8px",
                }}
              >
                <AutoAwesomeRounded sx={{ fontSize: 32 }} />
              </Box>
              <Typography variant="overline" color="primary.main">
                Your private thinking space
              </Typography>
              <Typography component="h2" variant="h4" sx={{ mt: 1 }}>
                What would you like to work on?
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 2, mb: 3 }}>
                Start a new chat to search Telegram, summarize a conversation,
                or draft a reply.
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddRounded />}
                disabled={busy}
                onClick={() => create.mutate()}
              >
                Start a conversation
              </Button>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ mt: 5, textAlign: "left" }}
              >
                {[
                  {
                    icon: <ForumOutlined />,
                    title: "Find the context",
                    text: "Search Telegram and bring the details together.",
                  },
                  {
                    icon: <ShieldOutlined />,
                    title: "Stay in control",
                    text: "Review every recipient and message before sending.",
                  },
                ].map(({ icon, title, text }) => (
                  <Paper
                    key={title}
                    variant="outlined"
                    sx={{ p: 2.5, flex: 1 }}
                  >
                    <Box sx={{ color: "secondary.main", mb: 1 }}>{icon}</Box>
                    <Typography fontWeight={650}>{title}</Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      {text}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            </Box>
          )}
          {thread.isLoading && id && (
            <CircularProgress aria-label="Loading conversation" />
          )}
          {thread.isError && (
            <Alert severity="error">
              Could not load this chat.
              <Button onClick={() => void thread.refetch()}>Retry</Button>
            </Alert>
          )}
          <Stack spacing={3}>
            {thread.data?.messages.map((message, index) => (
              <Box
                key={index}
                sx={{
                  alignSelf: message.role === "user" ? "flex-end" : "stretch",
                  minWidth: 0,
                  maxWidth:
                    message.role === "user" ? { xs: "95%", sm: "85%" } : "100%",
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {message.role === "user" ? "You" : "Assistant"}
                </Typography>
                <Box
                  sx={{
                    bgcolor:
                      message.role === "user"
                        ? "var(--admin-active-wash)"
                        : "background.paper",
                    border: "1px solid",
                    borderColor:
                      message.role === "user"
                        ? "var(--admin-active-border)"
                        : "divider",
                    p: { xs: 2, sm: 2.5 },
                    mt: 0.75,
                    borderRadius:
                      message.role === "user"
                        ? "16px 4px 16px 16px"
                        : "4px 16px 16px 16px",
                    overflowWrap: "anywhere",
                    lineHeight: 1.8,
                    "& > *": { my: 0 },
                    "& > * + *": { mt: 2 },
                    "& a": { color: "primary.main" },
                    "& pre": {
                      overflowX: "auto",
                      p: 2,
                      bgcolor: "background.default",
                      borderRadius: 2,
                    },
                    "& :not(pre) > code": {
                      bgcolor: "action.hover",
                      px: 0.5,
                      borderRadius: 0.5,
                    },
                    "& table": {
                      display: "block",
                      overflowX: "auto",
                      borderCollapse: "collapse",
                    },
                    "& th, & td": {
                      border: "1px solid",
                      borderColor: "divider",
                      p: 1,
                    },
                    "& blockquote": {
                      borderLeft: "3px solid",
                      borderColor: "secondary.main",
                      ml: 0,
                      pl: 2,
                      color: "text.secondary",
                    },
                  }}
                >
                  {message.role === "user" ? (
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>
                      {message.text}
                    </Typography>
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      components={{
                        img: ({ alt }) => <span>{alt}</span>,
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                  )}
                </Box>
              </Box>
            ))}
          </Stack>
          {proposal && (
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 2, sm: 3 },
                mt: 3,
                borderColor: "secondary.main",
                background:
                  "linear-gradient(110deg, var(--admin-panel-start), var(--admin-panel-end))",
                overflowWrap: "anywhere",
              }}
            >
              <Typography variant="overline" color="secondary.main">
                Review before sending
              </Typography>
              <Typography variant="h6">
                {proposal.tool === "reply_to_message"
                  ? "Reply preview"
                  : "Message preview"}
              </Typography>
              <Typography>
                To: {proposal.chatTitle} ({proposal.chatId})
              </Typography>
              {proposal.messageId && (
                <Typography>Reply to message: {proposal.messageId}</Typography>
              )}
              <Divider sx={{ my: 1 }} />
              <Typography
                sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {proposal.text}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption">
                Status: {proposal.status} · Expires:{" "}
                {new Date(proposal.expiresAt).toLocaleString()}
              </Typography>
              {proposal.status === "pending" && (
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    disabled={
                      busy || Date.parse(proposal.expiresAt) <= Date.now()
                    }
                    onClick={() =>
                      action.mutate({
                        threadId: id,
                        actionId: proposal.id,
                        confirm: true,
                      })
                    }
                  >
                    Confirm send
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      action.mutate({
                        threadId: id,
                        actionId: proposal.id,
                        confirm: false,
                      })
                    }
                  >
                    Cancel
                  </Button>
                </Stack>
              )}
              {(proposal.status === "uncertain" ||
                proposal.status === "sending") && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Delivery is not confirmed. Check Telegram before creating
                  another send.
                </Alert>
              )}
            </Paper>
          )}
          {busy && (
            <Typography role="status" sx={{ mt: 2 }}>
              {action.isPending ? "Processing your choice…" : "Working…"}
            </Typography>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error.message}
            </Alert>
          )}
          <div ref={bottom} />
        </Container>
        {threads.isSuccess && thread.data && (
          <Container maxWidth="md" sx={{ pb: 2, pt: 2 }}>
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 1.5, sm: 2 },
                mb: 1.5,
                boxShadow: "0 8px 32px #0000000d",
              }}
            >
              <Box
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
                sx={{
                  display: "flex",
                  alignItems: { xs: "stretch", sm: "flex-end" },
                  flexDirection: { xs: "column", sm: "row" },
                  gap: 1.5,
                }}
              >
                <TextField
                  fullWidth
                  multiline
                  maxRows={6}
                  label="Message your assistant"
                  value={draft}
                  disabled={busy}
                  slotProps={{ htmlInput: { maxLength: 4000 } }}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  endIcon={<ArrowUpwardRounded />}
                  sx={{ flexShrink: 0 }}
                  disabled={busy || !draft.trim()}
                >
                  Send prompt
                </Button>
              </Box>
            </Paper>
            <Typography variant="caption" color="text.secondary">
              AI can make mistakes. Review recipients and message text before
              confirming. A new prompt replaces any pending proposal.
            </Typography>
          </Container>
        )}
      </Box>
    </Box>
  );
}
