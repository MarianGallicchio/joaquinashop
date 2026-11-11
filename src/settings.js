import { config } from "./config.js";
import { getDb, save } from "./store.js";

/**
 * Datos comerciales editables desde el backoffice.
 * Los valores de .env/config son el punto de partida; lo guardado en db.json
 * tiene prioridad para que se pueda cambiar sin reiniciar ni tocar código.
 */

const digits = (value) => String(value ?? "").replace(/\D/g, "");

export function normalizeWhatsApp(value) {
  let number = digits(value);
  if (!number) throw new Error("Ingresá un WhatsApp válido.");
  if (number.startsWith("00")) number = number.slice(2);
  if (number.startsWith("0")) number = number.replace(/^0+/, "");

  // Número argentino local: 11 2673 0077 → 54 9 11 2673 0077
  if (number.length === 10) number = `549${number}`;
  // 54 11 2673 0077 → agregamos el 9 de celular.
  else if (number.length === 12 && number.startsWith("54") && !number.startsWith("549")) {
    number = `549${number.slice(2)}`;
  }
  // 9 11 2673 0077 → 54 9 11 2673 0077
  else if (number.length === 11 && number.startsWith("9")) number = `54${number}`;

  if (number.length < 10 || number.length > 15) {
    throw new Error("El WhatsApp debe tener entre 10 y 15 dígitos, con código de país.");
  }
  return number;
}

export function formatWhatsApp(value) {
  const number = digits(value);
  if (number.startsWith("549") && number.length === 13) {
    return `+54 9 ${number.slice(3, 5)} ${number.slice(5, 9)}-${number.slice(9)}`;
  }
  if (number.startsWith("54") && number.length >= 12) {
    return `+${number.slice(0, 2)} ${number.slice(2, 4)} ${number.slice(4, 8)}-${number.slice(8)}`;
  }
  return `+${number}`;
}

export function normalizeCbu(value) {
  const cbu = digits(value);
  if (!cbu) return "";
  if (cbu.length !== 22) throw new Error("El CBU debe tener 22 dígitos (o dejarse vacío).");
  return cbu;
}

export function normalizeCuit(value) {
  const cuit = digits(value);
  if (!cuit) return "";
  if (cuit.length !== 11) throw new Error("El CUIT debe tener 11 dígitos (o dejarse vacío).");
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}

export function normalizeAlias(value) {
  const alias = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!alias) throw new Error("Ingresá el alias de la cuenta.");
  if (!/^[a-z0-9.-]{6,30}$/.test(alias)) {
    throw new Error("El alias debe tener entre 6 y 30 caracteres: letras, números, puntos o guiones.");
  }
  return alias;
}

export function getStoreSettings() {
  const saved = getDb().settings || {};
  return {
    whatsapp: saved.whatsapp || config.store.whatsapp,
    bank: {
      holder: saved.bank?.holder ?? config.payments.bank.holder,
      name: saved.bank?.name ?? config.payments.bank.name,
      cbu: saved.bank?.cbu ?? config.payments.bank.cbu,
      alias: saved.bank?.alias ?? config.payments.bank.alias,
      cuit: saved.bank?.cuit ?? config.payments.bank.cuit,
    },
    updatedAt: saved.updatedAt || null,
  };
}

export function updateStoreSettings(input = {}) {
  const holder = String(input.bank?.holder ?? "").trim().slice(0, 80);
  const bankName = String(input.bank?.name ?? "").trim().slice(0, 60);
  if (!holder) throw new Error("Ingresá el titular de la cuenta.");
  if (!bankName) throw new Error("Ingresá el banco o billetera.");

  const settings = {
    whatsapp: normalizeWhatsApp(input.whatsapp),
    bank: {
      holder,
      name: bankName,
      alias: normalizeAlias(input.bank?.alias),
      cbu: normalizeCbu(input.bank?.cbu),
      cuit: normalizeCuit(input.bank?.cuit),
    },
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.settings = settings;
  save();
  return settings;
}
