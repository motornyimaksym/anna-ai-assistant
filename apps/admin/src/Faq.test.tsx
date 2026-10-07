// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { publicApi } from "./public-api.js";
vi.mock("./public-api.js", () => ({ publicApi: { services: vi.fn() } }));
beforeEach(() => {
  vi.mocked(publicApi.services).mockReset().mockResolvedValue([]);
});

import { FaqPage } from "./Faq.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const rankedTopics = [
  "booking",
  "services",
  "prices",
  "location",
  "late",
  "premium",
  "payment",
  "out_of_scope",
  "boundaries",
  "orgasm",
  "learning",
  "clients",
  "reschedule",
  "prep",
  "outcall",
  "fourhands",
  "deposit",
  "couple",
  "discounts",
  "gift",
  "medical",
];
const visibleTopics = () =>
  screen
    .getAllByRole("article")
    .map((article) => article.id.replace("faq-", ""));

describe("public massage FAQ", () => {
  it("shows all answers immediately in the documented topic-frequency order", () => {
    render(<FaqPage />);
    expect(visibleTopics()).toEqual(rankedTopics);
    for (const article of screen.getAllByRole("article")) {
      const heading = article.querySelector("h2");
      const answer = article.querySelector("p");
      expect(heading?.id).toBe(article.getAttribute("aria-labelledby"));
      expect(answer).toBeTruthy();
      expect(getComputedStyle(answer!).display).not.toBe("none");
      expect(
        article.querySelector("[aria-expanded], [hidden], details"),
      ).toBeNull();
    }
  });

  it("switches the complete FAQ to English and remembers the choice", async () => {
    render(<FaqPage />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(localStorage.getItem("faq-locale")).toBe("en");
    const priorView = screen.getAllByRole("article")[0];
    expect(priorView).toBeTruthy();
    cleanup();
    render(<FaqPage />);
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(screen.getAllByRole("article")).toHaveLength(21);
    const bookingAnswer = within(
      document.getElementById("faq-booking")!,
    ).getByRole("link", { name: "tell me" });
    expect(bookingAnswer.getAttribute("href")).toBe(
      "http://t.me/Anna_lush_Massage",
    );
    expect(
      screen.getByRole("textbox", { name: "Search questions and answers" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Massage styles" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("link")
        .some(
          (link) =>
            link.getAttribute("href") ===
            "https://www.instagram.com/anna_lush_massage",
        ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Massage styles" }));
    expect(visibleTopics()).toEqual([
      "services",
      "premium",
      "learning",
      "fourhands",
      "couple",
    ]);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "training" },
    });
    expect(visibleTopics()).toEqual(["learning"]);
    expect(document.title).toContain("Massage in Lviv");
    fireEvent.click(screen.getByRole("button", { name: "Українська" }));
    await waitFor(() => expect(document.documentElement.lang).toBe("uk"));
    expect(localStorage.getItem("faq-locale")).toBe("uk");
  });

  it("links the booking phrase and premium first-visit invitation directly to Telegram", () => {
    render(<FaqPage />);
    const bookingAnswer = within(
      document.getElementById("faq-booking")!,
    ).getByRole("link", { name: "напишіть мені" });
    expect(bookingAnswer.getAttribute("href")).toBe(
      "http://t.me/Anna_lush_Massage",
    );
    expect(bookingAnswer.getAttribute("target")).toBe("_blank");
    const premium = document.getElementById("faq-premium")!;
    expect(premium).toBeTruthy();
    expect(document.getElementById("faq-body")).toBeNull();
    expect(document.getElementById("faq-spa")).toBeNull();
    const invitation = within(premium).getByRole("link");
    expect(invitation.getAttribute("href")).toBe(
      "http://t.me/Anna_lush_Massage",
    );
    expect(invitation.getAttribute("target")).toBe("_blank");
    expect(invitation.getAttribute("rel")).toBe("noreferrer");
    expect(document.querySelectorAll("#faq-contacts")).toHaveLength(1);
    expect(
      within(document.getElementById("faq-contacts")!).getAllByRole("link"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Формати" }));
    expect(visibleTopics()).toEqual([
      "services",
      "premium",
      "learning",
      "fourhands",
      "couple",
    ]);
    for (const value of ["білизні", "боді", "SPA"]) {
      fireEvent.change(screen.getByRole("textbox"), { target: { value } });
      expect(visibleTopics()).toEqual(["premium"]);
    }
  });

  it("preserves frequency order through category filtering and price-fact search", () => {
    render(<FaqPage />);
    fireEvent.click(screen.getByRole("button", { name: "Запис" }));
    expect(visibleTopics()).toEqual([
      "booking",
      "late",
      "payment",
      "reschedule",
      "deposit",
      "gift",
    ]);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "500" } });
    expect(visibleTopics()).toEqual(["payment", "deposit"]);
    fireEvent.click(screen.getByRole("button", { name: "Очистити пошук" }));
    expect(visibleTopics()).toEqual([
      "booking",
      "late",
      "payment",
      "reschedule",
      "deposit",
      "gift",
    ]);
  });

  it("follows the device theme by default and persists a manual theme choice", () => {
    let onChange: ((event: { matches: boolean }) => void) | undefined;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: (
          _name: string,
          listener: (event: { matches: boolean }) => void,
        ) => {
          onChange = listener;
        },
        removeEventListener: vi.fn(),
      })),
    );
    render(<FaqPage />);
    const page = document.querySelector(".massage-page")!;
    expect(page.getAttribute("data-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Увімкнути світлу тему" }),
    ).toBeTruthy();
    act(() => onChange?.({ matches: false }));
    expect(page.getAttribute("data-theme")).toBe("light");
    fireEvent.click(
      screen.getByRole("button", { name: "Увімкнути темну тему" }),
    );
    expect(page.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("faq-theme")).toBe("dark");
    expect(screen.getAllByRole("article")).toHaveLength(21);
  });

  it("links the contact action to the requested Instagram profile", () => {
    render(<FaqPage />);
    const externalLinks = screen
      .getAllByRole("link")
      .filter((link) =>
        link.getAttribute("href")?.startsWith("https://www.instagram.com/"),
      );
    expect(externalLinks).toHaveLength(2);
    expect(externalLinks[0]?.getAttribute("href")).toBe(
      "https://www.instagram.com/anna_lush_massage",
    );
  });
  it("includes the requested Telegram contact alongside Instagram", () => {
    render(<FaqPage />);
    const telegramLinks = screen
      .getAllByRole("link")
      .filter(
        (link) => link.getAttribute("href") === "http://t.me/Anna_lush_Massage",
      );
    expect(telegramLinks.length).toBeGreaterThan(1);
    for (const link of telegramLinks) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noreferrer");
    }
    expect(telegramLinks[0]?.getAttribute("target")).toBe("_blank");
    expect(telegramLinks[0]?.getAttribute("rel")).toBe("noreferrer");
  });
  it("loads all current duration and currency facts and makes them searchable", async () => {
    vi.mocked(publicApi.services).mockResolvedValue([
      {
        id: "test",
        name: "API service",
        durationMinutes: 90,
        price: 9999,
        currency: "EUR",
        durationOptions: [{ durationMinutes: 60, price: 1234.5 }],
      },
    ]);
    render(<FaqPage />);
    const prices = document.getElementById("faq-prices")!;
    await waitFor(() =>
      expect(within(prices).getAllByRole("listitem")).toHaveLength(2),
    );
    const rows = within(prices).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      `API service · 60 хв — ${new Intl.NumberFormat("uk-UA", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(1234.5)}`,
      `API service · 90 хв — ${new Intl.NumberFormat("uk-UA", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(9999)}`,
    ]);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "9999" },
    });
    // Locale grouping is part of the displayed price; service names are also searchable.
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "API service" },
    });
    expect(visibleTopics()).toEqual(["prices"]);
  });

  it("formats live price data in the selected language", async () => {
    vi.mocked(publicApi.services).mockResolvedValue([
      {
        id: "service",
        name: "Massage",
        durationMinutes: 60,
        price: 1500,
        currency: "UAH",
      },
    ]);
    render(<FaqPage />);
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    const prices = document.getElementById("faq-prices")!;
    await waitFor(() =>
      expect(within(prices).getAllByRole("listitem")).toHaveLength(1),
    );
    const expected = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "UAH",
      maximumFractionDigits: 2,
    }).format(1500);
    expect(within(prices).getByRole("listitem").textContent).toContain(
      `60 min — ${expected}`,
    );
  });

  it("shows loading and empty states without historical prices", async () => {
    let resolve!: (value: []) => void;
    vi.mocked(publicApi.services).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<FaqPage />);
    const prices = document.getElementById("faq-prices")!;
    expect(within(prices).getByRole("status")).toBeTruthy();
    expect(within(prices).queryByRole("list")).toBeNull();
    resolve([]);
    await waitFor(() => expect(within(prices).getByRole("alert")).toBeTruthy());
    expect(within(prices).queryByRole("list")).toBeNull();
  });

  it("directs failed price requests to the existing contacts without stale prices or retry controls", async () => {
    vi.mocked(publicApi.services).mockRejectedValueOnce(
      new Error("unavailable"),
    );
    render(<FaqPage />);
    const prices = document.getElementById("faq-prices")!;
    await waitFor(() => expect(within(prices).getByRole("alert")).toBeTruthy());
    expect(within(prices).queryByRole("list")).toBeNull();
    expect(within(prices).queryByRole("button")).toBeNull();
    const links = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(links).toContain("http://t.me/Anna_lush_Massage");
    expect(links).toContain("https://www.instagram.com/anna_lush_massage");
    expect(publicApi.services).toHaveBeenCalledTimes(1);
  });
});
