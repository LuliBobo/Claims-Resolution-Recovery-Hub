import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Local-disk blob storage behind a two-function interface. The DB stores only the opaque
// key. Swap the bodies for object storage (S3, Vercel Blob) before deploying somewhere
// with an ephemeral filesystem (M8). The turbopackIgnore markers stop the bundler from
// tracing the whole project because the directory is configured at runtime.

const root = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? ".uploads");

export async function putBlob(bytes: Uint8Array): Promise<string> {
  const key = randomUUID();
  const dir = root();
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path.join(dir, key), bytes);
  return key;
}

export async function getBlob(key: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Invalid blob key");
  return readFile(/*turbopackIgnore: true*/ path.join(root(), key));
}
