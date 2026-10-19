import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const archive = path.join(output, 'gui95-source' + (process.platform === 'linux' ? '.tar.gz' : '.zip'));
const temporaryArchive = path.join(output, '.gui95-source-' + randomUUID() + (process.platform === 'linux' ? '.tar.gz' : '.zip'));
const snapshot = JSON.parse(await readFile(path.join(root, 'references/snapshot-manifest.json'), 'utf8'));
for (const file of snapshot.files) {
  const digest = createHash('sha256').update(await readFile(path.join(root, file.path))).digest('hex');
  if (digest !== file.sha256) throw new Error('Reference snapshot changed: ' + file.path);
}
const temporary = path.join(output, '.source-' + randomUUID());
const stage = path.join(temporary, 'gui95');
await mkdir(stage, { recursive: true });
try {
  for (const name of ['Makefile', 'SKILL.md', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'PRIVACY.md', 'agents', 'docs', 'references', 'examples', 'tools', 'kit', 'demo'])
    await cp(path.join(root, name), path.join(stage, name), { recursive: true, filter: file => !['node_modules', '.git', '.codex_tmp'].includes(path.basename(file)) });
  const run = promisify(execFile);
  if (process.platform === 'win32')
    await run(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe'), ['-a', '-c', '-f', temporaryArchive, '-C', temporary, 'gui95'], { windowsHide: true });
  else if (process.platform === 'darwin') await run('ditto', ['-c', '-k', '--keepParent', stage, temporaryArchive]);
  else await run('tar', ['-czf', temporaryArchive, '-C', temporary, 'gui95']);
  // Replace only the completed generated archive, preserving the previous one on failure.
  await rename(temporaryArchive, archive);
  console.log('GUI95 distribution: ' + archive);
} catch (error) { await rm(temporaryArchive, { force: true }); throw error; }
finally { await rm(temporary, { recursive: true, force: true }); }
