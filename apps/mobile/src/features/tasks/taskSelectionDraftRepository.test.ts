import { describe, expect, it } from "vitest";
import { reconcileTaskSelectionDraft, taskSelectionDraftKey } from "./taskSelectionDraftRepository";

describe("task selection drafts", () => {
  it("scopes drafts to a user, challenge, and local day", () => {
    expect(taskSelectionDraftKey("user-1", "challenge-1", "2026-08-10"))
      .toBe("shipshape:task-selection-draft:v1:user-1:challenge-1:2026-08-10");
  });

  it("keeps only unique tasks that are still pending", () => {
    expect(reconcileTaskSelectionDraft(["task-1", "task-1", "task-2", "stale"], ["task-1", "task-2", "task-3"]))
      .toEqual(["task-1", "task-2"]);
  });
});
