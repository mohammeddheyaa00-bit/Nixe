const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const db = require("./db");

const SUBSCRIPTION_PRICE_IQD = 50000;
const ZAINCASH_BASE_URL = "https://pg-api-uat.zaincash.iq"; // بيئة تجريبية

async function getZainCashAccessToken() {
  const response = await fetch(`${ZAINCASH_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchantId: process.env.ZAINCASH_MERCHANT_ID,
      secret: process.env.ZAINCASH_SECRET,
    }),
  });
  const data = await response.json();
  return data.access_token;
}

async function startSubscriptionPayment(businessId) {
  const accessToken = await getZainCashAccessToken();

  const response = await fetch(
    `${ZAINCASH_BASE_URL}/api/v2/payment-gateway/transaction/init`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        amount: SUBSCRIPTION_PRICE_IQD,
        orderId: `nixe_sub_${businessId}_${Date.now()}`,
        serviceType: "اشتراك Nixe الشهري",
        successUrl: `${process.env.APP_BASE_URL}/callback/zaincash/success`,
        failureUrl: `${process.env.APP_BASE_URL}/callback/zaincash/failure`,
        lang: "ar",
      }),
    }
  );

  const data = await response.json();

  db.recordPayment({
    businessId,
    amount: SUBSCRIPTION_PRICE_IQD,
    provider: "zaincash",
    providerTransactionId: data.transactionId || data.id,
    status: "pending",
  });

  return data.redirectUrl;
}

async function handleZainCashSuccess(req, res) {
  try {
    const token = req.query.token;
    const decoded = jwt.verify(token, process.env.ZAINCASH_SECRET);

    if (decoded.status !== "success") {
      return res.redirect("nixe://subscription-failed");
    }

    const businessId = parseInt(decoded.orderId.split("_")[2], 10);
    const newExpiry = db.activateSubscription(businessId, 30);

    res.redirect(`nixe://subscription-success?expires=${newExpiry.toISOString()}`);
  } catch (err) {
    console.error("خطأ بتأكيد دفعة زين كاش:", err);
    res.redirect("nixe://subscription-failed");
  }
}

function handleZainCashFailure(req, res) {
  res.redirect("nixe://subscription-failed");
}

function startExpiryChecker() {
  setInterval(() => {
    const expiredCount = db.expireOverdueSubscriptions();
    if (expiredCount > 0) {
      console.log(`تم إيقاف ${expiredCount} اشتراك منتهي`);
    }
  }, 60 * 60 * 1000);
}

function isSubscriptionActive(business) {
  return (
    business.subscription_status === "active" &&
    business.subscription_expires_at &&
    new Date(business.subscription_expires_at) > new Date()
  );
}

module.exports = {
  SUBSCRIPTION_PRICE_IQD,
  startSubscriptionPayment,
  handleZainCashSuccess,
  handleZainCashFailure,
  startExpiryChecker,
  isSubscriptionActive,
};

