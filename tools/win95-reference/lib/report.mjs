// Parses REFGRID.TXT, the report refgrid writes beside itself: INI-like sections of key=value lines.

export function parseReport(text) {
  const report = {}; let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const head = /^\[(.+)\]$/.exec(line);
    if (head) { section = report[head[1]] ??= {}; continue; }
    const split = line.indexOf('=');
    if (section && split > 0) section[line.slice(0, split)] = line.slice(split + 1);
  }
  return report;
}

/** "x,y,w,h" to a rectangle, or null. */
export function parseRect(value) {
  const match = /^(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(value ?? '');
  return match ? { x: +match[1], y: +match[2], w: +match[3], h: +match[4] } : null;
}

/** Which Windows 95 release a build number and service-release letter mean. */
function release95(build, letter) {
  if (letter === 'c') return 'OSR2.5';
  if (letter === 'b') return build >= 1212 ? 'OSR2.1' : 'OSR2';
  if (letter === 'a') return 'OSR1 (Service Pack 1)';
  return build === 950 ? 'original 1995 release' : 'unrecognised release';
}

/** Which generation of the common controls library a comctl32.dll file version is. */
function controlsEra(version) {
  const match = /^(\d+)\.(\d+)\./.exec(version ?? '');
  if (!match) return { version: null, era: 'unknown', original: false, ie4: false };
  const [major, minor] = [+match[1], +match[2]], number = `${major}.${String(minor).padStart(2, '0')}`;
  if (major === 4 && minor === 0) return { version: number, era: 'the original 1995 library', original: true, ie4: false };
  if (major === 4 && minor === 70) return { version: number, era: 'the 1996 library shipped with OSR2 and Internet Explorer 3', original: false, ie4: false };
  return { version: number, era: 'a later library (Internet Explorer 4 or newer)', original: false, ie4: true };
}

/** What the report says about the system that drew the grid, and a short label safe to use in file names. */
export function describeGuest(report) {
  const system = report.system ?? {};
  const version = /^(\d+)\.(\d+) build (\d+) platform (\d+) csd "([^"]*)"/.exec(system.version ?? '') ?? /^(\d+)\.(\d+) build (\d+) platform (\d+)/.exec(system.version ?? '');
  const wine = system.wine && system.wine !== 'no' ? system.wine : null;
  const bits = (+system.bitspixel || 0) * (+system.planes || 1);
  const file = name => /^([\d.]+) \(/.exec(system[name] ?? '')?.[1] ?? null;
  const controls = controlsEra(file('comctl32.dll'));
  const files = Object.fromEntries(['comctl32.dll', 'user32.dll', 'gdi32.dll', 'kernel32.dll', 'user.exe', 'gdi.exe', 'shell32.dll'].map(name => [name, file(name)]));
  let label = 'unknown-system', name = 'an unidentified system', release = null;
  if (wine) { label = 'wine'; name = `Wine ${wine} (not Windows)`; }
  else if (version) {
    const [major, minor, build, platform] = version.slice(1, 5).map(Number), letter = (version[5] ?? '').trim().toLowerCase();
    const number = `${major}.${String(minor).padStart(2, '0')}.${build}`;
    if (platform === 1 && major === 4 && minor === 0) { release = release95(build, letter); label = `win95-${number}${/^[a-c]$/.test(letter) ? letter : ''}`; name = `Windows 95 ${number}${letter ? ' ' + letter.toUpperCase() : ''} (${release})`; }
    else { label = `windows-${number}`; name = `Windows ${number} (platform ${platform}), not Windows 95`; }
  }
  return { label, name, release, wine, bits, files, commonControls: controls, originalControls: controls.version ? controls.original : /^absent/.test(system['comctl32.DllGetVersion'] ?? ''), isWindows95: label.startsWith('win95-'), screen: system.screen, comctl32: system['comctl32.dll'], displayMode: system.displaymode };
}

/** The measured rectangle of a cell's window, if the report has one. */
export function measuredRect(report, cell) { return parseRect(report[`sheet${cell.sheet}`]?.[cell.id]); }
