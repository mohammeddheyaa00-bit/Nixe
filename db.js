const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { businesses: [], payments: [], nextId: 1 };
  }
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function createBusiness({ ownerPhone, name, type, menu, hours, extra }) {
  const data = load();
  if (data.businesses.find((b) => b.owner_phone === ownerPhone)) {
    throw new Error("الرقم مسجل مسبقاً");
  }
  const business = {
    id: data.nextId++,
    owner_phone: ownerPhone,
    business_name: name,
    business_type: type || "",
    menu: menu || "",
    hours: hours || "",
    extra_info: extra || "",
    whatsapp_phone_number_id: null,
    whatsapp_token: null,
    subscription_status: "inactive",
    subscription_expires_at: null,
    created_at: new Date().toISOString(),
  };
  data.businesses.push(business);
  save(data);
  return business.id;
}

function getBusinessByOwnerPhone(phone) {
  return load().businesses.find((b) => b.owner_phone === phone);
}

function getBusinessByWhatsappNumberId(phoneNumberId) {
  return load().businesses.find((b) => b.whatsapp_phone_number_id === phoneNumberId);
}

function getBusinessById(id) {
  return load().businesses.find((b) => b.id === Number(id));
}

function linkWhatsappNumber(businessId, phoneNumberId, token) {
  const data = load();
  const biz = data.businesses.find((b) => b.id === Number(businessId));
  if (biz) {
    biz.whatsapp_phone_number_id = phoneNumberId;
    biz.whatsapp_token = token;
    save(data);
  }
}

function activateSubscription(businessId, days = 30) {
  const data = load();
  const biz = data.businesses.find((b) => b.id === Number(businessId));
  const now = new Date();
  const currentExpiry =
    biz.subscription_expires_at && new Date(biz.subscription_expires_at) > now
      ? new Date(biz.subscription_expires_at)
      : now;
  const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
  biz.subscription_status = "active";
  biz.subscription_expires_at = newExpiry.toISOString();
  save(data);
  return newExpiry;
}

function expireOverdueSubscriptions() {
  const data = load();
  const now = new Date();
  let count = 0;
  data.businesses.forEach((b) => {
    if (b.subscription_status === "active" && new Date(b.subscription_expires_at) < now) {
      b.subscription_status = "expired";
      count++;
    }
  });
  if (count > 0) save(data);
  return count;
}

function recordPayment({ businessId, amount, provider, providerTransactionId, status }) {
  const data = load();
  const payment = {
    id: data.nextId++,
    business_id: Number(businessId),
    amount,
    provider,
    provider_transaction_id: providerTransactionId,
    status,
    created_at: new Date().toISOString(),
  };
  data.payments.push(payment);
  save(data);
  return payment.id;
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
