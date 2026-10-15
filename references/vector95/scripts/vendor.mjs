import fs from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const destination = new URL("../src/vendor/", import.meta.url);
await fs.mkdir(destination, { recursive: true });
await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../node_modules/fontkit/dist/browser-module.mjs",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  outfile: fileURLToPath(new URL("fontkit.js", destination)),
});
await fs.copyFile(
  new URL("../node_modules/fontkit/README.md", import.meta.url),
  new URL("fontkit-README.md", destination),
);
for (const file of ["canvaskit.js", "canvaskit.wasm"])
  await fs.copyFile(
    new URL(`../node_modules/canvaskit-wasm/bin/${file}`, import.meta.url),
    new URL(file, destination),
  );
await fs.copyFile(
  new URL("../node_modules/canvaskit-wasm/LICENSE", import.meta.url),
  new URL("canvaskit-LICENSE.txt", destination),
);
await fs.copyFile(
  new URL("../node_modules/paper/dist/paper-core.min.js", import.meta.url),
  new URL("paper-core.js", destination),
);
await fs.copyFile(
  new URL("../node_modules/paper/LICENSE.txt", import.meta.url),
  new URL("paper-LICENSE.txt", destination),
);
for (const file of ["ms_sans_serif.woff2", "ms_sans_serif_bold.woff2"]) {
  await fs.copyFile(
    new URL("../node_modules/98.css/fonts/converted/" + file, import.meta.url),
    new URL(file, destination),
  );
}
await fs.copyFile(
  new URL("../node_modules/98.css/LICENSE", import.meta.url),
  new URL("font-LICENSE.txt", destination),
);
