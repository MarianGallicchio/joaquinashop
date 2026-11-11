import crypto from "node:crypto";
import { config } from "./config.js";

function sign(payload) {
  return crypto
    .createHmac("sha256", config.security.sessionSecret)
    .update(payload)
    .digest("base64url");
}

export function createAdminToken() {
  const payload = Buffer.from(
    JSON.stringify({ role: "admin", exp: Date.now() + config.security.adminTokenTtlMs }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  if (signature.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function adminRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Sesión inválida o vencida." });
  }
  next();
}

const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 60, key = "global" } = {}) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(id);
    if (!bucket || bucket.reset < now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({ error: "Demasiadas solicitudes. Probá en un minuto." });
    }
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    next();
  };
}
