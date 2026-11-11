import { getDb, resetDemoData } from "../src/store.js";

const force = process.argv.includes("--force");
const db = getDb();
if (force) {
  resetDemoData();
  console.log("Dataset demo regenerado.");
} else {
  console.log(`Pedidos: ${db.orders.length} · Leads: ${db.leads.length}`);
}
