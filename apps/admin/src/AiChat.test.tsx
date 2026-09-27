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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AiChat, AiChatEntry } from "./AiChat.js";
import { aiChatApi } from "./api.js";
vi.mock("./api.js", () => ({
  aiChatApi: {
    threads: vi.fn(),
    thread: vi.fn(),
    create: vi.fn(),
    message: vi.fn(),
    action: vi.fn(),
  },
}));
vi.mock("./auth.js", () => ({ auth: {}, signIn: vi.fn() }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn(async () => {}) }));
const id = "de51f614-fffc-4a23-824f-788758a041fb";
const thread = {
  id,
  title: "Team updates",
  createdAt: "2026-09-25T12:00:00.000Z",
  updatedAt: "2026-09-25T12:00:00.000Z",
  messages: [
    {
      role: "assistant" as const,
      text: "**Found** your team chat.",
      createdAt: "2026-09-25T12:00:00.000Z",
    },
  ],
};
const proposal = {
  id: "ad51f614-fffc-4a23-824f-788758a041fb",
  tool: "reply_to_message" as const,
  chatId: "-10042",
  chatTitle: "Team",
  text: "Hello team",
  messageId: 7,
  expiresAt: "2099-01-01T00:00:00.000Z",
  status: "pending" as const,
};
const show = (url = `/ai-chat?thread=${id}`) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <MemoryRouter initialEntries={[url]}>
        <AiChat uid="owner" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
beforeEach(() => {
  vi.mocked(aiChatApi.threads).mockResolvedValue([thread]);
  vi.mocked(aiChatApi.thread).mockResolvedValue(thread);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});
describe("standalone AI workspace", () => {
  it("has a standalone sign-in and no booking navigation", () => {
    render(<AiChatEntry user={null} />);
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toBeTruthy();
    expect(screen.queryByText("Bookings")).toBeNull();
    expect(screen.queryByText("Bot settings")).toBeNull();
  });
  it("loads history and renders safe formatted assistant text without other pages", async () => {
    show();
    expect(await screen.findByText("Found")).toBeTruthy();
    expect(screen.getByText("Found").tagName).toBe("STRONG");
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(screen.queryByText("Massage assistant")).toBeNull();
  });
  it("shows recipient/body/reply ID and requires a button click to send", async () => {
    vi.mocked(aiChatApi.thread).mockResolvedValue({
      ...thread,
      action: proposal,
    });
    vi.mocked(aiChatApi.action).mockResolvedValue({
      ...thread,
      action: { ...proposal, status: "sent" },
    });
    show();
    expect(await screen.findByText("Hello team")).toBeTruthy();
    expect(screen.getByText("To: Team (-10042)")).toBeTruthy();
    expect(screen.getByText("Reply to message: 7")).toBeTruthy();
    expect(aiChatApi.action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    await waitFor(() =>
      expect(aiChatApi.action).toHaveBeenCalledWith(id, proposal.id, true),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Confirm send" })).toBeNull(),
    );
  });
  it("cancels proposals and sends prompts through separate application endpoints", async () => {
    vi.mocked(aiChatApi.thread).mockResolvedValue({
      ...thread,
      action: proposal,
    });
    vi.mocked(aiChatApi.action).mockResolvedValue({
      ...thread,
      action: { ...proposal, status: "cancelled" },
    });
    vi.mocked(aiChatApi.message).mockResolvedValue(thread);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(aiChatApi.action).toHaveBeenCalledWith(id, proposal.id, false),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(false),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Search Telegram for Friday" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await waitFor(() =>
      expect(aiChatApi.message).toHaveBeenCalledWith(
        id,
        "Search Telegram for Friday",
      ),
    );
  });
  it("denies workspace controls when backend rejects access", async () => {
    vi.mocked(aiChatApi.threads).mockRejectedValue(new Error("Unauthorized"));
    show();
    expect(await screen.findByText(/Workspace unavailable/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(aiChatApi.thread).not.toHaveBeenCalled();
  });
});

describe("AI workspace appearance", () => {
  it("shares the saved theme and keeps the current draft and confirmation when toggled", async () => {
    localStorage.setItem("massage-admin-theme", "light");
    vi.mocked(aiChatApi.thread).mockResolvedValue({
      ...thread,
      action: proposal,
    });
    show();
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to night theme" }),
    );
    expect(localStorage.getItem("massage-admin-theme")).toBe("dark");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Keep this draft",
    );
    expect(screen.getByText("Hello team")).toBeTruthy();
    expect(aiChatApi.message).not.toHaveBeenCalled();
    expect(aiChatApi.action).not.toHaveBeenCalled();
  });
  it("closes chat history after selecting a thread", async () => {
    show("/ai-chat");
    await screen.findByText("What would you like to work on?");
    fireEvent.click(screen.getByRole("button", { name: "Open chat history" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Team updates",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Found")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Team updates" })
        .getAttribute("aria-current"),
    ).toBe("true");
  });
  it("offers the same theme toggle on standalone sign-in", () => {
    render(<AiChatEntry user={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to day theme" }),
    );
    expect(localStorage.getItem("massage-admin-theme")).toBe("light");
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });
});

it("closes the history drawer after creating a chat", async () => {
  vi.mocked(aiChatApi.create).mockResolvedValue(thread);
  show("/ai-chat");
  await screen.findByText("What would you like to work on?");
  fireEvent.click(screen.getByRole("button", { name: "Open chat history" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "New chat",
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByRole("textbox")).toBeTruthy();
  expect(aiChatApi.create).toHaveBeenCalledTimes(1);
});
