import { useState, type ReactNode } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CardActionArea,
  Chip,
  CircularProgress,
  Container,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowForwardRounded,
  AutoAwesomeRounded,
  ChatBubbleOutlineRounded,
  CloseRounded,
  DashboardRounded,
  DescriptionOutlined,
  HubOutlined,
  MenuBookRounded,
  MenuRounded,
  PermMediaOutlined,
  SettingsOutlined,
  TuneRounded,
} from "@mui/icons-material";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DebugLink } from "./DebugLogs.js";
import { signIn } from "./auth.js";
import { AdminAppearance, ThemeToggle } from "./AdminAppearance.js";
import { LanguageToggle, useI18n } from "./i18n.js";
import { adminApi } from "./api.js";

const destinations = [
  {
    path: "dashboard",
    label: "Dashboard",
    group: "Workspace",
    icon: DashboardRounded,
    description: "Your assistant workspace, at a glance.",
  },
  {
    path: "schedule",
    label: "Schedule",
    group: "Workspace",
    icon: TuneRounded,
    description: "Set your working rhythm. Manage availability and exceptions.",
  },
  {
    path: "conversations",
    label: "Conversations",
    group: "Workspace",
    icon: ChatBubbleOutlineRounded,
    description:
      "Stay close to your clients. Review conversations and human requests.",
  },
  {
    path: "prompt",
    label: "Assistant prompt",
    group: "Intelligence",
    icon: AutoAwesomeRounded,
    description: "Fine-tune how your assistant thinks, speaks and plans.",
  },
  {
    path: "knowledge-base",
    label: "Knowledge Base",
    group: "Intelligence",
    icon: MenuBookRounded,
    description:
      "Give your assistant the business knowledge behind every answer.",
  },
  {
    path: "bot-settings",
    label: "Bot settings",
    group: "Intelligence",
    icon: SettingsOutlined,
    description: "Connect your tools and configure assistant behavior.",
  },
  {
    path: "media",
    label: "Media Store",
    group: "Resources",
    icon: PermMediaOutlined,
    description: "A visual library for more helpful client conversations.",
  },
  {
    path: "specs",
    label: "Specs",
    group: "Resources",
    icon: DescriptionOutlined,
    description:
      "Explore the product behavior and requirements behind your workspace.",
  },
];
const mono = {
  fontFamily: '"SFMono-Regular", Consolas, monospace',
  letterSpacing: "0.12em",
};

function Brand() {
  const { t } = useI18n();
  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          width: 40,
          height: 40,
          borderRadius: "12px 4px 12px 4px",
          border: "1px solid var(--admin-accent-border)",
          bgcolor: "var(--admin-accent-wash)",
          color: "primary.main",
        }}
      >
        <HubOutlined />
      </Box>
      <Box>
        <Typography
          fontWeight={750}
          sx={{ letterSpacing: "-0.04em", lineHeight: 1.3 }}
        >
          {t("Massage")}<span style={{ color: "var(--admin-accent)" }}> {t(" ")}{t("/ AI")}</span>
        </Typography>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontSize: "0.55rem" }}
        >
          {t("Assistant workspace")}</Typography>
      </Box>
    </Stack>
  );
}
export function AdminShell({
  uid,
  children,
}: {
  uid: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const current = destinations.find(
    (item) => location.pathname === `/${item.path}`,
  );
  const navigation = (
    <Box
      sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2.5 }}
    >
      <Box sx={{ px: 0.5, pt: 1, pb: 4 }}>
        <Brand />
      </Box>
      <Box component="nav" aria-label={t("Admin navigation")} sx={{ flex: 1 }}>
        {["Workspace", "Intelligence", "Resources"].map((group) => (
          <Box key={group} sx={{ mb: 2.5 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 1.5, display: "block", mb: 1 }}
            >
              {t(group)}
            </Typography>
            {destinations
              .filter((item) => item.group === group)
              .map(({ path, label, icon: Icon }) => (
                <Button
                  key={path}
                  component={NavLink}
                  to={`/${path}`}
                  onClick={() => setOpen(false)}
                  startIcon={<Icon sx={{ fontSize: "19px !important" }} />}
                  fullWidth
                  sx={{
                    justifyContent: "flex-start",
                    mb: 0.5,
                    py: 1.1,
                    color: "text.secondary",
                    fontSize: "0.83rem",
                    border: "1px solid transparent",
                    "&.active": {
                      color: "primary.main",
                      bgcolor: "var(--admin-active-wash)",
                      borderColor: "var(--admin-active-border)",
                      boxShadow: "inset 3px 0 var(--admin-accent)",
                    },
                    "&:hover": {
                      bgcolor: "var(--admin-hover)",
                      color: "text.primary",
                    },
                  }}
                >
                  {t(label)}
                </Button>
              ))}
          </Box>
        ))}
        <Box
          onClick={() => setOpen(false)}
          sx={{
            "& a": {
              width: "100%",
              justifyContent: "flex-start",
              color: "text.secondary",
            },
            "& a.active": {
              color: "primary.main",
              bgcolor: "var(--admin-active-wash)",
            },
          }}
        >
          <DebugLink uid={uid} />
        </Box>
      </Box>
      <Box
        sx={{ mt: 2, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}
      >
        <Stack direction="row" spacing={1.3} alignItems="center">
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: "var(--admin-avatar-bg)",
              color: "var(--admin-avatar-fg)",
              fontSize: 12,
            }}
          >
            {t("AD")}</Avatar>
          <Box>
            <Typography variant="body2" fontWeight={600}>
              {t("Admin workspace")}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t("Europe/Kyiv")}</Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
  return (
    <AdminAppearance>
      <Box
        sx={{
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse at 80% 0%, var(--admin-ambient), transparent 55%), var(--admin-canvas)",
        }}
      >
        <Box
          component="a"
          href="#main-content"
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
          {t("Skip to content")}</Box>
        <Box
          component="aside"
          sx={{
            display: { xs: "none", lg: "block" },
            position: "fixed",
            inset: "0 auto 0 0",
            width: 252,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "var(--admin-sidebar)",
            overflowY: "auto",
          }}
        >
          {navigation}
        </Box>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          slotProps={{
            paper: {
              role: "dialog",
              "aria-label": t("Navigation menu"),
              sx: { width: 282, bgcolor: "var(--admin-sidebar)" },
            },
          }}
        >
          <IconButton
            aria-label={t("Close navigation")}
            onClick={() => setOpen(false)}
            sx={{ position: "absolute", right: 5, top: 5 }}
          >
            <CloseRounded />
          </IconButton>
          {navigation}
        </Drawer>
        <Box sx={{ ml: { lg: "252px" } }}>
          <Stack
            component="header"
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              minHeight: 76,
              px: { xs: 2, md: 4 },
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: "var(--admin-header)",
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <IconButton
                aria-label={t("Open navigation")}
                onClick={() => setOpen(true)}
                sx={{ display: { lg: "none" } }}
              >
                <MenuRounded />
              </IconButton>
              <Typography variant="body2" color="text.secondary">
                {t("Workspace")}{t(" ")}
                <Box
                  component="span"
                  sx={{ px: 1.5, color: "var(--admin-muted)" }}
                >
                  /
                </Box>
                <Box component="span" sx={{ color: "text.primary" }}>
                  {t(current?.label ?? "Debug")}
                </Box>
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip
                size="small"
                variant="outlined"
                label={t("ADMIN CONSOLE")}
                sx={{
                  ...mono,
                  fontSize: "0.6rem",
                  display: { xs: "none", sm: "flex" },
                  borderColor: "var(--admin-line)",
                }}
              />
              <LanguageToggle />
              <ThemeToggle />
            </Stack>
          </Stack>
          <Box
            component="main"
            id="main-content"
            tabIndex={-1}
            sx={{ minWidth: 0, pb: 5 }}
          >
            {children}
          </Box>
          <Stack
            component="footer"
            direction="row"
            justifyContent="space-between"
            sx={{ px: { xs: 2, md: 4 }, pb: 3, color: "text.secondary" }}
          >
            <Typography variant="overline">{t("Massage / AI")}</Typography>
            <Typography variant="caption">{t("Built around your time.")}</Typography>
          </Stack>
        </Box>
      </Box>
    </AdminAppearance>
  );
}
export function Page({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const titleKey = destinations.find((item) => item.label === title || t(item.label) === title)?.label
    ?? (["Dashboard", "Debug"].find((key) => key === title || t(key) === title) ?? title);
  const destination = destinations.find((item) => item.label === titleKey);
  return (
    <Container
      maxWidth="xl"
      sx={{ pt: { xs: 3, md: 4.5 }, px: { xs: 2, md: 4 } }}
    >
      <Typography variant="overline" color="primary.main">
        {t(destination?.group ?? "Diagnostics")} /{t(" ")}
        {titleKey === "Dashboard" ? t("Overview") : t("Control panel")}
      </Typography>
      <Typography component="h1" variant="h4" sx={{ mt: 0.75, mb: 1 }}>
        {t(titleKey)}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3.5, maxWidth: 760 }}>
        {destination?.description ??
          t("Inspect assistant activity and test your prompts.")}
      </Typography>
      {titleKey === "Dashboard" ? (
        children
      ) : (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2, md: 3 }, minWidth: 0, "& > *": { minWidth: 0 } }}
        >
          {children}
        </Paper>
      )}
    </Container>
  );
}
const shortcuts = [
  {
    path: "schedule",
    eyebrow: "01 / AVAILABILITY",
    title: "Your time, in sync",
    detail: "Working hours, exceptions and imported slots.",
    icon: TuneRounded,
    color: "var(--admin-accent)",
  },
  {
    path: "conversations",
    eyebrow: "02 / CLIENT CARE",
    title: "Keep the conversation going",
    detail: "Review client conversations and step in when needed.",
    icon: ChatBubbleOutlineRounded,
    color: "var(--admin-violet)",
  },
  {
    path: "media",
    eyebrow: "03 / CONTENT",
    title: "Show. Connect. Inspire.",
    detail: "Curate the photos and videos your assistant shares.",
    icon: PermMediaOutlined,
    color: "var(--admin-gold)",
  },
];
function OpenAiBalanceCard() {
  const { t, language } = useI18n();
  const query = useQuery({
    queryKey: ["openai-balance"],
    queryFn: adminApi.openAiBalance,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const formatUsd = (amount: number | null) => amount === null
    ? "—"
    : new Intl.NumberFormat(language === "uk" ? "uk-UA" : "en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 }, borderColor: "var(--admin-hero-border)" }}>
      <Typography variant="overline" color="primary.main" sx={{ letterSpacing: "0.12em", fontWeight: 700 }}>
        {t("OPENAI BALANCE")}
      </Typography>
      {query.isPending ? (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
          <CircularProgress size={22} />
          <Typography color="text.secondary">{t("Loading OpenAI balance…")}</Typography>
        </Stack>
      ) : query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void query.refetch()}>{t("Retry")}</Button>}>
          {t("OpenAI balance is unavailable. Try again later.")}
        </Alert>
      ) : (
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={3} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{t("Estimated remaining balance")}</Typography>
            <Typography component="p" sx={{ fontSize: { xs: "2.8rem", md: "3.8rem" }, lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.055em", my: 0.5 }}>
              {formatUsd(query.data.estimatedRemaining)}
            </Typography>
            {query.data.totalCredits === null && <Typography variant="body2" color="text.secondary">{t("Set OPENAI_TOTAL_CREDITS on the server to calculate the estimate.")}</Typography>}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(130px, 1fr))", gap: { xs: 2, md: 4 }, width: { xs: "100%", md: "auto" } }}>
            <Box>
              <Typography variant="caption" color="text.secondary">{t("Total credits")}</Typography>
              <Typography variant="h6" fontWeight={700}>{formatUsd(query.data.totalCredits)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t("Used")}</Typography>
              <Typography variant="h6" fontWeight={700}>{formatUsd(query.data.used)}</Typography>
            </Box>
          </Box>
        </Stack>
      )}
    </Paper>
  );
}

export function Dashboard() {
  const { t } = useI18n();
  return (
    <Page title={t("Dashboard")}>
      <Stack spacing={3}>
        <Paper
          variant="outlined"
          sx={{
            position: "relative",
            overflow: "hidden",
            p: { xs: 3, md: 4.5 },
            background:
              "linear-gradient(115deg, var(--admin-hero-start), var(--admin-hero-mid) 60%, var(--admin-hero-end))",
            borderColor: "var(--admin-hero-border)",
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              inset: 0,
              opacity: 0.16,
              backgroundImage:
                "linear-gradient(var(--admin-grid) 1px, transparent 1px), linear-gradient(90deg, var(--admin-grid) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
              maskImage: "linear-gradient(90deg, transparent, black)",
            }}
          />
          <Box
            aria-hidden="true"
            sx={{
              display: { xs: "none", md: "block" },
              position: "absolute",
              right: "7%",
              top: "15%",
              width: 210,
              height: 210,
              border: "1px solid var(--admin-orbit)",
              borderRadius: "50%",
              boxShadow:
                "0 0 80px var(--admin-active-wash), inset 0 0 60px var(--admin-active-wash)",
              transform: "rotate(-25deg)",
              "&::before": {
                content: '""',
                position: "absolute",
                inset: "28px -28px",
                border: "1px solid var(--admin-orbit-secondary)",
                borderRadius: "50%",
              },
              "&::after": {
                content: '"✦"',
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                fontSize: 90,
                color: "var(--admin-star)",
                textShadow: "0 0 40px var(--admin-star-glow)",
              },
            }}
          />
          <Box sx={{ position: "relative", maxWidth: { md: "65%" } }}>
            <Typography
              variant="overline"
              sx={{ color: "var(--admin-hero-label)" }}
            >
              {t("Human touch. Assisted by AI.")}</Typography>
            <Typography
              component="h2"
              sx={{
                fontSize: { xs: "2rem", md: "2.7rem" },
                fontWeight: 650,
                letterSpacing: "-0.055em",
                lineHeight: 1.15,
                mt: 2,
                mb: 2,
              }}
            >
              {t("More space for care.")}<br />
              <Box component="span" sx={{ color: "primary.main" }}>
                {t("Less time on admin.")}</Box>
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 460, mb: 3 }}>
              {t("Your calendar, conversations and assistant — brought together in one thoughtful workspace.")}</Typography>
            <Button
              component={Link}
              to="/bot-settings"
              variant="contained"
              endIcon={<ArrowForwardRounded />}
            >
              {t("Calendar settings")}</Button>
          </Box>
        </Paper>
        <OpenAiBalanceCard />
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography component="h2" variant="h6">
            {t("Your daily workspace")}</Typography>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "block" } }}
          >
            {t("Stay in control")}</Typography>
        </Stack>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {shortcuts.map(
            ({ path, eyebrow, title, detail, icon: Icon, color }) => (
              <Paper
                key={path}
                variant="outlined"
                sx={{
                  overflow: "hidden",
                  transition: "border-color 160ms",
                  "&:hover": { borderColor: color },
                }}
              >
                <CardActionArea
                  component={Link}
                  to={`/${path}`}
                  aria-label={t(destinations.find((item) => item.path === path)?.label ?? "") + ": " + t(title)}
                  sx={{ p: 3, height: "100%" }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 3 }}
                  >
                    <Box
                      sx={{
                        p: 1.2,
                        display: "flex",
                        bgcolor: `color-mix(in srgb, ${color} 7%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 19%, transparent)`,
                        borderRadius: 2,
                        color,
                      }}
                    >
                      <Icon />
                    </Box>
                    <ArrowForwardRounded
                      sx={{ color: "text.secondary", fontSize: 18 }}
                    />
                  </Stack>
                  <Typography variant="overline" color="text.secondary">
                    {t(eyebrow)}
                  </Typography>
                  <Typography
                    component="h3"
                    variant="h6"
                    sx={{ fontSize: "1.05rem", my: 1 }}
                  >
                    {t(title)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(detail)}
                  </Typography>
                </CardActionArea>
              </Paper>
            ),
          )}
        </Box>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, md: 3 },
            display: "flex",
            gap: 2.5,
            flexWrap: "wrap",
            alignItems: "center",
            background:
              "linear-gradient(110deg, var(--admin-panel-start), var(--admin-panel-end))",
          }}
        >
          <AutoAwesomeRounded sx={{ color: "secondary.main", fontSize: 30 }} />
          <Box sx={{ flex: "1 1 260px" }}>
            <Typography component="h2" variant="h6">
              {t("Make it sound like you.")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("Shape your assistant’s voice and give every answer the right context.")}</Typography>
          </Box>
          <Button
            component={Link}
            to="/prompt"
            variant="outlined"
            color="secondary"
          >
            {t("Assistant prompt")}</Button>
          <Button
            component={Link}
            to="/knowledge-base"
            color="secondary"
            endIcon={<ArrowForwardRounded />}
          >
            {t("Knowledge Base")}</Button>
        </Paper>
      </Stack>
    </Page>
  );
}
export function Login() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const login = async () => {
    setPending(true);
    setError(false);
    try {
      await signIn();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
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
          sx={{ p: { xs: 3, sm: 5 }, width: "100%", maxWidth: 460 }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Brand />
            <LanguageToggle />
            <ThemeToggle />
          </Stack>
          <Typography
            variant="overline"
            color="primary.main"
            sx={{ display: "block", mt: 6 }}
          >
            {t("Welcome to your workspace")}</Typography>
          <Typography component="h1" variant="h4" sx={{ mt: 1, mb: 2 }}>
            {t("A little intelligence.")}<br />{t("A lot more possibility.")}</Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {t("Sign in to manage your bookings, care for your clients and make your assistant your own.")}</Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {t("Could not sign in. Please try again.")}</Alert>
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
            {pending ? t("Signing in…") : t("Sign in with Google")}
          </Button>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 3 }}
          >
            {t("Private workspace · Authorized administrators only")}</Typography>
        </Paper>
      </Box>
    </AdminAppearance>
  );
}
