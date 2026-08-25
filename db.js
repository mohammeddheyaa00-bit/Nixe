const Database = require("better-sqlite3");
const db = new Database("nixe.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_phone TEXT UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    business_type TEXT,
    menu TEXT,
    hours TEXT,
    extra_info TEXT,
    whatsapp_phone_number_id TEXT,
    whatsapp_token TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    subscription_expires_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_transaction_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses (id)
  );
`);

function createBusiness({ ownerPhone, name, type, menu, hours, extra }) {
  const stmt = db.prepare(`
    INSERT INTO businesses (owner_phone, business_name, business_type, menu, hours, extra_info)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(ownerPhone, name, type, menu, hours, extra).lastInsertRowid;
}

function getBusinessByOwnerPhone(phone) {
  return db.prepare("SELECT * FROM businesses WHERE owner_phone = ?").get(phone);
}

function getBusinessByWhatsappNumberId(phoneNumberId) {
  return db.prepare("SELECT * FROM businesses WHERE whatsapp_phone_number_id = ?").get(phoneNumberId);
}

function getBusinessById(id) {
  return db.prepare("SELECT * FROM businesses WHERE id = ?").get(id);
}

function linkWhatsappNumber(businessId, phoneNumberId, token) {
  db.prepare("UPDATE businesses SET whatsapp_phone_number_id = ?, whatsapp_token = ? WHERE id = ?")
    .run(phoneNumberId, token, businessId);
}

function activateSubscription(businessId, days = 30) {
  const business = getBusinessById(businessId);
  const now = new Date();
  const currentExpiry =
    business.subscription_expires_at && new Date(business.subscription_expires_at) > now
      ? new Date(business.subscription_expires_at)
      : now;
  const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);

  db.prepare("UPDATE businesses SET subscription_status = 'active', subscription_expires_at = ? WHERE id = ?")
    .run(newExpiry.toISOString(), businessId);

  return newExpiry;
}

function expireOverdueSubscriptions() {
  const now = new Date().toISOString();
  return db.prepare(
    "UPDATE businesses SET subscription_status = 'expired' WHERE subscription_status = 'active' AND subscription_expires_at < ?"
  ).run(now).changes;
}

function recordPayment({ businessId, amount, provider, providerTransactionId, status }) {
  return db.prepare(`
    INSERT INTO payments (business_id, amount, provider, provider_transaction_id, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(businessId, amount, provider, providerTransactionId, status).lastInsertRowid;
}

module.exports = {
  createBusiness,
  getBusinessByOwnerPhone,
  getBusinessByWhatsappNumberId,
  getBusinessById,
  linkWhatsappNumber,
  activateSubscription,
  expireOverdueSubscriptions,
  recordPayment,
};

