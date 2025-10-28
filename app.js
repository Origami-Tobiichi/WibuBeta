const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const qrcode = require('qrcode');
const fs = require('fs');
const os = require('os');
const moment = require('moment');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Import bot
const { startBot } = require('./bot');

// Config
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global bot state
global.botState = {
  isConnected: false,
  qrCode: null,
  pairingCode: null,
  user: null,
  connectionStatus: 'disconnected',
  lastUpdate: new Date(),
  stats: {
    startTime: new Date(),
    messagesProcessed: 0,
    usersCount: 0
  }
};

// Routes
app.get('/', (req, res) => {
  const systemInfo = getSystemInfo();
  res.render('index', {
    botName: "KNIGHT BOT",
    botState: global.botState,
    owner: "MR UNIQUE HACKER",
    systemInfo: systemInfo,
    baseUrl: process.env.KOYEB_PUBLIC_DOMAIN || req.get('host')
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    ...global.botState,
    systemInfo: getSystemInfo(),
    serverTime: new Date().toISOString()
  });
});

app.post('/api/pairing', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.json({ success: false, message: 'Phone number required' });
    }

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 10) {
      return res.json({ success: false, message: 'Invalid phone number' });
    }

    // Set global pairing request
    global.pairingRequest = cleanNumber;
    
    updateBotStatus({
      connectionStatus: 'requesting_pairing',
      pairingCode: null,
      qrCode: null
    });

    res.json({ 
      success: true, 
      message: 'Pairing code requested successfully'
    });

  } catch (error) {
    console.error('Pairing request error:', error);
    res.json({ success: false, message: 'Internal server error' });
  }
});

// Health check endpoint untuk Koyeb - SANGAT PENTING!
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    botConnected: global.botState.isConnected,
    connectionStatus: global.botState.connectionStatus
  };
  
  // Jika bot tidak connected lebih dari 5 menit, return error
  if (!global.botState.isConnected && 
      global.botState.lastUpdate && 
      (new Date() - new Date(global.botState.lastUpdate)) > 300000) {
    return res.status(503).json({ ...healthStatus, status: 'unhealthy' });
  }
  
  res.status(200).json(healthStatus);
});

app.get('/api/system-info', (req, res) => {
  res.json(getSystemInfo());
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('🌐 Client connected:', socket.id);
  
  socket.emit('bot-status', global.botState);
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });

  socket.on('get-qr', () => {
    if (global.botState.qrCode) {
      generateQRImage(global.botState.qrCode).then(qrImage => {
        socket.emit('qr-update', qrImage);
      });
    }
  });
});

// Bot status update function
function updateBotStatus(status) {
  global.botState = { 
    ...global.botState, 
    ...status, 
    lastUpdate: new Date() 
  };
  
  // Generate QR image if QR code is available
  if (status.qrCode) {
    generateQRImage(status.qrCode).then(qrImage => {
      io.emit('qr-image', qrImage);
    });
  }
  
  io.emit('bot-status', global.botState);
  console.log('🤖 Bot status:', status.connectionStatus);
}

// Generate QR code as image
async function generateQRImage(qrData) {
  try {
    return await qrcode.toDataURL(qrData, {
      width: 300,
      height: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('QR generation error:', error);
    return null;
  }
}

// System information
function getSystemInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
      free: Math.round(os.freemem() / 1024 / 1024) + ' MB'
    },
    uptime: formatUptime(process.uptime()),
    nodeVersion: process.version,
    loadAverage: os.loadavg()
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const mins = Math.floor((seconds % (60 * 60)) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

// Start server
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Server started on port', PORT);
  console.log('📱 Web Interface: http://0.0.0.0:' + PORT);
  
  // Start bot after server is running
  setTimeout(() => {
    startBot(updateBotStatus);
  }, 2000);
});

module.exports = app;