import { createHmac } from "node:crypto";
import { objectStorageClient } from "../objectStorage";
import { AppError, requireConfigured } from "../flamingo/errors";

/** Stored evidence location. Legacy records without `provider` are App Storage paths. */
export type StoredEvidence = { path: string; hash: string; attempts: number; provider?: "imagekit" | "app_storage"; fileId?: string };

const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
const TIMEOUT_MS = 15_000;

function imageKit() {
  const key = process.env.IMAGEKIT_PRIVATE_KEY, raw = process.env.IMAGEKIT_URL_ENDPOINT;
  requireConfigured(key, "ImageKit image storage");
  requireConfigured(raw, "ImageKit image storage");
  const endpoint = raw.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+/.test(endpoint)) throw new AppError(503, "ImageKit URL endpoint must be an https URL, such as https://ik.imagekit.io/your_id.");
  return { key, endpoint, auth: `Basic ${Buffer.from(`${key}:`).toString("base64")}` };
}

/** Signed URL for an ImageKit private file (HMAC-SHA1 over path+expiry), valid for 60 seconds. */
export function signedImageKitUrl(path: string, endpoint: string, key: string, now = Date.now()) {
  const expire = Math.floor(now / 1000) + 60;
  const relative = path.replace(/^\/+/, "");
  const signature = createHmac("sha1", key).update(relative + expire).digest("hex");
  return `${endpoint}/${relative}?ik-t=${expire}&ik-s=${signature}`;
}

/** Upload a normalized JPEG as a private ImageKit file. No public URL is ever returned to clients. */
export async function saveEvidenceImage(image: Buffer, folder: string, name: string): Promise<Pick<StoredEvidence, "path" | "provider" | "fileId">> {
  const { auth } = imageKit();
  const form = new FormData();
  form.set("file", image.toString("base64"));
  form.set("fileName", name);
  form.set("folder", folder);
  form.set("isPrivateFile", "true");
  form.set("useUniqueFileName", "false");
  form.set("tags", "flamingo-evidence");
  const r = await fetch(UPLOAD_URL, { method: "POST", headers: { Authorization: auth }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) })
    .catch(() => { throw new AppError(503, "ImageKit could not be reached. Your image was not saved; try again."); });
  const body = await r.json().catch(() => ({})) as { fileId?: string; filePath?: string; message?: string };
  if (!r.ok || !body.fileId || !body.filePath) throw new AppError(r.status === 401 || r.status === 403 ? 503 : 502, `ImageKit rejected the upload (HTTP ${r.status}). Your image was not saved.`);
  return { provider: "imagekit", fileId: body.fileId, path: body.filePath };
}

export async function readEvidenceImage(file: StoredEvidence): Promise<Buffer> {
  if (file.provider !== "imagekit") {
    const parts = file.path.replace(/^\/+/, "").split("/");
    const [bytes] = await objectStorageClient.bucket(parts.shift()!).file(parts.join("/")).download();
    return bytes;
  }
  const { key, endpoint } = imageKit();
  const r = await fetch(signedImageKitUrl(file.path, endpoint, key), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    .catch(() => { throw new AppError(503, "ImageKit could not be reached to load this image."); });
  if (!r.ok) throw new AppError(502, `ImageKit could not return this image (HTTP ${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}
