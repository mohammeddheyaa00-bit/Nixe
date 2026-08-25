const express = require('express');
const app = express();

app.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // تحقق من الرمز
    if (mode === 'subscribe' && token === 'Samsung10mohammed.') {
        console.log("WEBHOOK_VERIFIED");
        return res.status(200).send(challenge);
    }
    
    return res.status(200).send("Nixe WhatsApp Webhook Server is Online!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
