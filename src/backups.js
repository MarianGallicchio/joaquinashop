import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, config } from "./config.js";

const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 30;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (!raw) return null;
  // Accept hex (64 chars) or derive from passphrase
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(String(raw)).digest();
}

function encryptIfNeeded(buffer) {
  const key = getKey();
  if (!key) return { data: buffer, encrypted: false, ext: ".json" };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(12) + tag(16) + ciphertext
  return { data: Buffer.concat([iv, tag, enc]), encrypted: true, ext: ".json.enc" };
}

function decryptIfNeeded(buffer, filename) {
  if (!filename.endsWith(".enc")) return buffer;
  const key = getKey();
  if (!key) throw new Error("No hay BACKUP_ENCRYPTION_KEY configurada para descifrar este backup.");
  if (buffer.length < 28) throw new Error("Backup encriptado inválido.");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const enc = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function listBackups() {
  ensureDirs();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("db-") && (f.endsWith(".json") || f.endsWith(".json.enc")))
    .sort()
    .reverse()
    .map((name) => {
      const full = path.join(BACKUP_DIR, name);
      const st = fs.statSync(full);
      return { name, size: st.size, at: st.mtime.toISOString(), encrypted: name.endsWith(".enc") };
    });
}

export function createBackup(reason = "manual") {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) throw new Error("No existe db.json para respaldar.");
  const raw = fs.readFileSync(DB_FILE);
  // Validate JSON
  JSON.parse(raw.toString("utf8"));
  const { data, encrypted, ext } = encryptIfNeeded(raw);
  const safeReason = String(reason || "manual").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "manual";
  const name = `db-${stamp()}-${safeReason}${ext}`;
  const full = path.join(BACKUP_DIR, name);
  fs.writeFileSync(full, data);
  rotateBackups();
  return { name, encrypted, size: data.length, at: new Date().toISOString() };
}

function rotateBackups() {
  const files = listBackups();
  const toDelete = files.slice(MAX_BACKUPS);
  for (const f of toDelete) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch {}
  }
}

export function readBackup(name) {
  ensureDirs();
  if (!/^db-[\w.-]+\.json(\.enc)?$/.test(name)) throw new Error("Nombre de backup inválido.");
  const full = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(full)) throw new Error("Backup no encontrado.");
  const raw = fs.readFileSync(full);
  const plain = decryptIfNeeded(raw, name);
  return JSON.parse(plain.toString("utf8"));
}

export function restoreBackup(name) {
  ensureDirs();
  // Create safety backup first
  try { createBackup("pre-restore"); } catch {}
  const data = readBackup(name);
  if (!data || typeof data !== "object" || !Array.isArray(data.orders)) {
    throw new Error("El backup no tiene un formato válido.");
  }
  const tmp = `${DB_FILE}.${process.pid}.restore.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, DB_FILE);
  return { ok: true, restored: name, at: new Date().toISOString() };
}

export function backupStatus() {
  const key = getKey();
  const backups = listBackups();
  return {
    enabled: true,
    encryptedAtRest: Boolean(key),
    backupDir: BACKUP_DIR,
    count: backups.length,
    latest: backups[0] || null,
  };
}

let interval = null;
export function startBackupScheduler() {
  if (interval) return;
  ensureDirs();
  // Initial backup shortly after start, then every 6 hours
  setTimeout(() => { try { createBackup("auto"); } catch {} }, 60_000).unref?.();
  interval = setInterval(() => { try { createBackup("auto"); } catch {} }, 6 * 60 * 60 * 1000);
  interval.unref?.();
}
