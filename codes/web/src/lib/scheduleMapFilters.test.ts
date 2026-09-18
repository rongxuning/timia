import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultScheduleMapFilters,
  isDefaultMapFilters,
  isProjectFilterEnabled,
  setMapProject,
  setMapWorkspace,
  toggleMapStatus,
} from "./scheduleMapFilters.ts";

describe("toggleMapStatus", () => {
  it("adds a status that is not selected", () => {
    assert.deepEqual(toggleMapStatus(["todo", "doing"], "done"), ["todo", "doing", "done"]);
  });

  it("ignores clearing the last remaining status", () => {
    assert.deepEqual(toggleMapStatus(["todo"], "todo"), ["todo"]);
  });

  it("removes a status when more than one remain", () => {
    assert.deepEqual(toggleMapStatus(["todo", "doing"], "todo"), ["doing"]);
  });
});

describe("workspace / project cascade", () => {
  it("disables project when workspace is all", () => {
    const filters = defaultScheduleMapFilters();
    assert.equal(isProjectFilterEnabled(filters), false);
    const withProject = setMapProject(filters, "proj-1");
    assert.equal(withProject.projectId, null);
  });

  it("resets project when workspace changes", () => {
    const selected = setMapWorkspace(defaultScheduleMapFilters(), "ws-1");
    const withProject = setMapProject(selected, "proj-1");
    assert.equal(withProject.projectId, "proj-1");
    const cascaded = setMapWorkspace(withProject, "ws-2");
    assert.equal(cascaded.workspaceId, "ws-2");
    assert.equal(cascaded.projectId, null);
  });

  it("clears project when returning to all workspaces", () => {
    const selected = setMapProject(setMapWorkspace(defaultScheduleMapFilters(), "ws-1"), "proj-1");
    const all = setMapWorkspace(selected, null);
    assert.equal(all.workspaceId, null);
    assert.equal(all.projectId, null);
    assert.equal(isProjectFilterEnabled(all), false);
  });
});

describe("isDefaultMapFilters", () => {
  it("is true for todo+doing with no workspace", () => {
    assert.equal(isDefaultMapFilters(defaultScheduleMapFilters()), true);
  });

  it("is false when a workspace or extra status is set", () => {
    assert.equal(isDefaultMapFilters(setMapWorkspace(defaultScheduleMapFilters(), "ws-1")), false);
    assert.equal(
      isDefaultMapFilters({ ...defaultScheduleMapFilters(), statuses: ["todo", "doing", "done"] }),
      false,
    );
  });
});
