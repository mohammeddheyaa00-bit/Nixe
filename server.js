const VERIFY_TOKEN = "Samsung10mohammed.";

// دالة التحقق المشتركة
const handleVerification = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    return res.status(200).send("Nixe Server is running!");
};

// يغطي المسار الأساسي ومسار الويب هوك
app.get('/', handleVerification);
app.get('/webhook', handleVerification);
