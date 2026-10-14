// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminShell, Dashboard, Login } from "./AdminShell.js";
vi.mock("./DebugLogs.js", () => ({ DebugLink: () => null }));
vi.mock("./auth.js", () => ({ signIn: vi.fn() }));
vi.mock("./api.js", () => ({ adminApi: { openAiBalance: vi.fn(), updateOpenAiBalance: vi.fn() } }));
import { signIn } from "./auth.js";
import { adminApi } from "./api.js";
const renderDashboard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  </QueryClientProvider>,
);
const currentBalance = { totalCredits: 100, used: 12.5, estimatedRemaining: 87.5, currency: "usd" as const, updatedAt: "2026-10-14T14:00:00.000Z" };
beforeEach(() => {
  vi.mocked(adminApi.openAiBalance).mockResolvedValue(currentBalance);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(adminApi.openAiBalance).mockReset();
  vi.mocked(adminApi.updateOpenAiBalance).mockReset();
  localStorage.clear();
});
describe("admin experience", () => {
  it("groups navigation, marks the current page and exposes a skip link", () => {
    render(
      <MemoryRouter initialEntries={["/bot-settings"]}>
        <AdminShell uid="admin">
          <p>Page content</p>
        </AdminShell>
      </MemoryRouter>,
    );
    expect(
      screen
        .getByRole("link", { name: "Bot settings" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.queryByRole("link", { name: "Bookings" })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Skip to content" })
        .getAttribute("href"),
    ).toBe("#main-content");
    expect(screen.getByText("Intelligence")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Debug" })).toBeNull();
  });
  it("closes mobile navigation after selecting a destination", async () => {
    render(
      <MemoryRouter>
        <AdminShell uid="admin">
          <Routes>
            <Route path="*" element={<p>Home</p>} />
            <Route path="/schedule" element={<p>Schedule destination</p>} />
          </Routes>
        </AdminShell>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("link", { name: "Schedule" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Schedule destination")).toBeTruthy();
  });
  it("provides real dashboard destinations without invented metrics", () => {
    renderDashboard();
    expect(
      screen.getByRole("link", { name: /Calendar settings/ }).getAttribute("href"),
    ).toBe("/bot-settings");
    expect(
      screen.getByRole("link", { name: /Knowledge Base/ }).getAttribute("href"),
    ).toBe("/knowledge-base");
  });
  it("explains when an old baseline prevents a remaining-balance estimate", async () => {
    vi.mocked(adminApi.openAiBalance).mockResolvedValueOnce({ ...currentBalance, estimatedRemaining: null });
    renderDashboard();

    expect(await screen.findByText("Balance baseline is older than available cost history. Save a current balance to resume estimates.")).toBeTruthy();
    expect(screen.getByText("Used in available reporting period")).toBeTruthy();
    expect(screen.getByText("$12.50")).toBeTruthy();
  });
  it("reports login failure and allows retry", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Popup blocked"));
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Google" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Sign in with Google" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
  it("shows prominent links to both public legal pages on login", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const privacyLink = document.querySelector<HTMLAnchorElement>(
      'a[href="/privacy-policy"]',
    );
    const termsLink = document.querySelector<HTMLAnchorElement>(
      'a[href="/terms-and-conditions"]',
    );
    expect(privacyLink).toBeTruthy();
    expect(termsLink).toBeTruthy();
  });
});

describe("admin theme preference", () => {
  it("switches both directions, persists across remounts and preserves drafts", () => {
    const show = () =>
      render(
        <MemoryRouter>
          <AdminShell uid="admin">
            <input aria-label="Draft" defaultValue="Unsaved edit" />
          </AdminShell>
        </MemoryRouter>,
      );
    const view = show();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to day theme" }),
    );
    expect(localStorage.getItem("massage-admin-theme")).toBe("light");
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe(
      "Unsaved edit",
    );
    view.unmount();
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to night theme" }),
    );
    expect(localStorage.getItem("massage-admin-theme")).toBe("dark");
  });
  it("restores day theme on login", () => {
    localStorage.setItem("massage-admin-theme", "light");
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Switch to night theme" }),
    ).toBeTruthy();
  });
  it("defaults invalid preferences to night", () => {
    localStorage.setItem("massage-admin-theme", "invalid");
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Switch to day theme" }),
    ).toBeTruthy();
  });
  it("still switches when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to day theme" }),
    );
    expect(
      screen.getByRole("button", { name: "Switch to night theme" }),
    ).toBeTruthy();
  });
});
