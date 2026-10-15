// Format mobile display text without changing the saved track's identity.
export function asciiText(value) {
    return String(value ?? "")
        .replace(/[\u2018-\u201b]/g, "'")
        .replace(/[\u201c-\u201f]/g, '"')
        .replace(/[\u2013-\u2015\u2212]/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/\u00b7/g, "|")
        .replace(/\u00df/g, "ss")
        .replace(/\u0153/g, "oe").replace(/\u0152/g, "OE")
        .replace(/\u00e6/g, "ae").replace(/\u00c6/g, "AE")
        .replace(/\u00f8/g, "o").replace(/\u00d8/g, "O")
        .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7e\n\r\t\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0f\u20e3]/gu, "");
}
