import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFileServicePath } from "./fileServicePath.ts";

describe("isFileServicePath", () => {
  it("routes item file lists with query strings to file-service", () => {
    assert.equal(
      isFileServicePath("/files?workspace_id=ws&binding_type=item&binding_id=item-1"),
      true,
    );
  });

  it("still matches exact /files and nested content paths", () => {
    assert.equal(isFileServicePath("/files"), true);
    assert.equal(isFileServicePath("/files/abc/content?variant=thumb"), true);
    assert.equal(isFileServicePath("/views/file-browser?workspace_id=ws"), true);
  });

  it("does not treat core-service paths as file-service", () => {
    assert.equal(isFileServicePath("/workspaces"), false);
    assert.equal(isFileServicePath("/views/schedule/calendar?day=1"), false);
  });
});
