// The portrait layout shares radio.js's audio, playlist, and saved choices.
import "./radio.js";

const tabs = [...document.querySelectorAll("[data-mobile-view]")];

function selectPanel(tab) {
    for (const item of tabs) {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    }
}

for (const tab of tabs) {
    tab.addEventListener("click", () => selectPanel(tab));
    tab.addEventListener("keydown", event => {
        const enabled = tabs.filter(item => !item.disabled), at = enabled.indexOf(tab);
        const next = { ArrowLeft: (at + enabled.length - 1) % enabled.length,
                       ArrowRight: (at + 1) % enabled.length, Home: 0, End: enabled.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault(); event.stopPropagation();
        selectPanel(enabled[next]); enabled[next].focus();
    });
}
