// The radio's pure parts under Node: the generator grid is the studio's styles
// and the OST, every drawn track's line reads back as the same track, the
// draw honours the toggles, the toggles never empty a group, and the starred
// votes' text round-trips. No wasm needed.
//
//   node web/test/radio_test.mjs
import { kGenerators, kPaletteChoices, kOst, defaultSettings, normaliseSettings, toggle,
         drawTrack, trackLine, parseTrackLine, trackKey, sameTrack, trackTitle, trackTag,
         dialFrequency, votesToText, textToVotes, tally, stationOf } from "../site/station.js";
import { kStyles } from "../site/styles.js";
import { kTitleGenerators } from "../site/titles.js";
import ssrTracks from "../site/ssr_tracks.js";

let failures = 0;
function check(condition, what) {
    if (!condition) { console.error(`CHECK failed: ${what}`); failures++; }
}

// The same generator the pages use (mulberry32), seeded so the run repeats.
function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// --- The grid ---------------------------------------------------------------------

check(kGenerators.length === kStyles.length + 1, `one generator per style plus the OST, got ${kGenerators.length}`);
check(kGenerators[kGenerators.length - 1] === kOst, "the OST is last");
for (const g of kGenerators) {
    check(g.id && g.name && g.c1 && g.c2 && g.blurb, `generator ${g.id} has a name, colours and a blurb`);
    if (g !== kOst) check(kTitleGenerators[g.id], `style ${g.id} has a title generator`);
}
check(kPaletteChoices.length === 5 && kPaletteChoices[0].id === "lab", "Lab and the four platforms");

// --- Settings ---------------------------------------------------------------------

const all = defaultSettings();
check(all.generators.length === kGenerators.length && all.palettes.length === 5, "the default is everything on");
check(JSON.stringify(normaliseSettings(null)) === JSON.stringify(all), "no stored settings: the default");
check(JSON.stringify(normaliseSettings({ generators: [], palettes: ["bogus"] })) === JSON.stringify(all), "empty or unknown groups: the default");
const onlyPop = normaliseSettings({ generators: ["pop", "nope"], palettes: ["sid", "nes"] });
check(onlyPop.generators.join() === "pop" && onlyPop.palettes.join() === "nes,sid", `unknown ids dropped, the grid's order kept: ${JSON.stringify(onlyPop)}`);
const stillPop = toggle(onlyPop, "generators", "pop");
check(stillPop.generators.join() === "pop", "the last generator on cannot go off");
check(toggle(onlyPop, "generators", "jazzy").generators.join() === "pop,jazzy", "toggling on adds in the grid's order");
check(toggle(toggle(onlyPop, "generators", "jazzy"), "generators", "pop").generators.join() === "jazzy", "toggling off removes");

// --- Drawing ----------------------------------------------------------------------

{
    const r = rng(7);
    for (let i = 0; i < 40; i++) {
        const t = drawTrack(onlyPop, r);
        check(t.kind === "style" && t.state.style.id === "pop", "only Pop on: a Pop track");
        check(t.state.palette && (t.state.palette.id === "nes" || t.state.palette.id === "sid"), `a palette from the enabled two, got ${t.state.palette?.id}`);
    }
    const ostOnly = normaliseSettings({ generators: ["ost"], palettes: ["lab"] });
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
        const t = drawTrack(ostOnly, r);
        check(t.kind === "ost" && ssrTracks.some((s) => s.seed === t.seed && s.name === t.name), "only the OST on: an island track");
        seen.add(t.seed);
    }
    check(seen.size > 20, `the islands vary (${seen.size} of 60 distinct)`);
    const labOnly = normaliseSettings({ generators: all.generators, palettes: ["lab"] });
    const ids = new Set();
    for (let i = 0; i < 400; i++) {
        const t = drawTrack(labOnly, r);
        if (t.kind === "style") { check(t.state.palette === null, "Lab only: no palette"); ids.add(t.state.style.id); } else ids.add("ost");
    }
    check(ids.size === kGenerators.length, `every generator turns up in 400 draws (${ids.size} of ${kGenerators.length})`);
}

// --- Lines ------------------------------------------------------------------------

{
    const r = rng(11);
    for (let i = 0; i < 200; i++) {
        const t = drawTrack(all, r);
        const line = trackLine(t);
        const back = parseTrackLine(line);
        check(back && sameTrack(t, back), `line reads back: "${line}"`);
        check(back && trackLine(back) === line, `and writes the same: "${line}" vs "${back && trackLine(back)}"`);
        check(trackTitle(t).length > 0 && trackTag(t).length > 0, `title and tag for "${line}"`);
        const f = Number(dialFrequency(t));
        check(f >= 87.5 && f <= 108.0 && dialFrequency(t) === dialFrequency(back), `a dial reading for "${line}": ${f}`);
        if (t.kind === "style") {
            check(line.startsWith(`${t.state.style.name}: `), `a style line names its style: "${line}"`);
            check(back.state.tune === t.state.tune && back.state.opts === t.state.opts && back.state.sound === t.state.sound, `the seeds survive: "${line}"`);
        } else check(/^OST: .+ · seed=-?\d+$/.test(line), `an OST line: "${line}"`);
    }
    const byName = parseTrackLine("ost: land's end");
    check(byName && byName.kind === "ost" && byName.seed === 199936790, "an island by name alone, case aside");
    const shared = ssrTracks.find((s) => ssrTracks.some((o) => o !== s && o.name === s.name));
    if (shared) {
        const other = ssrTracks.find((o) => o !== shared && o.name === shared.name);
        check(parseTrackLine(`OST: ${shared.name} · seed=${other.seed}`).seed === other.seed, "a repeated island name: the seed decides");
    }
    check(parseTrackLine("OST: Nowhere Island") === null, "an unknown island is rejected");
    check(parseTrackLine("OST: Land's End · seed=12") === null, "a seed that is no island is rejected");
    check(parseTrackLine("") === null && parseTrackLine("   ") === null, "an empty line is nothing");
    check(parseTrackLine("just some words") === null && parseTrackLine("Nope: a title") === null, "a line without a style is nothing here, unlike the studio");
    check(parseTrackLine("pop-1a-2b-3c")?.state.style.id === "pop", "the studio's old seed form");
    const studio = parseTrackLine("Jazzy: Blue Rooms · take 3 · on C64");
    check(studio && studio.kind === "style" && studio.state.style.id === "jazzy" && studio.state.take === 3 && studio.state.palette.id === "sid", "a studio seed string with a take and a platform");
    check(trackKey(parseTrackLine("jazzy:  blue rooms")) === trackKey(parseTrackLine("Jazzy: Blue Rooms")), "spelling does not make a second track");
}

// --- Votes ------------------------------------------------------------------------

{
    const r = rng(3);
    const likes = [drawTrack(all, r), { kind: "ost", seed: 199936790, name: "Land's End" }];
    const dislikes = [{ ...drawTrack(all, r), at: 72.6 }, { ...drawTrack(all, r), at: null }];
    const text = votesToText({ likes, dislikes });
    const lines = text.split("\n");
    check(lines.length === 5 && text.endsWith("\n"), "one line per vote, a final newline");
    check(lines[0].startsWith("+ ") && lines[1] === "+ OST: Land's End · seed=199936790", `likes first, with a plus: ${lines[1]}`);
    check(lines[2].startsWith("- 1:12 ") && lines[3].startsWith("- ") && !/^- \d/.test(lines[3]), `dislikes with the time in when known: ${lines[2]} / ${lines[3]}`);
    const back = textToVotes(text + "\n\nnot a track at all - - - -\n" + trackLine(likes[0]).toUpperCase() + "\n- 0:05 " + trackLine(likes[1]) + "\n");
    check(back.likes.length === 2 && back.dislikes.length === 2 && back.bad.length === 1, `two likes, two dislikes, one bad; the repeats dropped: ${back.likes.length}, ${back.dislikes.length}, ${back.bad.length}`);
    check(back.likes.every((t, i) => sameTrack(t, likes[i])) && back.dislikes.every((t, i) => sameTrack(t, dislikes[i])), "in order");
    check(back.dislikes[0].at === 72 && back.dislikes[1].at === null, `the time read back to the second: ${back.dislikes[0].at}, ${back.dislikes[1].at}`);
    const old = textToVotes(`${trackLine(likes[0])}\n${trackLine(likes[1])}\n`);
    check(old.likes.length === 2 && old.dislikes.length === 0, "the earlier starred file, bare lines, reads as likes");
    check(votesToText({}) === "" && textToVotes("").likes.length === 0, "an empty list is empty text and back");
    const t = tally({ likes, dislikes });
    check(t[stationOf(likes[1])].likes >= 1 && t.ost.likes === 1, "the OST tallies a like");
    check(Object.values(t).reduce((a, b) => a + b.likes + b.dislikes, 0) === 4, "every vote tallied once");
}

if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log("radio: all checks passed");
