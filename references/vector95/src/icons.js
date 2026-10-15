import { icons, captions } from "./generated/svg-assets.js";
import { namespaceMarkup } from "./core.js";

let instance = 0;

export function icon(name, size = 16) {
  const caption = Object.hasOwn(captions, name);
  const source = caption
    ? captions[name]
    : Object.hasOwn(icons, name)
      ? icons[name]
      : icons.info;
  // Saved SVGs can contain gradients, clips and IDs. Each inline copy needs
  // its own references, even when the same icon appears in several windows.
  return namespaceMarkup(source, `icon-${++instance}`).replace(
    /^<svg\b([^>]*)>/,
    (_, attributes) =>
      `<svg${attributes.replace(/\s(?:width|height|class|role|aria-[\w-]+)="[^"]*"/g, "")} width="${caption ? 12 : size}" height="${caption ? 10 : size}"${caption ? ' class="caption-glyph"' : ""} aria-hidden="true">`,
  );
}
