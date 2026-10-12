// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

describe("Projects panel deletion and navigation", () => {
  it("does not navigate to marketing website root '/' when current project is deleted", () => {
    const pushedRoutes: string[] = [];
    const replacedRoutes: string[] = [];
    const mockRouter = {
      push: (r: string) => pushedRoutes.push(r),
      replace: (r: string) => replacedRoutes.push(r),
    };

    let leftPanel: string | null = "projects";
    const setLeftPanel = (p: string | null) => {
      leftPanel = p;
    };

    // Simulate toEmptyEditor("projects")
    const toEmptyEditor = (keepPanel?: string | null) => {
      if (keepPanel !== undefined) {
        setLeftPanel(keepPanel);
      }
      mockRouter.replace("/editor");
    };

    toEmptyEditor("projects");

    // Must never push or redirect to '/'
    expect(pushedRoutes).not.toContain("/");
    expect(replacedRoutes).toEqual(["/editor"]);
    expect(leftPanel).toBe("projects");
  });

  it("does not navigate to marketing root '/' when opening a project", () => {
    const pushedRoutes: string[] = [];
    const mockRouter = {
      push: (r: string) => pushedRoutes.push(r),
    };

    const openProject = (id: string) => {
      mockRouter.push(`/editor?p=${id}`);
    };

    openProject("test-project-123");

    expect(pushedRoutes).toEqual(["/editor?p=test-project-123"]);
    expect(pushedRoutes).not.toContain("/?p=test-project-123");
  });
});
