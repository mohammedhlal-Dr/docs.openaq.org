/** Encodage UTF-8 sans dépendre de TextEncoder (absent de certains moteurs JS). */
export function utf8Encode(s: string): Uint8Array {
  const TE = (globalThis as { TextEncoder?: new () => { encode(s: string): Uint8Array } }).TextEncoder;
  if (TE) return new TE().encode(s);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

/**
 * Tronque une chaîne pour que son encodage UTF-8 tienne en `maxBytes` octets,
 * sans couper un caractère multi-octets.
 */
export function utf8Truncate(bytes: Uint8Array, maxBytes: number): Uint8Array {
  if (bytes.length <= maxBytes) return bytes;
  let end = maxBytes;
  // Recule tant qu'on est sur un octet de continuation (10xxxxxx).
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.slice(0, end);
}
