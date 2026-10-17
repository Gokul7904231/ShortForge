/**
 * Minimal deterministic ZIP writer (no dependencies).
 *
 * - Entries are written in the order given (caller sorts them).
 * - Timestamps are fixed, so identical inputs give an identical archive
 *   (for a given zlib version).
 * - Supports files, directories and symlinks (unix mode in external attrs).
 * - Plain ZIP (not ZIP64): fails loudly beyond 65,535 entries or 4 GiB.
 */
import fs from "node:fs";
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(epochSeconds) {
  const d = new Date(Math.max(epochSeconds, 315532800) * 1000); // >= 1980-01-01
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

const MAX_U32 = 0xffffffff;
const COMPRESSED_EXT = /\.(png|jpe?g|gif|webp|avif|mp4|webm|mov|woff2?|gz|br|zip|zst)$/i;

/**
 * @param {string} outPath
 * @param {Array<{name: string, type: 'file'|'dir'|'symlink', abs?: string, data?: Buffer, target?: string, mode: number}>} entries
 * @param {{ epochSeconds?: number }} [opts]
 */
export function writeZip(outPath, entries, opts = {}) {
  if (entries.length > 0xffff) {
    throw new Error(`ZIP entry limit exceeded (${entries.length} > 65535); ZIP64 is not implemented.`);
  }
  const { time, date } = dosDateTime(opts.epochSeconds ?? 0);
  const fd = fs.openSync(outPath, "w");
  let offset = 0;
  const central = [];

  const write = (buf) => {
    fs.writeSync(fd, buf, 0, buf.length);
    offset += buf.length;
  };

  try {
    for (const e of entries) {
      const isDir = e.type === "dir";
      const name = Buffer.from(isDir && !e.name.endsWith("/") ? `${e.name}/` : e.name, "utf8");
      let data = Buffer.alloc(0);
      if (e.type === "file") data = e.data ?? fs.readFileSync(e.abs);
      else if (e.type === "symlink") data = Buffer.from(e.target, "utf8");

      let method = 0;
      let payload = data;
      if (data.length > 0 && e.type === "file" && !COMPRESSED_EXT.test(e.name)) {
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        if (deflated.length < data.length) {
          method = 8;
          payload = deflated;
        }
      }
      if (data.length > MAX_U32 || payload.length > MAX_U32 || offset > MAX_U32) {
        throw new Error(`ZIP size limit exceeded at ${e.name}; ZIP64 is not implemented.`);
      }

      const crc = crc32(data);
      const typeBits = isDir ? 0o040000 : e.type === "symlink" ? 0o120000 : 0o100000;
      const externalAttrs = (((typeBits | (e.mode & 0o7777)) << 16) | (isDir ? 0x10 : 0)) >>> 0;
      const localOffset = offset;

      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(20, 4);
      lh.writeUInt16LE(0x0800, 6); // UTF-8 names
      lh.writeUInt16LE(method, 8);
      lh.writeUInt16LE(time, 10);
      lh.writeUInt16LE(date, 12);
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(payload.length, 18);
      lh.writeUInt32LE(data.length, 22);
      lh.writeUInt16LE(name.length, 26);
      lh.writeUInt16LE(0, 28);
      write(lh);
      write(name);
      write(payload);

      central.push({ name, method, crc, csize: payload.length, usize: data.length, externalAttrs, localOffset });
    }

    const cdStart = offset;
    for (const c of central) {
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE((3 << 8) | 20, 4); // made by: unix
      ch.writeUInt16LE(20, 6);
      ch.writeUInt16LE(0x0800, 8);
      ch.writeUInt16LE(c.method, 10);
      ch.writeUInt16LE(time, 12);
      ch.writeUInt16LE(date, 14);
      ch.writeUInt32LE(c.crc, 16);
      ch.writeUInt32LE(c.csize, 20);
      ch.writeUInt32LE(c.usize, 24);
      ch.writeUInt16LE(c.name.length, 28);
      ch.writeUInt16LE(0, 30);
      ch.writeUInt16LE(0, 32);
      ch.writeUInt16LE(0, 34);
      ch.writeUInt16LE(0, 36);
      ch.writeUInt32LE(c.externalAttrs, 38);
      ch.writeUInt32LE(c.localOffset, 42);
      write(ch);
      write(c.name);
    }
    const cdSize = offset - cdStart;
    if (offset > MAX_U32) throw new Error("ZIP size limit exceeded; ZIP64 is not implemented.");

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(central.length, 8);
    eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    write(eocd);
  } finally {
    fs.closeSync(fd);
  }
}
