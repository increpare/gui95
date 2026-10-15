// Mobile display formatting must keep emoji and preserve canonical track data.
import assert from "node:assert/strict";
import fs from "node:fs";
import { asciiText } from "../site/radio-mobile-text.js";
import { parseTrackLine, trackLine } from "../site/station.js";

assert.equal(asciiText('Cafe\u0301 \u00b7 NES \u2014 \u201cLive\u201d\u2026'), 'Cafe | NES - "Live"...');
assert.equal(asciiText("Stra\u00dfe, \u0152uf, \u00d8resund, {noun}\u00b2"), "Strasse, OEuf, Oresund, {noun}2");
assert.equal(asciiText(null), "");
const emoji = "\u{1f49a} \u{274c} \u{1f44d}\u{1f3fd} \u{1f1e9}\u{1f1ea} \u{1f468}\u200d\u{1f469}\u200d\u{1f467} 1\ufe0f\u20e3";
assert.equal(asciiText(emoji), emoji, "emoji sequences survive display formatting");

const track = parseTrackLine("Pop: Caf\u00e9 d'\u00c9t\u00e9 \u00b7 on NES");
assert.ok(track);
const canonical = trackLine(track);
assert.ok(asciiText(canonical).includes("Cafe d'Ete"));
assert.equal(trackLine(track), canonical, "display formatting leaves the track's identity intact");
assert.deepEqual(parseTrackLine(canonical), track, "the original track still round-trips");

for (const file of ["radio-mobile.html", "radio-mobile.css", "radio-mobile.js", "radio-mobile-text.js"]) {
    const source = fs.readFileSync(new URL(`../site/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /[^\x00-\x7f]/, `${file} uses ASCII source text`);
}
console.log("radio_mobile: all checks passed");
