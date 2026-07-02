const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8000;

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));

// Enable CORS for cross-device requests
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Scoring State In-Memory Database
let globalState = {};

// API State endpoints
app.post('/api/state', (req, res) => {
    globalState = req.body;
    res.status(200).json({ status: 'ok' });
});

app.get('/api/state', (req, res) => {
    res.status(200).json(globalState);
});

// Serve static HTML/JS/CSS assets from root folder
app.use(express.static(__dirname));

// Fallback route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`CrickMitra cloud server running on port ${port}`);
});
