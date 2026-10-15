import { esc } from "./core.js";
import { icon } from "./icons.js";
import {
  menuCommandCatalog,
  findMenuCommands,
  searchResultsMarkup,
} from "./command-search.js";

function mnemonic(label) {
  let html = "",
    text = "",
    key = null;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === "&" && i + 1 < label.length) {
      const letter = label[++i];
      if (letter === "&") {
        html += "&amp;";
        text += "&";
      } else {
        html += `<u>${esc(letter)}</u>`;
        text += letter;
        key ??= letter.toLowerCase();
      }
    } else {
      html += esc(label[i]);
      text += label[i];
    }
  }
  return { html, text, key };
}

// The popup owns keyboard input while it is open, independently of drawing shortcuts.
export function createMenus(
  root,
  definitions,
  commandState,
  run,
  onClose = () => {},
  options = {},
) {
  const names = Object.keys(definitions);
  root.innerHTML = names
    .map(
      (name) =>
        `<div class="menu-wrap"><button class="menu-trigger" aria-label="${esc(name)}" data-menu-key="${name[0].toLowerCase()}" aria-expanded="false"><span>${mnemonic(`&${name}`).html}</span></button><div class="menu-dropdown" hidden></div></div>`,
    )
    .join("");
  const triggers = [...root.querySelectorAll(".menu-trigger")];
  let openIndex = -1,
    previousFocus = null,
    trackingPointer = null;
  let submenus = [];

  function closeSubmenus(depth = 0) {
    for (const { button, popup } of submenus.splice(depth).reverse()) {
      popup.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  }
  function topPopup() {
    return openIndex < 0 ? null : triggers[openIndex].nextElementSibling;
  }
  function currentPopup() {
    return document.activeElement?.closest(".menu-dropdown") || topPopup();
  }
  function buttons(popup = currentPopup()) {
    return popup
      ? [
          ...popup.querySelectorAll(
            ":scope > button:not(:disabled), :scope > .menu-submenu-wrap > button:not(:disabled)",
          ),
        ]
      : [];
  }
  function submenu(button) {
    const popup = button?.nextElementSibling;
    return popup?.classList.contains("menu-submenu") ? popup : null;
  }
  function closeAfter(popup) {
    closeSubmenus(
      popup === topPopup()
        ? 0
        : submenus.findIndex((item) => item.popup === popup) + 1,
    );
  }
  function openSubmenu(button, focusFirst = false) {
    const popup = submenu(button);
    if (!popup || button.disabled) return;
    closeAfter(button.closest(".menu-dropdown"));
    submenus.push({ button, popup });
    popup.hidden = false;
    popup.style.top = "-3px";
    popup.classList.remove("opens-left");
    button.setAttribute("aria-expanded", "true");
    const box = popup.getBoundingClientRect();
    if (box.right > window.innerWidth) popup.classList.add("opens-left");
    if (box.bottom > window.innerHeight)
      popup.style.top = `${-3 - (box.bottom - window.innerHeight)}px`;
    if (focusFirst) buttons(popup)[0]?.focus({ preventScroll: true });
  }
  function markup(entries) {
    return entries
      .map((entry) => {
        if (!entry) return '<div class="menu-rule"></div>';
        const [label, action, defaultShortcut = "", title = "", children] =
            entry,
          shortcut =
            options.shortcut?.(action, defaultShortcut) ?? defaultShortcut,
          parts = mnemonic(label);
        const { enabled = true, checked = false } = commandState(action);
        const button = `<button data-action="${esc(action)}" data-mnemonic="${parts.key || ""}" ${title ? `title="${esc(title)}"` : ""} ${enabled ? "" : "disabled"} aria-checked="${checked}"${children ? ' aria-haspopup="menu" aria-expanded="false"' : ""}><span class="menu-check" aria-hidden="true">${checked ? icon("check", 12) : ""}</span><span class="menu-label">${parts.html}</span><span${children ? ' aria-hidden="true"' : ""}>${children ? "►" : esc(shortcut)}</span></button>`;
        return children
          ? `<div class="menu-submenu-wrap">${button}<div class="menu-dropdown menu-submenu" hidden>${markup(children)}</div></div>`
          : button;
      })
      .join("");
  }

  function close(restoreFocus = true) {
    if (openIndex < 0) return;
    closeSubmenus();
    const trigger = triggers[openIndex];
    trigger.nextElementSibling.hidden = true;
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    openIndex = -1;
    onClose();
    if (restoreFocus && previousFocus?.isConnected)
      previousFocus.focus({ preventScroll: true });
  }
  function open(index, focusFirst = false) {
    if (openIndex < 0) previousFocus = document.activeElement;
    close(false);
    openIndex = index;
    const trigger = triggers[index],
      popup = trigger.nextElementSibling;
    const definition = definitions[names[index]];
    const entries =
      typeof definition === "function" ? definition() : definition;
    popup.innerHTML = markup(entries);
    if (names[index] === "Help") {
      popup.insertAdjacentHTML(
        "afterbegin",
        '<div class="command-search"><label>Search commands<input type="search" class="command-search-input" aria-label="Search menu commands" placeholder="Type a command…" autocomplete="off" spellcheck="false"/></label><div class="command-search-results" aria-label="Matching menu commands"></div><p class="command-search-message" aria-live="polite">Type to find a menu command.</p></div><div class="menu-rule"></div>',
      );
      popup
        .querySelector(".command-search-input")
        .addEventListener("input", updateSearch);
    }
    popup.hidden = false;
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    popup.style.left = "0px";
    const box = popup.getBoundingClientRect();
    if (box.right > innerWidth - 4)
      popup.style.left = `${innerWidth - 4 - box.right}px`;
    if (names[index] === "Help")
      popup.querySelector("input").focus({ preventScroll: true });
    else if (focusFirst) buttons(popup)[0]?.focus({ preventScroll: true });
  }
  function updateSearch() {
    const popup = topPopup(),
      query = popup.querySelector(".command-search-input").value;
    const commands = findMenuCommands(
      menuCommandCatalog(definitions, options.shortcut, commandState),
      query,
    );
    popup.querySelector(".command-search-results").innerHTML =
      searchResultsMarkup(commands);
    popup.querySelector(".command-search-message").textContent = query.trim()
      ? commands.length
        ? `${commands.length} matching command${commands.length === 1 ? "" : "s"}. Enter runs the first available result; → shows its menu location.`
        : "No matching commands."
      : "Type to find a menu command.";
  }
  function revealCommand(action) {
    const command = menuCommandCatalog(
      definitions,
      options.shortcut,
      commandState,
    ).find((c) => c.action === action);
    if (!command) return;
    open(names.indexOf(command.path[0]));
    const item = [...topPopup().querySelectorAll("button[data-action]")].find(
      (b) => b.dataset.action === action,
    );
    const parents = [];
    for (
      let popup = item?.closest(".menu-submenu");
      popup;
      popup = popup.parentElement.closest(".menu-submenu")
    )
      parents.unshift(popup.previousElementSibling);
    for (const parent of parents) openSubmenu(parent);
    item?.classList.add("search-revealed");
    if (!item?.disabled) item?.focus({ preventScroll: true });
  }
  function activate(button) {
    if (!button || button.disabled) return;
    if (button.dataset.searchReveal)
      return revealCommand(button.dataset.searchReveal);
    if (button.dataset.searchAction) {
      const action = button.dataset.searchAction;
      close();
      Promise.resolve(run(action)).catch(() => {});
      return;
    }
    if (submenu(button)) return openSubmenu(button, true);
    const action = button.dataset.action;
    close();
    Promise.resolve(run(action)).catch(() => {});
  }
  triggers.forEach((trigger, index) => {
    trigger.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      openIndex === index ? close() : open(index);
      trackingPointer = event.pointerId;
    });
    trigger.addEventListener("pointerenter", () => {
      if (openIndex >= 0 && openIndex !== index) open(index);
    });
  });
  root.addEventListener("click", (event) => {
    event.stopPropagation();
    const result = event.target.closest(
      "[data-search-action], [data-search-reveal]",
    );
    if (result) {
      activate(result);
      return;
    }
    const trigger = event.target.closest(".menu-trigger");
    if (trigger) {
      // Keyboard activation has no preceding pointerdown.
      if (event.detail === 0) open(triggers.indexOf(trigger), true);
      return;
    }
    if (openIndex >= 0) activate(event.target.closest(".menu-dropdown button"));
  });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId !== trackingPointer) return;
    trackingPointer = null;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const item = target?.closest(".menu-dropdown button");
    if (item && root.contains(item)) activate(item);
    else if (target && !root.contains(target)) close();
  });
  window.addEventListener("pointercancel", () => {
    trackingPointer = null;
  });
  root.addEventListener("pointerover", (event) => {
    if (event.target.closest(".command-search")) return;
    const button = event.target.closest(".menu-dropdown button:not(:disabled)");
    if (button) {
      if (submenu(button)) openSubmenu(button);
      else closeAfter(button.closest(".menu-dropdown"));
    }
    button?.focus({ preventScroll: true });
  });
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!root.contains(event.target)) close();
    },
    true,
  );
  window.addEventListener("blur", () => close(false));
  window.addEventListener(
    "keydown",
    (event) => {
      if (document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      if (openIndex < 0) {
        const index =
          event.altKey && !event.ctrlKey
            ? names.findIndex((name) => name[0].toLowerCase() === key)
            : (options.isMenuKey ? options.isMenuKey(event) : key === "f10")
              ? 0
              : -1;
        if (index < 0) return;
        event.preventDefault();
        event.stopPropagation();
        open(index, true);
        return;
      }
      const search = topPopup().querySelector(".command-search-input");
      if (
        search &&
        (event.target === search ||
          event.target.closest(".command-search-results"))
      ) {
        event.stopPropagation();
        const results = [
          ...topPopup().querySelectorAll(".command-search-run:not(:disabled)"),
        ];
        const reveal = event.target.closest("[data-search-reveal]");
        if (
          key === "escape" ||
          (options.isMenuKey ? options.isMenuKey(event) : key === "f10")
        ) {
          event.preventDefault();
          close();
        } else if (key === "enter" && !reveal) {
          event.preventDefault();
          const result =
            event.target === search
              ? results[0]
              : event.target.closest(".command-search-run");
          result?.click();
        } else if (["arrowdown", "arrowup"].includes(key)) {
          event.preventDefault();
          if (!results.length) {
            buttons(topPopup())[0]?.focus({ preventScroll: true });
            return;
          }
          const at = results.indexOf(document.activeElement);
          if (key === "arrowup" && at <= 0)
            search.focus({ preventScroll: true });
          else
            results[
              (at + (key === "arrowdown" ? 1 : -1) + results.length) %
                results.length
            ]?.focus({ preventScroll: true });
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.altKey && !event.ctrlKey) {
        const index = names.findIndex((name) => name[0].toLowerCase() === key);
        if (index >= 0) {
          open(index, true);
          return;
        }
      }
      const list = buttons(),
        at = list.indexOf(document.activeElement);
      if ((key === "escape" || key === "arrowleft") && submenus.length) {
        const { button } = submenus.at(-1);
        closeSubmenus(submenus.length - 1);
        button.focus({ preventScroll: true });
      } else if (
        key === "escape" ||
        key === "tab" ||
        (options.isMenuKey ? options.isMenuKey(event) : key === "f10")
      )
        close();
      else if (key === "arrowright" && submenu(list[at]))
        openSubmenu(list[at], true);
      else if (
        (key === "arrowleft" || key === "arrowright") &&
        currentPopup() === topPopup()
      )
        open(
          (openIndex + names.length + (key === "arrowleft" ? -1 : 1)) %
            names.length,
          true,
        );
      else if (["arrowdown", "arrowup", "home", "end"].includes(key)) {
        const next =
          key === "home"
            ? 0
            : key === "end"
              ? list.length - 1
              : at < 0
                ? key === "arrowup"
                  ? list.length - 1
                  : 0
                : (at + (key === "arrowup" ? -1 : 1) + list.length) %
                  list.length;
        closeAfter(currentPopup());
        list[next]?.focus({ preventScroll: true });
      } else if (key === "enter" || key === " ") activate(list[at]);
      else if (key.length === 1 && !event.ctrlKey)
        activate(list.find((button) => button.dataset.mnemonic === key));
    },
    true,
  );
  return {
    close,
    openSearch() {
      const index = names.indexOf("Help");
      if (index >= 0) open(index, true);
    },
  };
}
