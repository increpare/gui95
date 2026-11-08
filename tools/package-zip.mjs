import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from '../kit/distribution.mjs';

// Use the kit's portable ZIP writer: '/' paths, hidden files and no host metadata.
export async function packageZip(directory, archive) {
  const root = path.resolve(directory);
  const parent = path.dirname(root);
  const files = [];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Package contains a symlink: ' + absolute);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push({ path: path.relative(parent, absolute).split(path.sep).join('/'), data: await readFile(absolute) });
    }
  }
  await walk(root);
  await writeFile(archive, makeZip(files), { flag: 'wx' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error('Use: node tools/package-zip.mjs DIRECTORY ARCHIVE.zip');
  await packageZip(process.argv[2], process.argv[3]);
}
