import { createTheme } from "@mui/material/styles";

export function createAdminTheme(mode: "light" | "dark") {
  const dark = mode === "dark";
  return createTheme({
    palette: {
      mode,
      primary: {
        main: dark ? "#6aefdf" : "#00796f",
        contrastText: dark ? "#071616" : "#ffffff",
      },
      secondary: { main: dark ? "#b5a0ff" : "#6840b6" },
      background: {
        default: dark ? "#090d16" : "#f3f6fa",
        paper: dark ? "#111824" : "#ffffff",
      },
      text: {
        primary: dark ? "#edf2fa" : "#172335",
        secondary: dark ? "#a2afc3" : "#536278",
      },
      divider: dark ? "#263244" : "#ced8e4",
      success: { main: dark ? "#75e6ae" : "#207348" },
      warning: { main: dark ? "#f3cb7a" : "#8b6008" },
      error: { main: dark ? "#ff8d9e" : "#b72f49" },
      info: { main: dark ? "#8cbfff" : "#225eb2" },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", sans-serif',
      h4: { fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.055em" },
      h5: { fontWeight: 650, letterSpacing: "-0.035em" },
      h6: { fontWeight: 650, letterSpacing: "-0.025em" },
      button: { textTransform: "none", fontWeight: 650 },
      body1: { fontSize: "0.94rem", lineHeight: 1.7 },
      body2: { lineHeight: 1.65 },
      overline: {
        fontFamily: '"SFMono-Regular", Consolas, monospace',
        fontSize: "0.65rem",
        letterSpacing: "0.15em",
        lineHeight: 2,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            "--admin-accent": dark ? "#6aefdf" : "#00796f",
            "--admin-accent-border": dark ? "#6aefdf60" : "#00796f60",
            "--admin-accent-wash": dark ? "#6aefdf12" : "#00796f12",
            "--admin-active-wash": dark ? "#6aefdf0d" : "#00796f12",
            "--admin-active-border": dark ? "#6aefdf35" : "#00796f40",
            "--admin-hover": dark ? "#ffffff07" : "#00796f08",
            "--admin-avatar-bg": dark ? "#282442" : "#e9e1f8",
            "--admin-avatar-fg": dark ? "#c5b6ff" : "#65419f",
            "--admin-ambient": dark ? "#18223866" : "#dce9f266",
            "--admin-canvas": dark ? "#090d16" : "#f3f6fa",
            "--admin-sidebar": dark ? "#0d131e" : "#ffffff",
            "--admin-header": dark ? "#0d131eaa" : "#ffffffcc",
            "--admin-muted": dark ? "#52647b" : "#62748b",
            "--admin-line": dark ? "#354258" : "#bccbdc",
            "--admin-violet": dark ? "#b5a0ff" : "#6840b6",
            "--admin-gold": dark ? "#f3cb7a" : "#8b6008",
            "--admin-hero-start": dark ? "#152b32" : "#e1f3ef",
            "--admin-hero-mid": dark ? "#141e32" : "#eaf0fa",
            "--admin-hero-end": dark ? "#241d3b" : "#eee5f8",
            "--admin-hero-border": dark ? "#3a5565" : "#bacfd6",
            "--admin-grid": dark ? "#7edbc433" : "#00796f33",
            "--admin-orbit": dark ? "#6aefdf55" : "#00796f55",
            "--admin-orbit-secondary": dark ? "#b5a0ff66" : "#6840b666",
            "--admin-star": dark ? "#8deee0" : "#00877d",
            "--admin-star-glow": dark ? "#6aefdf66" : "#00796f33",
            "--admin-hero-label": dark ? "#a5e9df" : "#30695f",
            "--admin-panel-start": dark ? "#191c30" : "#eee9f8",
            "--admin-panel-end": dark ? "#111824" : "#ffffff",
            "--admin-login-teal": dark ? "#173b4355" : "#b9e9df55",
            "--admin-login-violet": dark ? "#442f6355" : "#d5bfee55",
          },
          body: {
            colorScheme: mode,
            backgroundColor: dark ? "#090d16" : "#f3f6fa",
          },
          "*": {
            scrollbarWidth: "thin",
            scrollbarColor: dark ? "#39485e #111824" : "#a3b2c5 #f3f6fa",
          },
          "::selection": {
            background: dark ? "#255c61" : "#c4eee8",
            color: dark ? "#fff" : "#172335",
          },
          ":focus-visible": {
            outline: dark ? "2px solid #6aefdf" : "2px solid #00796f",
            outlineOffset: 4,
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*, *::before, *::after": {
              animation: "none !important",
              transition: "none !important",
              scrollBehavior: "auto !important",
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            borderColor: dark ? "#263244" : "#ced8e4",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: dark ? "1px solid #263244" : "1px solid #ced8e4",
            boxShadow: "0 8px 32px #00000014",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, minHeight: 40, paddingInline: 16 },
          containedPrimary: {
            background: dark ? "#6aefdf" : "#00796f",
            "&:hover": {
              background: dark ? "#95f6eb" : "#00665e",
              boxShadow: dark ? "0 0 24px #6aefdf24" : "0 0 24px #00796f24",
            },
          },
          outlined: { borderColor: dark ? "#3c5264" : "#a6b8ca" },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            background: dark ? "#0c121d" : "#f8fafc",
            "& fieldset": { borderColor: dark ? "#354258" : "#aebed0" },
            "&:hover fieldset": { borderColor: dark ? "#8497af" : "#536b84" },
          },
          input: { fontSize: "0.9rem" },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { color: dark ? "#adbacd" : "#536278" } },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            border: dark ? "1px solid #263244" : "1px solid #ced8e4",
            borderRadius: 12,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: dark ? "#263244" : "#ced8e4",
            padding: "18px 16px",
          },
          head: {
            background: dark ? "#172131" : "#e9eff6",
            color: dark ? "#b7c6d9" : "#3f526b",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.045em",
            whiteSpace: "nowrap",
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:last-child td": { borderBottom: 0 },
            "&:hover td": { backgroundColor: dark ? "#6aefdf05" : "#00796f08" },
          },
        },
      },
      MuiTabs: {
        defaultProps: {
          variant: "scrollable",
          scrollButtons: "auto",
          allowScrollButtonsMobile: true,
        },
        styleOverrides: {
          root: {
            borderBottom: dark ? "1px solid #263244" : "1px solid #ced8e4",
            minHeight: 48,
          },
          indicator: { height: 3, borderRadius: 3 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", minHeight: 48, fontWeight: 600 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600 },
          colorDefault: {
            background: dark ? "#223044" : "#e5ecf5",
            color: dark ? "#d0dbeb" : "#354964",
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            border: "1px solid",
            borderColor: "currentColor",
            borderRadius: 10,
          },
          message: { color: dark ? "#edf2fa" : "#172335" },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            border: dark ? "1px solid #3a4960" : "1px solid #b7c7d8",
            boxShadow: "0 24px 100px #0009",
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { padding: "24px 24px 16px" } },
      },
      MuiDialogActions: {
        styleOverrides: { root: { padding: "16px 24px 24px" } },
      },
    },
  });
}
