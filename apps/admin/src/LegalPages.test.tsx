// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PrivacyPolicy, TermsAndConditions } from "./LegalPages.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("public legal pages", () => {
  it("renders Privacy Policy without an authenticated session", () => {
    render(
      <MemoryRouter initialEntries={["/privacy-policy"]}>
        <Routes>
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("privacy-policy-page")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(document.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it("renders Terms and Conditions without an authenticated session", () => {
    render(
      <MemoryRouter initialEntries={["/terms-and-conditions"]}>
        <Routes>
          <Route
            path="/terms-and-conditions"
            element={<TermsAndConditions />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("terms-and-conditions-page")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(document.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it("matches page language to the saved interface language", () => {
    render(
      <MemoryRouter initialEntries={["/privacy-policy"]}>
        <Routes>
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "UA" }));
    expect(screen.getByTestId("privacy-policy-page").getAttribute("lang")).toBe(
      "uk",
    );
  });
});
