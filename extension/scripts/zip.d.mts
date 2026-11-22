// Types for zip.mjs (used by the release E2E test).
export interface ZipEntry {
  name: string;
  data: Buffer;
}
export function writeZip(files: ZipEntry[]): Buffer;
export function readZip(zip: Buffer): ZipEntry[];
