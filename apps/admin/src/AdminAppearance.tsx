import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CssBaseline, IconButton, ThemeProvider, Tooltip } from "@mui/material";
import { DarkModeOutlined, LightModeOutlined } from "@mui/icons-material";
import { createAdminTheme } from "./adminTheme.js";
import { useI18n } from "./i18n.js";

type Mode = "light" | "dark";
const storageKey = "massage-admin-theme";
const ThemeModeContext = createContext({
  mode: "dark" as Mode,
  toggle: () => {},
});
function savedMode(): Mode {
  try {
    return localStorage.getItem(storageKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function AdminAppearance({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(savedMode);
  const theme = useMemo(() => createAdminTheme(mode), [mode]);
  const toggle = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* Keep the current view usable when browser storage is unavailable. */
    }
  };
  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function ThemeToggle() {
  const { mode, toggle } = useContext(ThemeModeContext);
  const { t } = useI18n();
  const label =
    mode === "dark" ? t("Switch to day theme") : t("Switch to night theme");
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={toggle}
        sx={{
          color: "text.primary",
          border: "1px solid",
          borderColor: "divider",
          width: 40,
          height: 40,
          flexShrink: 0,
        }}
      >
        {mode === "dark" ? (
          <LightModeOutlined fontSize="small" />
        ) : (
          <DarkModeOutlined fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
}
