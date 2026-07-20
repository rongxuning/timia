type DismissibleLayer = {
  id: symbol;
  dismiss: () => void;
  disabled: () => boolean;
};

const layers: DismissibleLayer[] = [];

function handleKeyDown(event: KeyboardEvent) {
  if (
    event.key !== "Escape" ||
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat
  ) {
    return;
  }

  const topLayer = layers.at(-1);
  if (!topLayer) return;

  // Esc 始终由最上层消费；请求执行中只阻止继续关闭父层。
  event.preventDefault();
  event.stopPropagation();
  if (!topLayer.disabled()) topLayer.dismiss();
}

function syncDocumentListener() {
  if (typeof document === "undefined") return;
  document.removeEventListener("keydown", handleKeyDown);
  if (layers.length > 0) document.addEventListener("keydown", handleKeyDown);
}

export function registerDismissibleLayer(layer: DismissibleLayer) {
  layers.push(layer);
  syncDocumentListener();

  return () => {
    const index = layers.findIndex((candidate) => candidate.id === layer.id);
    if (index >= 0) layers.splice(index, 1);
    syncDocumentListener();
  };
}
