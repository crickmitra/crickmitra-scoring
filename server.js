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
let registeredUsers = [];

// API State endpoints
app.post('/api/state', (req, res) => {
    globalState = req.body;
    res.status(200).json({ status: 'ok' });
});

app.get('/api/state', (req, res) => {
    res.status(200).json(globalState);
});

// API Registration endpoints
app.post('/api/register', (req, res) => {
    const user = req.body;
    // Prevent duplicate numbers in-memory
    registeredUsers = registeredUsers.filter(u => u.mobile !== user.mobile);
    registeredUsers.push(user);
    console.log(`Registered user: ${user.name} (${user.role})`);
    res.status(200).json({ status: 'ok', count: registeredUsers.length });
});

app.get('/api/registered-users', (req, res) => {
    // Return registered users without photo base64 strings to save bandwidth
    const usersSummary = registeredUsers.map(u => ({
        name: u.name,
        mobile: u.mobile,
        role: u.role
    }));
    res.status(200).json(usersSummary);
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
