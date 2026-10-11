// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React, { useState } from "react";

// Lightweight test component matching Studio toggle implementation
function TestProxyToggle() {
  const [proxyMode, setProxyMode] = useState(() => {
    try {
      return localStorage.getItem("vdo_proxy_mode") === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setProxyMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("vdo_proxy_mode", next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={proxyMode}
      data-testid="proxy-toggle"
      className={proxyMode ? "active" : "inactive"}
    >
      <span>Proxy</span>
    </button>
  );
}

describe("Proxy Toggle UI Component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders with proxy mode OFF by default", () => {
    render(<TestProxyToggle />);
    const btn = screen.getByTestId("proxy-toggle");
    expect(btn).toBeDefined();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.className).toBe("inactive");
  });

  it("toggles proxy mode ON when clicked and saves preference to localStorage", () => {
    render(<TestProxyToggle />);
    const btn = screen.getByTestId("proxy-toggle");
    
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toBe("active");
    expect(localStorage.getItem("vdo_proxy_mode")).toBe("1");
  });

  it("toggles back to OFF on second click", () => {
    render(<TestProxyToggle />);
    const btn = screen.getByTestId("proxy-toggle");
    
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.className).toBe("inactive");
    expect(localStorage.getItem("vdo_proxy_mode")).toBe("0");
  });

  it("initializes with ON state if user previously saved preference in localStorage", () => {
    localStorage.setItem("vdo_proxy_mode", "1");
    render(<TestProxyToggle />);
    const btn = screen.getByTestId("proxy-toggle");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.className).toBe("active");
  });
});
