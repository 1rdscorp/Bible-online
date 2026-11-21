/**
 * Read one file out of a .zip archive, with Node's built-in zlib (no
 * dependency). Enough for eBible.org's downloads: stored or deflated entries,
 * no encryption, no Zip64.
 */
import { inflateRawSync } from 'node:zlib';

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/**
 * @param {Buffer} zip   the archive's bytes
 * @param {string} name  the file inside it, e.g. "grcbrent_usfx.xml"
 * @returns {Buffer}
 */
export function readZipEntry(zip, name) {
  // The end-of-directory record sits in the last 64 KB (after an optional comment).
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i -= 1) {
    if (zip.readUInt32LE(i) === END_OF_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('Not a zip file (no end-of-directory record).');
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const names = [];

  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(offset) !== DIRECTORY_ENTRY) throw new Error('Damaged zip directory.');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const entryName = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    names.push(entryName);
    if (entryName === name || entryName.endsWith(`/${name}`)) {
      if (zip.readUInt32LE(localOffset) !== LOCAL_HEADER) throw new Error(`Damaged zip entry ${name}.`);
      const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`${name}: unsupported zip compression method ${method}.`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} is not in the zip (it has: ${names.join(', ')}).`);
}
