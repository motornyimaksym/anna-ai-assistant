// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./main.js";

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, _observer: (user: null) => void) => () =>
    undefined,
  onIdTokenChanged: (_auth: unknown, observer: (user: null) => void) => {
    observer(null);
    return () => undefined;
  },
}));
vi.mock("./auth.js", () => ({ auth: {} }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("public entry routes", () => {
  it("serves the FAQ with visible answers while authentication is unresolved", () => {
    render(
      <MemoryRouter initialEntries={["/faq"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(21);
    expect(document.getElementById("faq-booking")).toBeTruthy();
  });

  it("serves both policy pages while authentication is unresolved", async () => {
    const privacy = render(
      <MemoryRouter initialEntries={["/privacy-policy"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("privacy-policy-page")).toBeTruthy();

    privacy.unmount();
    render(
      <MemoryRouter initialEntries={["/terms-and-conditions"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("terms-and-conditions-page")).toBeTruthy();
  });
});
