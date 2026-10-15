// Help is temporary; command feedback remains the status bar's underlying text.
export function createStatusHelp(element, describe, root = document) {
  let message = element.textContent,
    hovered = null,
    focused = null,
    menuPointerFocus = false,
    pointerFocusTarget = null;
  const control = (target) =>
    target?.closest?.(
      "button[data-action],button[data-tool],button[data-window-action],button[data-document-tab]",
    ) || null;
  const render = () => {
    element.textContent = describe(hovered) || describe(focused) || message;
  };
  // Menus focus hovered entries. Capture the pointer target before that focus
  // change so leaving by mouse does not clear help for a keyboard-focused entry.
  root.addEventListener(
    "pointerover",
    (event) => {
      pointerFocusTarget = control(event.target);
    },
    true,
  );
  root.addEventListener("pointerover", (event) => {
    hovered = control(event.target);
    pointerFocusTarget = null;
    render();
  });
  root.addEventListener("pointerout", (event) => {
    const previous = control(event.target),
      next = control(event.relatedTarget);
    if (previous === next) return;
    if (focused === previous && menuPointerFocus) focused = null;
    hovered = next;
    render();
  });
  root.addEventListener("focusin", (event) => {
    focused = control(event.target);
    menuPointerFocus =
      focused === pointerFocusTarget && !!focused?.closest(".menu-dropdown");
    render();
  });
  root.addEventListener("focusout", (event) => {
    focused = control(event.relatedTarget);
    render();
  });
  root.addEventListener(
    "keydown",
    () => {
      menuPointerFocus = false;
    },
    true,
  );
  return {
    setMessage(value) {
      message = value;
      hovered = focused = null;
      render();
    },
    clearWithin(container) {
      if (container.contains(hovered)) hovered = null;
      if (container.contains(focused)) focused = null;
      render();
    },
  };
}
