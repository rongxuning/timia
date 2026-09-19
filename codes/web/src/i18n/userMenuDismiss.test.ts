import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldKeepUserMenuOpen } from "./userMenuDismiss.ts";

describe("shouldKeepUserMenuOpen", () => {
  it("keeps the menu open for clicks inside it", () => {
    assert.equal(shouldKeepUserMenuOpen({ insideMenu: true }), true);
  });

  it("closes the menu for clicks on ordinary page content", () => {
    assert.equal(shouldKeepUserMenuOpen({ insideMenu: false }), false);
  });

  it("keeps the menu open when the event target is a native select option", () => {
    assert.equal(
      shouldKeepUserMenuOpen({ insideMenu: false, closestSelect: true }),
      true,
    );
  });

  it("does not treat a missing target as inside the menu", () => {
    assert.equal(shouldKeepUserMenuOpen({ insideMenu: false, missingTarget: true }), false);
  });
});
