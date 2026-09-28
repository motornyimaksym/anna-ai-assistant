// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminShell, Dashboard, Login } from "./AdminShell.js";
vi.mock("./DebugLogs.js", () => ({ DebugLink: () => null }));
vi.mock("./auth.js", () => ({ signIn: vi.fn() }));
import { signIn } from "./auth.js";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Calendar settings/ }).getAttribute("href"),
    ).toBe("/bot-settings");
    expect(
      screen.getByRole("link", { name: /Knowledge Base/ }).getAttribute("href"),
    ).toBe("/knowledge-base");
  });
  it("reports login failure and allows retry", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("Popup blocked"));
    render(<Login />);
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
    render(<Login />);
    expect(
      screen.getByRole("button", { name: "Switch to night theme" }),
    ).toBeTruthy();
  });
  it("defaults invalid preferences to night", () => {
    localStorage.setItem("massage-admin-theme", "invalid");
    render(<Login />);
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
    render(<Login />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to day theme" }),
    );
    expect(
      screen.getByRole("button", { name: "Switch to night theme" }),
    ).toBeTruthy();
  });
});
