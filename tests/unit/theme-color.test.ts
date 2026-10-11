// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getThemeColor,
  setTheme,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  updateThemeColorMeta,
} from "@/lib/editor/theme";

describe("Theme-color meta management", () => {
  beforeEach(() => {
    // Reset document
    delete document.documentElement.dataset.theme;
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
  });

  it("returns appropriate theme colors for dark and light modes", () => {
    expect(getThemeColor("dark")).toBe(THEME_COLOR_DARK);
    expect(getThemeColor("light")).toBe(THEME_COLOR_LIGHT);
  });

  it("creates and updates <meta name=\"theme-color\"> on demand", () => {
    updateThemeColorMeta("dark");
    let meta = document.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute("content")).toBe(THEME_COLOR_DARK);

    updateThemeColorMeta("light");
    meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe(THEME_COLOR_LIGHT);
  });

  it("setTheme updates <meta name=\"theme-color\"> and dataset.theme", () => {
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    let meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe(THEME_COLOR_LIGHT);

    setTheme("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute("content")).toBe(THEME_COLOR_DARK);
  });
});
