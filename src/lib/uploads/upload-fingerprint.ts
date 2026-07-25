const SAMPLE_BYTES = 64 * 1024;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fingerprintUploadBlob(blob: Blob, fileName: string): Promise<string> {
  const first = blob.slice(0, Math.min(blob.size, SAMPLE_BYTES));
  const last = blob.size > SAMPLE_BYTES
    ? blob.slice(Math.max(0, blob.size - SAMPLE_BYTES), blob.size)
    : new Blob();
  const metadata = new TextEncoder().encode(`${fileName}\n${blob.type}\n${blob.size}\n`);
  const firstBytes = new Uint8Array(await first.arrayBuffer());
  const lastBytes = new Uint8Array(await last.arrayBuffer());
  const merged = new Uint8Array(metadata.length + firstBytes.length + lastBytes.length);
  merged.set(metadata, 0);
  merged.set(firstBytes, metadata.length);
  merged.set(lastBytes, metadata.length + firstBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", merged);
  return bytesToHex(new Uint8Array(digest));
}
