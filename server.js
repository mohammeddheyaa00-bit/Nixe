const express = require('express');
const app = express();

const VERIFY_TOKEN = "Samsung10mohammed.";

app.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.status(200).send("Nixe Server is running!");
});

module.exports = app;
