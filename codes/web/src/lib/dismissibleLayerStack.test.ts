import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

type EscapeEvent = {
  key: string;
  defaultPrevented: boolean;
  isComposing: boolean;
  repeat: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

type KeyHandler = (event: EscapeEvent) => void;

let keydownHandler: KeyHandler | null = null;
let registerDismissibleLayer: typeof import("./dismissibleLayerStack.ts").registerDismissibleLayer;
const unregisters: Array<() => void> = [];

before(async () => {
  const doc = {
    addEventListener(type: string, handler: KeyHandler) {
      if (type === "keydown") keydownHandler = handler;
    },
    removeEventListener(type: string) {
      if (type === "keydown") keydownHandler = null;
    },
  };
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
    writable: true,
  });
  ({ registerDismissibleLayer } = await import("./dismissibleLayerStack.ts"));
});

afterEach(() => {
  while (unregisters.length > 0) unregisters.pop()?.();
});

function register(layer: Parameters<typeof registerDismissibleLayer>[0]) {
  const unregister = registerDismissibleLayer(layer);
  unregisters.push(unregister);
  return unregister;
}

function pressEscape() {
  assert.ok(keydownHandler, "expected document keydown listener");
  const event: EscapeEvent = {
    key: "Escape",
    defaultPrevented: false,
    isComposing: false,
    repeat: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  keydownHandler(event);
  return event;
}

describe("dismissibleLayerStack", () => {
  it("dismisses only the top layer so nested overlays close before their parent", () => {
    const dismissed: string[] = [];
    const unregisterDrawer = register({
      id: Symbol("drawer"),
      dismiss: () => dismissed.push("drawer"),
      disabled: () => false,
    });
    const unregisterPreview = register({
      id: Symbol("preview"),
      dismiss: () => dismissed.push("preview"),
      disabled: () => false,
    });

    pressEscape();
    assert.deepEqual(dismissed, ["preview"]);

    unregisterPreview();
    pressEscape();
    assert.deepEqual(dismissed, ["preview", "drawer"]);

    unregisterDrawer();
  });
});
