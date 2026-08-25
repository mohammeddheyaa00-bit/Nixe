require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const db = require("./db");
const subscription = require("./subscription");

const app = express();
app.use(cors());
app.use(express.json());

const SYSTEM_PROMPT_TEMPLATE = (biz) => `أنت مساعد ذكاء اصطناعي يرد تلقائياً على رسائل الزبائن نيابةً عن هذا المحل. استخدم فقط المعلومات تحت، ولا تختلق معلومة غير موجودة.

قواعد اللهجة (مهمة جداً):
- احچي بالعامية العراقية الدارجة الحقيقية (هلا وغلا، شلونك، شكو ماكو، اكو/ماكو، شنو، هسه، چم، زين، خوش، تدلل).
- اكتب بإملاء عربي صحيح تماماً بدون أخطاء.
- الرد قصير: سطرين لثلاثة كحد أقصى.

قواعد الذكاء:
- جاوب على أي سؤال بشكل طبيعي، حتى تحية أو شكوى.
- إذا ما تعرف تفصيل دقيق، لا تختلق، قول إنك راح تتأكد.

معلومات المحل:
اسم المحل: ${biz.business_name}
نوع النشاط: ${biz.business_type || ""}
القائمة والأسعار: ${biz.menu || ""}
أوقات الدوام: ${biz.hours || ""}
معلومات إضافية: ${biz.extra_info || ""}`;

async function askClaude(systemPrompt, userMessage) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await response.json();
  const reply = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return reply || "عذرا، ما كدرت أجاوب هسه.";
}

async function sendWhatsAppMessage(phoneNumberId, token, to, text) {
  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    }),
  });
}

// تسجيل محل جديد
app.post("/api/register", (req, res) => {
  const { ownerPhone, name, type, menu, hours, extra } = req.body;
  if (!ownerPhone || !name) {
    return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبين" });
  }
  try {
    const businessId = db.createBusiness({ ownerPhone, name, type, menu, hours, extra });
    res.json({ businessId, status: "تم التسجيل، الاشتراك غير مفعّل" });
  } catch (err) {
    res.status(400).json({ error: "الرقم مسجل مسبقاً أو صار خطأ" });
  }
});

// بدء دفع الاشتراك
app.post("/api/subscribe", async (req, res) => {
  const { businessId } = req.body;
  const business = db.getBusinessById(businessId);
  if (!business) return res.status(404).json({ error: "المحل غير موجود" });

  try {
    const redirectUrl = await subscription.startSubscriptionPayment(businessId);
    res.json({ redirectUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "فشل بدء عملية الدفع" });
  }
});

app.get("/callback/zaincash/success", subscription.handleZainCashSuccess);
app.get("/callback/zaincash/failure", subscription.handleZainCashFailure);

// حالة الاشتراك
app.get("/api/subscription-status/:businessId", (req, res) => {
  const business = db.getBusinessById(req.params.businessId);
  if (!business) return res.status(404).json({ error: "المحل غير موجود" });
  res.json({
    status: business.subscription_status,
    expiresAt: business.subscription_expires_at,
    isActive: subscription.isSubscriptionActive(business),
  });
});

// ربط رقم واتساب
app.post("/api/link-whatsapp", (req, res) => {
  const { businessId, phoneNumberId, token } = req.body;
  db.linkWhatsappNumber(businessId, phoneNumberId, token);
  res.json({ status: "تم ربط رقم واتساب بنجاح" });
});

// تحقق Webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// استقبال رسائل واتساب
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];
    if (!message || message.type !== "text") return;

    const phoneNumberId = value.metadata.phone_number_id;
    const business = db.getBusinessByWhatsappNumberId(phoneNumberId);
    if (!business) return;

    if (!subscription.isSubscriptionActive(business)) {
      console.log(`اشتراك ${business.business_name} منتهي`);
      return;
    }

    const reply = await askClaude(SYSTEM_PROMPT_TEMPLATE(business), message.text.body);
    await sendWhatsAppMessage(
      business.whatsapp_phone_number_id,
      business.whatsapp_token,
      message.from,
      reply
    );
  } catch (err) {
    console.error("خطأ بمعالجة رسالة واتساب:", err);
  }
});

// شات تجريبي داخل التطبيق
app.post("/api/chat", async (req, res) => {
  const { businessId, message } = req.body;
  const business = businessId ? db.getBusinessById(businessId) : null;
  const systemPrompt = business
    ? SYSTEM_PROMPT_TEMPLATE(business)
    : "أنت مساعد ذكاء اصطناعي يرد بعامية عراقية ودودة ومختصرة.";
  try {
    const reply = await askClaude(systemPrompt, message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "صار خطأ داخلي" });
  }
});

app.get("/", (req, res) => res.send("Nixe server شغال ✅"));

subscription.startExpiryChecker();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Nixe سيرفر شغال على المنفذ ${PORT}`));

