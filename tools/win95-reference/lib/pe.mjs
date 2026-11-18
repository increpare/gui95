// Reads the parts of a PE executable that decide whether Windows 95 will load it: machine, subsystem, versions, imports.

export function readPe(bytes) {
  if (bytes.readUInt16LE(0) !== 0x5a4d) throw new Error('Not an MZ executable.');
  const pe = bytes.readUInt32LE(0x3c);
  if (bytes.readUInt32LE(pe) !== 0x4550) throw new Error('No PE signature.');
  const sectionCount = bytes.readUInt16LE(pe + 6), optionalSize = bytes.readUInt16LE(pe + 20), optional = pe + 24;
  const info = {
    machine: bytes.readUInt16LE(pe + 4), characteristics: bytes.readUInt16LE(pe + 22), magic: bytes.readUInt16LE(optional),
    osVersion: `${bytes.readUInt16LE(optional + 40)}.${bytes.readUInt16LE(optional + 42)}`,
    subsystemVersion: `${bytes.readUInt16LE(optional + 48)}.${bytes.readUInt16LE(optional + 50)}`,
    subsystem: bytes.readUInt16LE(optional + 68), imports: []
  };
  if (info.magic !== 0x10b) return info;   // only PE32 has the layout read below
  const sections = Array.from({ length: sectionCount }, (_, i) => { const s = optional + optionalSize + i * 40; return { name: bytes.toString('latin1', s, s + 8).replace(/\0+$/, ''), virtualSize: bytes.readUInt32LE(s + 8), address: bytes.readUInt32LE(s + 12), rawSize: bytes.readUInt32LE(s + 16), raw: bytes.readUInt32LE(s + 20) }; });
  info.sections = sections.map(s => s.name);
  const at = rva => { const s = sections.find(s => rva >= s.address && rva < s.address + Math.max(s.virtualSize, s.rawSize)); if (!s) throw new Error(`Address ${rva.toString(16)} is in no section.`); return rva - s.address + s.raw; };
  const text = offset => { let end = offset; while (bytes[end]) end++; return bytes.toString('latin1', offset, end); };
  const importRva = bytes.readUInt32LE(optional + 104);
  if (!importRva) return info;
  for (let d = at(importRva); ; d += 20) {
    const lookup = bytes.readUInt32LE(d), nameRva = bytes.readUInt32LE(d + 12), thunks = bytes.readUInt32LE(d + 16);
    if (!nameRva) break;
    const entry = { dll: text(at(nameRva)).toLowerCase(), functions: [] };
    for (let t = at(lookup || thunks); ; t += 4) {
      const value = bytes.readUInt32LE(t);
      if (!value) break;
      entry.functions.push(value & 0x80000000 ? `#${value & 0xffff}` : text(at(value) + 2));
    }
    info.imports.push(entry);
  }
  return info;
}

/** The DLLs refgrid may import from: all are part of the original Windows 95. */
export const WINDOWS_95_DLLS = Object.freeze(['kernel32.dll', 'user32.dll', 'gdi32.dll', 'comctl32.dll', 'version.dll']);

/** Problems that would stop the program loading on Windows 95 on a 486 or Pentium. An empty list means none were found. */
export function checkForWindows95(info) {
  const problems = [];
  if (info.machine !== 0x14c) problems.push(`machine is 0x${info.machine.toString(16)}, not i386 (0x14c)`);
  if (info.magic !== 0x10b) problems.push(`optional header magic is 0x${info.magic.toString(16)}, not PE32 (0x10b)`);
  if (info.subsystem !== 2) problems.push(`subsystem is ${info.subsystem}, not Windows GUI (2)`);
  const [major, minor] = info.subsystemVersion.split('.').map(Number);
  if (major > 4 || (major === 4 && minor > 0)) problems.push(`subsystem version ${info.subsystemVersion} is above 4.0, which Windows 95 refuses`);
  if (info.characteristics & 0x2000) problems.push('the file is a DLL');
  for (const { dll, functions } of info.imports) {
    if (!WINDOWS_95_DLLS.includes(dll)) problems.push(`imports from ${dll}, which is not on the Windows 95 list`);
    for (const name of functions) if (/W$/.test(name) && !/^(lstrlenW|MultiByteToWideChar|WideCharToMultiByte|GetCommandLineW|MessageBoxW|TextOutW|ExtTextOutW|GetCharWidthW|GetTextExtentPoint32W|GetTextExtentPointW|EnumResourceLanguagesW|EnumResourceNamesW|EnumResourceTypesW|FindResourceW|FindResourceExW|GetModuleFileNameW|GetEnvironmentStringsW|FreeEnvironmentStringsW)$/.test(name)) problems.push(`imports ${dll}!${name}: most Unicode entry points are stubs on Windows 95`);
  }
  return problems;
}

/**
 * Look each imported function up in the text of the Win32 Programmer's Reference (the WinHelp file converted to text,
 * one topic per "=== Name ===" heading). `documented` have a topic of their own, `mentioned` appear only in other
 * topics, `missing` appear nowhere. Being documented there does not prove the function works on Windows 95; being
 * missing is a prompt to check by hand.
 */
export function checkAgainstReference(info, referenceText) {
  const topics = new Set([...referenceText.matchAll(/^=== (\w+) ===\r?$/gm)].map(m => m[1]));
  const documented = [], mentioned = [], missing = [];
  for (const { dll, functions } of info.imports) for (const name of functions) {
    const base = name.replace(/A$/, '');
    if (topics.has(name) || topics.has(base)) documented.push(`${dll}!${name}`);
    else if (new RegExp(`\\b(${name}|${base})\\b`).test(referenceText)) mentioned.push(`${dll}!${name}`);
    else missing.push(`${dll}!${name}`);
  }
  return { documented, mentioned, missing };
}
