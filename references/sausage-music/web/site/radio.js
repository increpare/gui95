// ProcGen FM: the radio page. A self-propagating playlist of studio pieces
// and the game's island tracks, drawn from the generators and palettes that
// are switched on (web/site/station.js has the model); each track is
// generated as it comes on and played through the same wasm module and
// audio feed as the other pages. The votes (liked, and disliked with how far
// in) and the toggles live in localStorage.
// docs/superpowers/specs/2026-10-12-procgen-fm-design.md
//
// In the desktop app (web/electron/) the preload provides window.procgenFM:
// the page reports what is playing after each display render and mirrors the
// votes on each save, for the files the app writes for OBS, and takes the
// global keys as commands through its own handlers. In a browser it is
// absent and nothing here changes. docs/superpowers/specs/2026-10-12-procgen-fm-desktop-design.md
import createSausageMusic from "./sausage_music_web.mjs";
import { createAudio } from "./audio.js";
import { kStyles } from "./styles.js";
import { createTrackSnapshots } from "./track-snapshots.js";
import { generatorVersion } from "./build-info.js";
import { kVotesKey, readBrowserVotes, readVoteCollection, votesToJson } from "./vote-storage.js";
import { kGenerators, kPaletteChoices, normaliseSettings, drawTrack, trackLine, parseTrackLine,
         trackKey, sameTrack, trackTitle, trackTag, dialFrequency } from "./station.js";
import { asciiText } from "./radio-mobile-text.js";
import { createRadioMediaSession } from "./radio-media-session.js";

const kUpcoming = 12;         // preview kept ahead; more is drawn when scrolled into view
const kPreviewBatch = 12;
const kHistory = 60;          // played tracks kept in the list
const kRestartAfter = 3;      // seconds in, after which "previous" restarts the track
const kSettingsKey = "procgenfm.settings";

const shell = window.procgenFM ?? null;   // the desktop app's bridge, or nothing
const desktop = typeof shell?.windowAction === "function";
const mobile = document.body.dataset.layout === "mobile";
const displayText = text => mobile ? asciiText(text) : text;
document.body.classList.toggle("desktop", desktop);

const $ = (id) => document.getElementById(id);
const ui = {
    display: $("display"), led: $("led"), title: $("title"), sub: $("sub"),
    elapsed: $("elapsed"), bar: $("bar"), total: $("total"), scope: $("scope"),
    stop: $("stop"), prev: $("prev"), play: $("play"), playIcon: $("playIcon"), playLabel: $("playLabel"), next: $("next"), like: $("like"), dislike: $("dislike"), volume: $("volume"),
    generators: $("generators"), palettes: $("palettes"), playlist: $("playlist"), history: $("history"), likes: $("likes"), dislikes: $("dislikes"),
    copyVotes: $("copyVotes"), downloadVotes: $("downloadVotes"), importVotes: $("importVotes"), importBox: $("importBox"), addVotes: $("addVotes"),
    status: $("status"), moreTracks: $("moreTracks"),
};
const kPlayPath = "M7 4v16l14-8z", kPausePath = "M6 4h4v16H6zM14 4h4v16h-4z";
const kFlagOutline = "M3 1h11v1h-1v1h-1v1h-1v2h1v1h1v1h1v2H3z";
const kFlagCloth = "M4 2h8v1h-1v1h-1v2h1v1h1v2H4z";
const kFlagMarks = {
    kept: "M5 5h1v1h1V5h1V4h1V3h1v2H9v1H8v1H7v1H6V7H5z",
    rejected: "M5 3h1v1H5zm1 1h1v1H6zm1 1h1v1H7zm1 1h1v1H8zm1 1h1v1H9zM9 3h1v1H9zM8 4h1v1H8zM6 6h1v1H6zM5 7h1v1H5z",
};
function flag(kind) {
    const icon = document.createElement("span"); icon.className = `flag${kind ? ` ${kind}` : ""}`;
    if (!kind) { icon.setAttribute("aria-hidden", "true"); return icon; }
    icon.setAttribute("role", "img"); icon.setAttribute("aria-label", kind === "kept" ? "Kept" : "Rejected");
    icon.title = kind === "kept" ? "Kept" : "Rejected";
    if (mobile) { icon.textContent = kind === "kept" ? "\u{1f49a}" : "\u{274c}"; return icon; }
    icon.innerHTML = `<svg viewBox="0 0 14 16" aria-hidden="true"><path class="pole" d="M2 1h1v14H2zM0 15h5v1H0z"/><path fill="#000" d="${kFlagOutline}"/><path class="cloth" d="${kFlagCloth}"/><path class="mark" d="${kFlagMarks[kind]}"/></svg>`;
    return icon;
}
for (const [id, kind] of mobile ? [] : [["like", "kept"], ["dislike", "rejected"]]) {
    const icon = flag(kind); icon.setAttribute("aria-hidden", "true");
    ui[id].querySelector(".flag").replaceWith(icon);
}

// Desktop caption commands operate the host window. The browser preview uses
// the same frame within its viewport, and does not have access to OS windows.
const playerWindow = $("playerWindow"), windowBody = $("windowBody");
function applyWindowState(state) {
    if (!state) return;
    playerWindow.classList.toggle("maximized", state.maximized);
    playerWindow.classList.toggle("inactive", !state.focused);
    updateCaption();
}
function updateCaption() {
    const maximized = playerWindow.classList.contains("maximized");
    $("maximize").setAttribute("aria-label", maximized ? "Restore size" : "Maximize");
    $("maximize").title = maximized ? "Restore size" : "Maximize";
    for (const item of document.querySelectorAll('[data-window="maximize"], [data-window="move"], [data-window="size"]')) item.disabled = maximized;
    document.querySelector('[data-window="restore"]').disabled = !maximized && !playerWindow.hidden;
}
function setMinimized(minimized) {
    closeMenus();
    if (desktop) { shell.windowAction(minimized ? "minimize" : "restore").then(applyWindowState); return; }
    playerWindow.classList.toggle("minimized", minimized);
    playerWindow.hidden = minimized;
    windowBody.hidden = minimized;
    $("restorePlayer").hidden = !minimized;
    updateCaption();
}
function toggleMaximized() {
    closeMenus();
    if (desktop) { shell.windowAction("toggle-maximize").then(applyWindowState); return; }
    if (playerWindow.classList.contains("minimized")) { setMinimized(false); return; }
    playerWindow.classList.toggle("maximized");
    updateCaption();
}
let keyboardGesture = false;
function windowAction(action) {
    closeMenus();
    if (desktop) {
        if (action === "move" || action === "size") {
            keyboardGesture = true;
            shell.beginWindowGesture(action === "move" ? "move" : "se");
            setStatus("Arrow keys move or size; Enter accepts, Esc cancels.");
        } else shell.windowAction(action).then(applyWindowState);
    } else if (action === "minimize") setMinimized(true);
    else if (action === "maximize") { if (!playerWindow.classList.contains("maximized")) toggleMaximized(); }
    else if (action === "restore") { setMinimized(false); if (playerWindow.classList.contains("maximized")) toggleMaximized(); }
}
if (!mobile) {
    $("minimize").addEventListener("click", () => setMinimized(!windowBody.hidden));
    $("maximize").addEventListener("click", toggleMaximized);
    $("closeWindow").addEventListener("click", () => windowAction("close"));
    $("titlebar").addEventListener("dblclick", (e) => { if (!desktop && !e.target.closest("button, summary")) toggleMaximized(); });
    document.querySelector('.system-menu summary').addEventListener("dblclick", (e) => { if (desktop) { e.preventDefault(); windowAction("close"); } });
    $("restorePlayer").addEventListener("click", () => setMinimized(false));
    updateCaption();
    if (desktop) {
        shell.onWindowState(applyWindowState);
        shell.windowState().then(applyWindowState);
        for (const edge of document.querySelectorAll("[data-resize]")) {
            let pointer = null, pending = false;
            edge.addEventListener("pointerdown", (e) => {
                if (e.button !== 0) return;
                e.preventDefault(); pointer = e.pointerId;
                edge.setPointerCapture(pointer);
                shell.beginWindowGesture(edge.dataset.resize);
            });
            edge.addEventListener("pointermove", () => {
                if (pointer === null || pending) return;
                pending = true;
                requestAnimationFrame(() => { pending = false; if (pointer !== null) shell.updateWindowGesture(); });
            });
            const end = () => { if (pointer !== null) { shell.updateWindowGesture(); shell.endWindowGesture(); pointer = null; } };
            edge.addEventListener("pointerup", end);
            edge.addEventListener("lostpointercapture", end);
            edge.addEventListener("pointercancel", end);
        }
        document.addEventListener("keydown", (e) => {
            if (!keyboardGesture) return;
            const directions = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
            if (directions[e.key]) shell.stepWindowGesture(...directions[e.key]);
            else if (e.key === "Enter" || e.key === "Escape") { shell.endWindowGesture(e.key === "Escape"); keyboardGesture = false; setStatus(""); }
            else return;
            e.preventDefault(); e.stopImmediatePropagation();
        });
        window.addEventListener("blur", () => { keyboardGesture = false; });
    }
}

function selectView(view) {
    if (!["history", "likes", "dislikes"].includes(view)) return;
    for (const name of ["history", "likes", "dislikes"]) { ui[name].hidden = name !== view; $(name + "Panel").hidden = name !== view; }
    $("listLabel").textContent = ({ history: "History", likes: "Liked tracks", dislikes: "Disliked tracks" })[view];
    for (const item of document.querySelectorAll("[data-view]")) {
        const selected = item.dataset.view === view;
        item.setAttribute(item.role === "tab" ? "aria-selected" : "aria-pressed", String(selected));
        if (mobile) item.classList.toggle("active", selected);
        if (item.role === "tab") item.tabIndex = selected ? 0 : -1;
    }
    if (view === "history") renderHistory();
    refreshSelection();
}
document.querySelector(".library-tabs").addEventListener("click", (e) => {
    const item = e.target.closest("[data-view]");
    if (item) selectView(item.dataset.view);
});

document.querySelector(".library-tabs").addEventListener("keydown", e => {
    const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')];
    const at = tabs.indexOf(document.activeElement);
    const next = { ArrowLeft: (at + tabs.length - 1) % tabs.length, ArrowRight: (at + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault(); e.stopPropagation(); selectView(tabs[next].dataset.view); tabs[next].focus();
});

// Split bars divide views inside this application, rather than pretending
// each pane is a child window. Keyboard focus also permits fine adjustment.
for (const id of ["librarySplitter"]) {
    const bar = $(id);
    if (!bar) continue;
    const container = $("libraryPanes"), pane = $("incomingPane");
    const vertical = () => !matchMedia("(max-width: 520px)").matches;
    function resize(value) {
        const extent = vertical() ? container.clientWidth : container.clientHeight;
        const minimum = vertical() ? 150 : 45;
        const maximum = Math.max(minimum, extent - (vertical() ? 155 : 55));
        const size = Math.max(minimum, Math.min(maximum, value));
        container.style.setProperty(vertical() ? "--incoming-width" : "--incoming-height", `${size}px`);
        bar.setAttribute("aria-orientation", vertical() ? "vertical" : "horizontal");
        bar.setAttribute("aria-valuemin", String(minimum));
        bar.setAttribute("aria-valuenow", String(Math.round(size)));
        bar.setAttribute("aria-valuemax", String(Math.round(maximum)));
    }
    let drag = null;
    bar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); bar.focus(); bar.setPointerCapture(e.pointerId);
        drag = { origin: vertical() ? e.clientX : e.clientY, size: vertical() ? pane.clientWidth : pane.clientHeight };
    });
    bar.addEventListener("pointermove", (e) => { if (drag) resize(drag.size + (vertical() ? e.clientX : e.clientY) - drag.origin); });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) bar.addEventListener(name, () => { drag = null; });
    bar.addEventListener("keydown", (e) => {
        const delta = vertical() ? { ArrowLeft: -8, ArrowRight: 8 }[e.key] : { ArrowUp: -8, ArrowDown: 8 }[e.key];
        if (delta === undefined) return;
        e.preventDefault(); e.stopPropagation();
        resize((vertical() ? pane.clientWidth : pane.clientHeight) + delta);
    });
    new ResizeObserver(() => {
        bar.setAttribute("aria-orientation", vertical() ? "vertical" : "horizontal");
        bar.setAttribute("aria-valuemin", vertical() ? "150" : "45");
        bar.setAttribute("aria-valuemax", String(Math.max(vertical() ? 150 : 45, (vertical() ? container.clientWidth : container.clientHeight) - (vertical() ? 155 : 55))));
        bar.setAttribute("aria-valuenow", String(Math.round(vertical() ? pane.clientWidth : pane.clientHeight)));
    }).observe(pane);
}

const menus = [...document.querySelectorAll("details.menu")];
function closeMenus(except = null) { for (const menu of menus) if (menu !== except) menu.open = false; }
function openMenu(menu) {
    closeMenus(menu);
    menu.open = true;
    [...menu.querySelectorAll(".menu-popup button, .menu-popup a")]
        .find(item => !item.disabled && getComputedStyle(item).display !== "none")?.focus();
}
for (const menu of menus) {
    menu.addEventListener("toggle", () => { if (menu.open) closeMenus(menu); });
    menu.addEventListener("click", (e) => {
        const action = e.target.closest("button, a");
        if (!action) return;
        closeMenus();
        if (action.dataset.command) {
            const target = $(action.dataset.command);
            if (!target.disabled) target.click();
        } else if (action.dataset.window) windowAction(action.dataset.window);
        else if (action.dataset.view) selectView(action.dataset.view);
        else if (action.dataset.focusSplit) $(action.dataset.focusSplit).focus();
        else if (desktop && action.dataset.desktop) shell.desktopAction(action.dataset.desktop);
    });
    menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault(); closeMenus(); menu.querySelector("summary").focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!menu.open) { openMenu(menu); return; }
            const items = [...menu.querySelectorAll(".menu-popup button, .menu-popup a")].filter(item => !item.disabled && getComputedStyle(item).display !== "none");
            const at = items.indexOf(document.activeElement);
            items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
    });
}
document.addEventListener("click", (e) => { if (!e.target.closest("details.menu")) closeMenus(); });
document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]")) return;
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const menu = e.key === " " ? document.querySelector(".system-menu") :
        ({ f: $("fileMenu"), p: $("playbackMenu"), v: $("viewMenu"), o: $("optionsMenu"), h: $("helpMenu") })[e.key.toLowerCase()];
    if (menu) { e.preventDefault(); openMenu(menu); }
});

let m, audio, mediaSession, snapshots;
let modulesByName = new Map();
let settings = normaliseSettings(null);
let likes = [], dislikes = [];   // the votes: tracks, a dislike with `at`, the seconds in
let playlist = [];        // tracks: the played ones, the current, then the upcoming
let index = -1;           // the current track's place in playlist; -1 before the first
let selectedTrack = null, selectedList = "playlist";
let playing = false;      // a melody is loaded and running
let paused = false;
let seconds = 0;          // its length
let skips = 0;            // failed seeds skipped in a row
let scopeBytes = null;

const setStatus = (t) => { ui.status.textContent = displayText(t); };
const str = (p) => m.UTF8ToString(p);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

for (const button of document.querySelectorAll("[data-close-dialog]"))
    button.addEventListener("click", () => button.closest("dialog").close());
if (!mobile) $("settingsButton").addEventListener("click", () => ui.generators.querySelector('button:not(:disabled)[tabindex="0"]')?.focus());
$("allStyles").addEventListener("click", () => changeSettings({ ...settings, generators: availableGenerators() }));
$("helpButton").addEventListener("click", async () => {
    $("helpContent").textContent = mobile ?
        "Tap Play to start or pause. Tap a track to play it.\n\nKeep saves the playing track. Reject records it and plays the next one.\n\nQueue: upcoming tracks.\nSaved: liked, rejected, and recently played tracks.\nSettings: styles, sounds, and volume. Changes apply to upcoming tracks.\n\nYour choices are saved in this browser. Use the menu to export or import flags." : desktop ? await shell.desktopAction("help") :
        "Space: Play / Pause\nLeft: Previous\nRight: Next\nK: Keep selected track\nR: Reject selected track\n\nTrack lists: click to select; double-click or Enter to play.\nUp / Down: select a track\nKeep or Reject again: clear that flag\n\nAlt+F: File\nAlt+P: Playback\nAlt+V: View\nAlt+O: Options\nAlt+H: Help";
    $("helpDialog").showModal();
});
$("importDialog").addEventListener("close", () => $("fileMenu").querySelector("summary").focus());
$("helpDialog").addEventListener("close", () => (mobile ? $("fileMenu") : $("helpMenu")).querySelector("summary").focus());

// --- Storage -----------------------------------------------------------------------

async function load() {
    try { settings = normaliseSettings(JSON.parse(localStorage.getItem(kSettingsKey))); } catch { settings = normaliseSettings(null); }
    let restored = null;
    if (typeof shell?.loadVotes === "function") {
        const saved = await shell.loadVotes();
        if (saved !== null) restored = readVoteCollection(saved);
    }
    if (restored === null) {
        let storage;
        try { storage = window.localStorage; storage.getItem(kVotesKey); }
        catch { storage = null; /* private mode: the session still works */ }
        restored = storage ? readBrowserVotes(storage) : { likes: [], dislikes: [], bad: [] };
    }
    if (restored.bad.length) throw new Error("Saved track choices could not be read; the original collection has been left intact.");
    ({ likes, dislikes } = restored);
}
function saveSettings() { try { localStorage.setItem(kSettingsKey, JSON.stringify(settings)); } catch { /* private mode: the session keeps them */ } }
async function saveVotes() {
    for (const track of [...likes, ...dislikes]) snapshots.prepare(track);
    const text = votesToJson({ likes, dislikes });
    try { localStorage.setItem(kVotesKey, text); }
    catch { if (!shell) setStatus("Track choices could not be saved in this browser."); }
    await shell?.votes(text);
}

// --- The playlist -----------------------------------------------------------------

// Keep kUpcoming tracks drawn ahead of the current one.
function fill() {
    while (playlist.length - index - 1 < kUpcoming) playlist.push(drawTrack(settings));
}

function loadMore() {
    if (!audio) return;
    for (let i = 0; i < kPreviewBatch; i++) {
        const track = drawTrack(settings), at = playlist.length;
        playlist.push(track);
        ui.playlist.appendChild(row({ list: "playlist", n: mobile ? "" : "·", track, upcoming: true, onPlay: () => playAt(at) }));
    }
    updateQueueCount();
}
ui.moreTracks.addEventListener("click", () => { ui.moreTracks.blur(); loadMore(); });
let previewLoadPending = false;
ui.playlist.addEventListener("scroll", () => {
    if (!audio || previewLoadPending || ui.playlist.clientHeight === 0 ||
        ui.playlist.scrollTop + ui.playlist.clientHeight < ui.playlist.scrollHeight - 45) return;
    previewLoadPending = true;
    requestAnimationFrame(() => {
        previewLoadPending = false;
        if (ui.playlist.scrollTop + ui.playlist.clientHeight >= ui.playlist.scrollHeight - 45) loadMore();
    });
});

// The toggles changed: what has not played yet is drawn again from the new set.
function redraw() {
    playlist = playlist.slice(0, index + 1);
    fill();
    renderPlaylist();
}

// Generate the track and start it. A failed seed is marked and skipped.
async function playAt(i) {
    await audio.start();
    audio.clearQueue();
    if (paused) { paused = false; }
    index = i;
    fill();
    // Jumping far ahead in the stream skips previews, not the listening
    // history. Retain only visited tracks behind the selected track.
    const past = playlist.slice(0, index).filter(track => track.visited).slice(-kHistory);
    playlist = [...past, ...playlist.slice(index)];
    index = past.length;
    const track = playlist[index];
    const t0 = performance.now();
    let ok;
    snapshots.apply(track);
    if (track.kind === "ost") {
        ok = m._web_generate(track.seed | 0) === 1;
        track.detail = "the game's own track, through the original synth";
    } else {
        ok = m._web_lab_generate(track.state.tune | 0, track.state.moduleIndex) === 1;
        const description = ok ? str(m._web_lab_description()) : "";
        track.detail = description;
    }
    m._web_play();
    playing = ok;
    readTiming();
    track.seconds = ok ? seconds : 0;
    track.failed = !ok;
    track.visited = true;
    selectedTrack = track; selectedList = "playlist";
    track.ms = performance.now() - t0;
    try { history.replaceState(null, "", `#${encodeURIComponent(trackLine(track))}`); } catch { /* file: urls */ }
    renderDisplay();
    renderPlaylist();
    renderGrid();
    if (!ok) {
        skips++;
        setStatus(`"${trackTitle(track)}": the generator was silent on this seed; skipping.`);
        if (skips < 6) return next();
        setStatus("Six silent seeds in a row; press next.");
        return;
    }
    skips = 0;
    audio.beginTrack(seconds);
    setStatus("");
}

function next() { return playAt(index + 1); }

function prev() {
    if (index < 0) return next();
    if (elapsed() > kRestartAfter || index === 0) return playAt(index);
    return playAt(index - 1);
}

// A track from a saved list: put it next and play it.
function playTrack(track) {
    playlist.splice(index + 1, 0, track);
    return playAt(index + 1);
}

function playSelection() {
    if (!selectedTrack) return;
    const i = playlist.indexOf(selectedTrack);
    return i >= 0 ? playAt(i) : playTrack({ ...selectedTrack });
}

async function togglePlay(useSelection = false) {
    if (useSelection && selectedTrack && selectedTrack !== playlist[index]) return playSelection();
    if (index < 0) return next();
    const ctx = audio.context();
    if (paused) {
        paused = false;
        await audio.start();
    } else if (!playing) {
        return playAt(index);
    } else {
        paused = true;
        if (ctx) await ctx.suspend();
    }
    renderDisplay();
}

async function stop() {
    playing = false; paused = false;
    m._web_stop();
    audio.clearQueue();
    const ctx = audio.context();
    if (ctx) await ctx.suspend();
    ui.elapsed.textContent = "0:00"; ui.bar.style.width = "0%";
    ui.bar.parentElement.setAttribute("aria-valuenow", "0");
    renderDisplay();
}

// Advance only after the last scheduled audio buffer has actually played.
function onPump() {
    if (!playing || paused) return;
    mediaSession?.updatePosition(elapsed(), seconds);
    if (audio.ended()) { playing = false; next(); }
}

function readTiming() {
    const n = m._web_melody_count();
    seconds = 0;
    if (n === 0) return;
    const d = m._web_melody_durations() / 4;
    const durations = m.HEAPF32.slice(d, d + n);
    for (let i = 0; i < n; i++) seconds += durations[i];
}

function elapsed() {
    return playing ? audio.elapsed() : 0;
}

// --- Votes -------------------------------------------------------------------------

const isLiked = (track) => likes.some((t) => sameTrack(t, track));
const isDisliked = (track) => dislikes.some((t) => sameTrack(t, track));
const without = (list, track) => list.filter((t) => !sameTrack(t, track));

function renderVotes() {
    const focused = document.activeElement.closest?.(".track-row") ? selectedList : null;
    saveVotes().catch(e => setStatus(`Track choices could not be saved: ${e.message}`));
    renderLikes(); renderPlaylist(false); refreshSelection(); renderGrid(); renderDisplay();
    if (focused) ui[selectedList].querySelector('.track-row[aria-selected="true"]')?.focus();
}

function flagTarget() { return mobile ? playlist[index] : (selectedTrack ?? playlist[index]); }
function keepSelection() { like(flagTarget()); }
function rejectSelection() {
    const track = flagTarget();
    if (!track) return;
    if (isDisliked(track)) return undislike(track);
    const i = sameTrack(track, playlist[index]) ? index : playlist.indexOf(track);
    return dislike(track, i);
}

// Green flag: keep the track; choosing Keep again clears the flag.
function like(track) {
    if (!track) return;
    if (isLiked(track)) likes = without(likes, track);
    else { likes.push({ ...track }); dislikes = without(dislikes, track); }
    renderVotes();
}

// Red flag on the current track: it stops now, leaves the playlist, and is
// recorded with how far in it got; the next one plays. On another row: the
// same record, without the stop.
function dislike(track, i = -1) {
    if (!track) return;
    const current = i === index;
    const at = current ? Math.round(elapsed()) : (track.at ?? null);
    likes = without(likes, track);
    if (!isDisliked(track)) dislikes.push({ ...track, at });
    if (i >= 0) {
        playlist.splice(i, 1);
        if (i < index) index--;
    }
    if (current) {
        m._web_stop();
        playing = false;
        setStatus(`"${trackTitle(track)}" rejected at ${clock(at)}.`);
        renderVotes();
        return playAt(index);   // the next track has moved into this slot
    }
    renderVotes();
}

function undislike(track) { dislikes = without(dislikes, track); renderVotes(); }

async function copyVotes() {
    if (!likes.length && !dislikes.length) return setStatus("No flags set.");
    const text = votesToJson({ likes, dislikes });
    try { await navigator.clipboard.writeText(text); setStatus(`Copied ${likes.length} kept and ${dislikes.length} rejected tracks.`); }
    catch { ui.importBox.value = text; $("importDialog").showModal(); ui.importBox.select(); setStatus("Select the text to copy it."); }
}

function downloadVotes() {
    if (!likes.length && !dislikes.length) return setStatus("No flags set.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([votesToJson({ likes, dislikes })], { type: "application/json" }));
    a.download = "procgen-fm-votes.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function addVotes() {
    const v = readVoteCollection(ui.importBox.value);
    let added = 0;
    for (const t of v.likes) if (!isLiked(t)) { likes.push(t); dislikes = without(dislikes, t); added++; }
    for (const t of v.dislikes) if (!isDisliked(t)) { dislikes.push(t); likes = without(likes, t); added++; }
    renderVotes();
    ui.importBox.value = v.bad.join("\n");
    if (!v.bad.length) $("importDialog").close();
    const known = v.likes.length + v.dislikes.length - added;
    const message = `Added ${added} flag${added === 1 ? "" : "s"}${known ? `, ${known} already there` : ""}${v.bad.length ? "; unreadable entries left in the box" : "."}`;
    setStatus(message);
    $("importStatus").textContent = v.bad.length ? message : "";
}

// --- Rendering ---------------------------------------------------------------------

function renderDisplay() {
    const track = index >= 0 ? playlist[index] : null;
    ui.display.classList.toggle("off", !track || paused);
    if (!track) {
        ui.title.textContent = "No track selected"; ui.sub.textContent = "";
        ui.led.textContent = "Stopped";
        ui.elapsed.textContent = ui.total.textContent = "0:00"; ui.bar.style.width = "0%";
        ui.bar.parentElement.setAttribute("aria-valuenow", "0");
    } else {
        ui.title.textContent = displayText(trackTitle(track));
        ui.sub.textContent = displayText(trackTag(track));
        ui.led.textContent = paused ? "Paused" : (playing ? "Playing" : "Stopped");
        ui.total.textContent = clock(seconds);
    }
    const pauseAction = playing && !paused;
    ui.playIcon?.firstElementChild.setAttribute("d", pauseAction ? kPausePath : kPlayPath);
    ui.playLabel.textContent = pauseAction ? "Pause" : "Play";
    ui.play.title = `${pauseAction ? "Pause" : "Play"} (Space)`;
    if (mobile) {
        ui.led.classList.toggle("text-bg-success", playing && !paused);
        ui.led.classList.toggle("text-bg-warning", paused);
        ui.led.classList.toggle("text-bg-secondary", !playing && !paused);
    }
    ui.stop.disabled = !playing;
    renderFlagControls();
    for (const item of document.querySelectorAll("[data-command]")) item.disabled = $(item.dataset.command).disabled;
    const state = playing ? (paused ? "paused" : "playing") : "none";
    mediaSession?.update({ title: track ? displayText(trackTitle(track)) : "", tag: track ? displayText(trackTag(track)) : "",
                          state, duration: seconds, position: elapsed() });
    report();
}

function renderFlagControls() {
    const track = flagTarget();
    const kept = !!track && isLiked(track), rejected = !!track && isDisliked(track);
    ui.like.classList.toggle("on", kept); ui.dislike.classList.toggle("on", rejected);
    if (mobile) { ui.like.classList.toggle("active", kept); ui.dislike.classList.toggle("active", rejected); }
    ui.like.setAttribute("aria-pressed", String(kept)); ui.dislike.setAttribute("aria-pressed", String(rejected));
    ui.like.title = kept ? "Clear green flag (K)" : "Keep selected track (K)";
    ui.dislike.title = rejected ? "Clear red flag (R)" : "Reject selected track (R)";
    ui.like.disabled = ui.dislike.disabled = !audio || !track;
    for (const id of ["like", "dislike"]) {
        const command = document.querySelector(`[data-command="${id}"]`);
        if (command) command.disabled = ui[id].disabled;
    }
}

// To the desktop app, when this page runs in it: the track and its state, for
// the now-playing files. Each change, not each second: a reader runs the
// clock on from elapsed and the time of writing.
function report() {
    if (!shell) return;
    const track = index >= 0 ? playlist[index] : null;
    if (!track) return shell.nowPlaying({ state: "standby" });
    shell.nowPlaying({
        state: paused ? "paused" : (playing ? "playing" : "silent"),
        title: trackTitle(track), tag: trackTag(track), detail: track.detail ?? "", line: trackLine(track), frequency: dialFrequency(track),
        elapsed: elapsed(), seconds, liked: isLiked(track), disliked: isDisliked(track),
    });
}

function renderTime() {
    if (!playing) return;
    const t = elapsed();
    const progress = seconds > 0 ? Math.min(100, t / seconds * 100) : 0;
    ui.elapsed.textContent = clock(t);
    ui.bar.style.width = `${progress}%`;
    ui.bar.parentElement.setAttribute("aria-valuenow", String(Math.round(progress)));
    mediaSession?.updatePosition(t, seconds);
}

function renderScope() {
    const g = ui.scope.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(ui.scope.clientWidth * dpr), h = Math.round(ui.scope.clientHeight * dpr);
    if (!w || !h) return;
    if (ui.scope.width !== w || ui.scope.height !== h) { ui.scope.width = w; ui.scope.height = h; }
    g.clearRect(0, 0, w, h);
    const tap = audio.analyser();
    const bars = 40, gap = 2 * dpr, bw = (w - gap * (bars - 1)) / bars;
    if (tap) {
        if (!scopeBytes || scopeBytes.length !== tap.frequencyBinCount) scopeBytes = new Uint8Array(tap.frequencyBinCount);
        tap.getByteFrequencyData(scopeBytes);
    }
    const live = tap && playing && !paused;
    const bins = scopeBytes ? scopeBytes.length : 0;
    for (let i = 0; i < bars; i++) {
        // Log-spaced bands from about 60 Hz to 12 kHz over the 24 kHz spectrum.
        const lo = Math.floor(Math.pow(2, (i / bars) * 7.6) * 1.3), hi = Math.max(lo + 1, Math.floor(Math.pow(2, ((i + 1) / bars) * 7.6) * 1.3));
        let peak = 0;
        if (live) for (let b = lo; b < hi && b < bins; b++) peak = Math.max(peak, scopeBytes[b]);
        const level = live ? peak / 255 : 0;
        const segs = 8, segH = h / segs;
        for (let s = 0; s < segs; s++) {
            const on = level * segs > s + 0.5;
            g.fillStyle = on ? "#00c000" : "#002000";
            g.fillRect(i * (bw + gap), h - (s + 1) * segH + gap / 2, bw, segH - gap);
        }
    }
}

let nextScopeFrame = 0;
function frame(time = 0) {
    if (!windowBody.hidden) {
        renderTime();
        if (!mobile || time >= nextScopeFrame) { renderScope(); nextScopeFrame = time + 1000 / 24; }
    }
    requestAnimationFrame(frame);
}

// List selection: flags are status icons, and commands operate
// on the selected track. Double-click/Enter plays it; arrows only navigate.
function refreshSelection() {
    const names = ["playlist", "history", "likes", "dislikes"];
    const selectedRows = ui[selectedList]?.hidden ? [] : [...ui[selectedList].querySelectorAll(".track-row")];
    if (!selectedRows.some(el => el.track === selectedTrack)) {
        const rows = [...ui.playlist.querySelectorAll(".track-row")];
        selectedTrack = rows.find(el => el.track === playlist[index])?.track ?? rows[0]?.track ?? null;
        selectedList = "playlist";
    }
    for (const name of names) {
        const rows = [...ui[name].querySelectorAll(".track-row")];
        const selected = name === selectedList ? rows.find(el => el.track === selectedTrack) : null;
        for (const el of rows) {
            el.classList.toggle("selected", el === selected);
            if (mobile) el.classList.toggle("active", el === selected);
            el.setAttribute("aria-selected", String(el === selected));
            el.tabIndex = el === (selected ?? rows[0]) ? 0 : -1;
        }
    }
    renderFlagControls();
}

function row({ list, n, track, current = false, upcoming = false, onPlay }) {
    const li = document.createElement("li");
    li.className = (mobile ? "track-row list-group-item list-group-item-action d-flex align-items-center gap-2" : "row track-row") + (current ? " current" : "") + (upcoming ? " upcoming" : "") + (track.failed ? " failed" : "");
    li.track = track; li.title = displayText(trackLine(track)); li.tabIndex = -1;
    li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
    const num = document.createElement("span"); num.className = mobile ? "n small text-body-secondary" : "n"; num.textContent = n;
    const b = document.createElement("span"); b.className = mobile ? "t d-flex flex-column flex-grow-1" : "t";
    const t1 = document.createElement("span"); t1.className = mobile ? "ttl2 fw-semibold text-truncate" : "ttl2"; t1.textContent = displayText(trackTitle(track));
    const t2 = document.createElement("span"); t2.className = mobile ? "tag small text-body-secondary text-truncate" : "tag"; t2.textContent = displayText(trackTag(track) + (Number.isFinite(track.at) && isDisliked(track) ? ` · at ${clock(track.at)}` : ""));
    b.append(t1, t2);
    const select = () => { selectedTrack = track; selectedList = list; refreshSelection(); };
    li.addEventListener("focus", select);
    li.addEventListener("click", () => { select(); li.focus({ preventScroll: true }); if (mobile) onPlay(); });
    if (!mobile) li.addEventListener("dblclick", () => onPlay());
    li.addEventListener("keydown", (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const rows = [...li.parentElement.querySelectorAll(".track-row")], at = rows.indexOf(li);
        const target = ({ ArrowUp: Math.max(0, at - 1), ArrowDown: Math.min(rows.length - 1, at + 1), Home: 0, End: rows.length - 1 })[e.key];
        if (target !== undefined) {
            e.preventDefault(); e.stopPropagation(); rows[target].focus({ preventScroll: true });
            const next = rows[target], listEl = li.parentElement;
            if (next.offsetTop < listEl.scrollTop) listEl.scrollTop = next.offsetTop;
            else if (next.offsetTop + next.offsetHeight > listEl.scrollTop + listEl.clientHeight)
                listEl.scrollTop = next.offsetTop + next.offsetHeight - listEl.clientHeight;
        } else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onPlay(); }
        else if (e.key === " ") { e.preventDefault(); e.stopPropagation(); select(); }
    });
    const len = document.createElement("span"); len.className = mobile ? "len small text-body-secondary" : "len"; len.textContent = track.seconds ? clock(track.seconds) : "";
    li.append(num, flag(isLiked(track) ? "kept" : isDisliked(track) ? "rejected" : null), b, len);
    return li;
}

function renderPlaylist(followCurrent = true) {
    const scrollTop = ui.playlist.scrollTop;
    ui.playlist.innerHTML = "";
    playlist.forEach((track, i) => {
        if (i < index) return;
        ui.playlist.appendChild(row({
            list: "playlist", n: mobile ? (i === index ? ">" : "") : (i === index ? "▶" : "·"), track, current: i === index, upcoming: i > index,
            onPlay: () => playAt(i),
        }));
    });
    ui.moreTracks.disabled = !audio;
    updateQueueCount();
    ui.playlist.scrollTop = followCurrent ? 0 : scrollTop;
    const current = ui.playlist.querySelector(".current");
    if (followCurrent && current) {
        // Scroll the list itself; scrollIntoView also moves the whole page
        // when the transport is above the playlist on a small screen.
        if (current.offsetTop < ui.playlist.scrollTop) ui.playlist.scrollTop = current.offsetTop;
        else if (current.offsetTop + current.offsetHeight > ui.playlist.scrollTop + ui.playlist.clientHeight)
            ui.playlist.scrollTop = current.offsetTop + current.offsetHeight - ui.playlist.clientHeight;
    }
    renderHistory(followCurrent);
    refreshSelection();
}

function updateQueueCount() { $("queueCount").textContent = `${ui.playlist.querySelectorAll(".track-row").length} loaded`; }

function renderHistory(followCurrent = false) {
    const scrollTop = ui.history.scrollTop;
    ui.history.innerHTML = "";
    playlist.forEach((track, i) => {
        if (i >= index || !track.visited) return;
        ui.history.appendChild(row({ list: "history", n: String(i + 1), track, onPlay: () => playAt(i) }));
    });
    if (!ui.history.children.length) {
        const empty = document.createElement("li"); empty.className = mobile ? "empty list-group-item text-body-secondary" : "empty"; empty.textContent = "No played tracks";
        ui.history.append(empty);
    } else ui.history.scrollTop = followCurrent ? ui.history.scrollHeight : scrollTop;
}

function renderLikes() {
    const keptScroll = ui.likes.scrollTop, rejectedScroll = ui.dislikes.scrollTop;
    ui.likes.innerHTML = "";
    if (!likes.length) { const e = document.createElement("li"); e.className = mobile ? "empty list-group-item text-body-secondary" : "empty"; e.textContent = "No liked tracks"; ui.likes.appendChild(e); }
    likes.forEach((track, i) => {
        ui.likes.appendChild(row({ list: "likes", n: String(i + 1), track, onPlay: () => playTrack({ ...track }) }));
    });
    ui.dislikes.innerHTML = "";
    if (!dislikes.length) { const e = document.createElement("li"); e.className = mobile ? "empty list-group-item text-body-secondary" : "empty"; e.textContent = "No disliked tracks"; ui.dislikes.appendChild(e); }
    dislikes.forEach((track, i) => {
        ui.dislikes.appendChild(row({ list: "dislikes", n: String(i + 1), track, onPlay: () => playTrack({ ...track }) }));
    });
    ui.likes.scrollTop = keptScroll; ui.dislikes.scrollTop = rejectedScroll;
}

const availableGenerators = () => [...ui.generators.querySelectorAll('button:not([data-missing])')].map(button => button.dataset.id);

function renderGrid() {
    for (const group of ["generators", "palettes"]) {
        for (const button of ui[group].querySelectorAll("button")) {
            const on = settings[group].includes(button.dataset.id);
            button.setAttribute("aria-pressed", String(on));
            if (mobile) button.classList.toggle("active", on);
            button.disabled = !audio || button.hasAttribute("data-missing");
        }
    }
}

function changeSettings(next) {
    settings = normaliseSettings(next);
    saveSettings(); renderGrid(); redraw();
}

function buildGrid() {
    for (const [group, choices] of [["generators", kGenerators], ["palettes", kPaletteChoices]]) {
        for (const choice of choices) {
            const button = document.createElement("button");
            if (mobile) button.className = "btn btn-outline-primary";
            button.type = "button"; button.dataset.id = choice.id;
            button.textContent = displayText(choice.name); button.disabled = true;
            button.tabIndex = ui[group].children.length === 0 ? 0 : -1;
            button.setAttribute("aria-pressed", String(settings[group].includes(choice.id)));
            button.title = displayText(`${choice.name}${choice.blurb ? ": " + choice.blurb : ""}\nClick to toggle. Shift+click to select only this ${group === "generators" ? "style" : "sound"}.`);
            button.addEventListener("focus", () => {
                for (const peer of ui[group].children) peer.tabIndex = peer === button ? 0 : -1;
            });
            button.addEventListener("click", e => {
                const current = settings[group];
                if (!e.shiftKey && current.length === 1 && current.includes(choice.id)) {
                    setStatus(`At least one ${group === "generators" ? "style" : "sound"} must stay selected.`); return;
                }
                const selected = e.shiftKey ? [choice.id] : current.includes(choice.id) ? current.filter(id => id !== choice.id) : [...current, choice.id];
                changeSettings({ ...settings, [group]: selected }); setStatus("Ready");
            });
            ui[group].append(button);
        }
        ui[group].addEventListener("keydown", e => {
            const buttons = [...ui[group].querySelectorAll("button")];
            const at = buttons.indexOf(document.activeElement);
            if (at < 0) return;
            const columns = getComputedStyle(ui[group]).gridTemplateColumns.split(" ").length;
            const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns, Home: -at, End: buttons.length - 1 - at }[e.key];
            if (delta === undefined) return;
            e.preventDefault(); e.stopPropagation();
            let target = Math.max(0, Math.min(buttons.length - 1, at + delta));
            const step = delta < 0 ? -1 : 1;
            while (buttons[target]?.disabled) target += step;
            buttons[target]?.focus();
        });
    }
}

// A style whose module this build lacks is switched off and greyed out.
function disableMissing() {
    const missing = new Set();
    for (const s of kStyles) {
        const names = Array.isArray(s.module) ? s.module : [s.module];
        if (!names.every((n) => modulesByName.has(n.toLowerCase()))) missing.add(s.id);
    }
    if (!missing.size) return;
    for (const option of ui.generators.querySelectorAll("button"))
        if (missing.has(option.dataset.id)) { option.disabled = true; option.dataset.missing = ""; option.title = "Module missing from this build"; option.tabIndex = -1; }
    const enabled = settings.generators.filter(id => !missing.has(id));
    settings = normaliseSettings({ ...settings, generators: enabled.length ? enabled : availableGenerators() });
    if (!ui.generators.querySelector('button:not(:disabled)[tabindex="0"]'))
        ui.generators.querySelector('button:not([data-missing])')?.setAttribute("tabindex", "0");
}

// --- Setup -------------------------------------------------------------------------

async function main() {
    await load();
    buildGrid();
    m = await createSausageMusic();
    const count = m._web_lab_module_count();
    for (let i = 0; i < count; i++)
        if (m._web_lab_module_implemented(i) === 1) modulesByName.set(str(m._web_lab_module_name(i)).toLowerCase(), i);
    snapshots = createTrackSnapshots(m, modulesByName, generatorVersion);
    // Complete legacy recipes and persist the migration before playback or
    // editing. The old browser keys and votes.txt remain untouched backups.
    await saveVotes();
    disableMissing();
    audio = createAudio(m, { volume: () => ui.volume.value, onPump, onWarning: setStatus, sweep: false, analyser: true, timerBuffer: 3 });
    if (!desktop) mediaSession = createRadioMediaSession({
        play: async () => { if (!playing || paused) return togglePlay(); await audio.start(); renderDisplay(); },
        pause: () => { if (playing && !paused) return togglePlay(); },
        stop, previous: prev, next, onError: setStatus,
    });
    for (const button of [ui.prev, ui.play, ui.next, ui.copyVotes, ui.downloadVotes, ui.importVotes, $("allStyles"), $("settingsButton")]) button.disabled = false;

    // A track in the URL plays first; otherwise the first draw does.
    const fromHash = parseTrackLine(decodeURIComponent(location.hash.slice(1)));
    if (fromHash) playlist.push(fromHash);
    fill();

    ui.stop.addEventListener("click", stop);
    ui.volume.addEventListener("input", () => audio.setVolume());
    ui.play.addEventListener("click", () => { ui.play.blur(); togglePlay(true); });
    ui.next.addEventListener("click", () => { ui.next.blur(); next(); });
    ui.prev.addEventListener("click", () => { ui.prev.blur(); prev(); });
    ui.like.addEventListener("click", () => { ui.like.blur(); keepSelection(); });
    ui.dislike.addEventListener("click", () => { ui.dislike.blur(); rejectSelection(); });
    ui.copyVotes.addEventListener("click", copyVotes);
    ui.downloadVotes.addEventListener("click", downloadVotes);
    ui.importVotes.addEventListener("click", () => {
        $("importStatus").textContent = "";
        $("importDialog").showModal(); ui.importBox.focus();
    });
    ui.addVotes.addEventListener("click", addVotes);
    document.addEventListener("keydown", (e) => {
        if (e.target.closest("details.menu, dialog")) return;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return;  // a focused button keeps its own keys
        if (e.key === " ") { e.preventDefault(); togglePlay(); }
        else if (e.key === "ArrowRight" || e.key === "n") next();
        else if (e.key === "ArrowLeft" || e.key === "p") prev();
        else if (e.key === "k" || e.key === "l") { e.preventDefault(); keepSelection(); }
        else if (e.key === "r" || e.key === "d") { e.preventDefault(); rejectSelection(); }
    });
    renderGrid();
    renderPlaylist();
    renderLikes();
    refreshSelection();
    renderDisplay();
    requestAnimationFrame(frame);
    setStatus("Ready");

    // The desktop app's global keys arrive as commands; the handlers are the
    // deck's own. Next is a dislike there, recorded with how far in, as the
    // Reject command would; with nothing on it is just next.
    if (shell) {
        shell.onCommand((cmd) => {
            const current = index >= 0 ? playlist[index] : null;
            if (cmd === "play") { if (!(playing && !paused)) togglePlay(); }
            else if (cmd === "playpause") togglePlay();
            else if (cmd === "skip") next();
            else if (cmd === "prev") prev();
            else if (cmd === "like") like(current);
            else if (cmd === "dislike") { if (current) dislike(current, index); else next(); }
        });
        shell.onNotice(setStatus);
        shell.ready();    // the app registers its keys and sends play
    }
}

main().catch((e) => setStatus(`Failed to load: ${e}`));
