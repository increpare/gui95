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

/** What the report says about the system that drew the grid, and a short label safe to use in file names. */
export function describeGuest(report) {
  const system = report.system ?? {};
  const version = /^(\d+)\.(\d+) build (\d+) platform (\d+)/.exec(system.version ?? '');
  const wine = system.wine && system.wine !== 'no' ? system.wine : null;
  const bits = (+system.bitspixel || 0) * (+system.planes || 1);
  const originalControls = /^absent/.test(system['comctl32.DllGetVersion'] ?? '');
  let label = 'unknown-system', name = 'an unidentified system';
  if (wine) { label = 'wine'; name = `Wine ${wine} (not Windows)`; }
  else if (version) {
    const [, major, minor, build, platform] = version.map(Number);
    const number = `${major}.${String(minor).padStart(2, '0')}.${build}`;
    if (platform === 1 && major === 4 && minor === 0) { label = `win95-${number}`; name = `Windows 95 ${number}`; }
    else { label = `windows-${number}`; name = `Windows ${number} (platform ${platform}), not Windows 95`; }
  }
  return { label, name, wine, bits, originalControls, isWindows95: label.startsWith('win95-'), screen: system.screen, comctl32: system['comctl32.dll'], displayMode: system.displaymode };
}

/** The measured rectangle of a cell's window, if the report has one. */
export function measuredRect(report, cell) { return parseRect(report[`sheet${cell.sheet}`]?.[cell.id]); }
