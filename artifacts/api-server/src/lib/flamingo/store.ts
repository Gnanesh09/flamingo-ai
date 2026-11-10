import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import type { Activity, ChatMessage, Customer, Invoice, Reminder, Settings } from "@workspace/api-zod";
import { AppError } from "./errors";
import type { ResolutionRecord, PortalRecord } from "./resolution-state";

export interface Workspace {
  id: string;
  version: number;
  active: boolean;
  username: string;
  role: "business" | "admin";
  createdAt: string;
  customers: Customer[];
  invoices: Invoice[];
  reminders: Reminder[];
  activity: Activity[];
  conversation: ChatMessage[];
  settings: Settings;
  operations: Record<string, "started" | "complete" | "rejected">;
  resolutions?: ResolutionRecord[];
  portals?: PortalRecord[];
}

const dataDir = path.resolve(process.cwd(), ".data/flamingo");
let mongo: MongoClient | undefined;
let connection: Promise<MongoClient> | undefined;
export const storage = process.env.MONGODB_URI ? "mongodb" : "local-demo";
const queues = new Map<string, Promise<unknown>>();

export async function exclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(fn);
  queues.set(key, current);
  try {
    return await current;
  } finally {
    if (queues.get(key) === current) queues.delete(key);
  }
}

async function collection() {
  if (!connection) {
    mongo = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 7000, ignoreUndefined: true });
    connection = mongo.connect().catch(() => {
      connection = undefined;
      throw new AppError(503, "MongoDB could not be reached. Check the connection string and Atlas network access. Data was not switched to local storage.");
    });
  }
  const client = await connection;
  return client.db("flamingo_ai").collection<Workspace>("workspaces");
}

export async function readWorkspace(id: string): Promise<Workspace | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  if (storage === "mongodb") {
    const item = await (await collection()).findOne({ id }, { projection: { _id: 0 } });
    // BSON historically encoded optional undefined fields as null. The API
    // contract uses omitted optional values; normalize earlier records on read.
    for (const r of item?.resolutions ?? []) {
      for (const key of ["requestedDate", "requestedAmount", "commitment", "baselinePaid"] as const) {
        if (r[key] == null) delete r[key];
      }
    }
    return item;
  }
  try {
    return JSON.parse(await readFile(path.join(dataDir, `${id}.json`), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AppError(503, "The demo data file could not be read. It has not been overwritten.");
  }
}

export async function saveWorkspace(workspace: Workspace, isNew = false): Promise<void> {
  const version = workspace.version;
  workspace.version++;
  workspace.activity = workspace.activity.slice(0, 500);
  workspace.conversation = workspace.conversation.slice(-100);
  if (storage === "mongodb") {
    const db = await collection();
    if (isNew) {
      await db.insertOne(workspace);
    } else {
      const result = await db.replaceOne({ id: workspace.id, version }, workspace);
      if (!result.matchedCount) {
        throw new AppError(409, "This workspace changed in another process. Refresh before retrying.");
      }
    }
    return;
  }
  await mkdir(dataDir, { recursive: true });
  const target = path.join(dataDir, `${workspace.id}.json`);
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(workspace), { mode: 0o600 });
  await rename(temp, target);
}

export async function mutateWorkspace<T>(id: string, fn: (ws: Workspace) => Promise<T> | T, allowInactive = false): Promise<T> {
  return exclusive(id, async () => {
    const ws = await readWorkspace(id);
    if (!ws || (!ws.active && !allowInactive)) throw new AppError(401, "Start a demo workspace to continue.");
    let value: T;
    try {
      value = await fn(ws);
    } catch (error) {
      // Preserve audit failures and completed external operations even if verification fails.
      await saveWorkspace(ws);
      throw error;
    }
    await saveWorkspace(ws);
    return value;
  });
}

export function audit(ws: Workspace, title: string, detail: string, status: Activity["status"] = "info", invoiceId?: string, type = "system") {
  ws.activity.unshift({ id: randomUUID(), type, title, detail, status, createdAt: new Date().toISOString(), ...(invoiceId ? { invoiceId } : {}) });
}

export async function loadGlobal<T>(key: string, initial: T): Promise<T> {
  await mkdir(dataDir, { recursive: true });
  try { return JSON.parse(await readFile(path.join(dataDir, `${key}.json`), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return initial;
    throw error;
  }
}

export async function saveGlobal<T>(key: string, value: T) {
  await mkdir(dataDir, { recursive: true });
  const target = path.join(dataDir, `${key}.json`);
  await writeFile(`${target}.tmp`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${target}.tmp`, target);
}
