const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const NodeCache = require("node-cache");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

// Buat folder session jika belum ada
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session', { recursive: true });
}

async function startBot(statusUpdater) {
    try {
        console.log(chalk.blue('🔐 Initializing WhatsApp Bot...'));
        
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();
        const msgRetryCounterCache = new NodeCache();

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            browser: ["Knight Bot Koyeb", "Chrome", "3.0"],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                return null;
            },
            msgRetryCounterCache
        });

        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            
            console.log(chalk.yellow('🔗 Connection update:'), connection);

            if (qr) {
                console.log(chalk.green('📱 QR Code received - Ready for scanning'));
                statusUpdater({
                    qrCode: qr,
                    pairingCode: null,
                    connectionStatus: 'scan_qr'
                });
            }

            if (connection === 'open') {
                console.log(chalk.green('✅ Bot connected successfully!'));
                statusUpdater({
                    isConnected: true,
                    qrCode: null,
                    pairingCode: null,
                    user: sock.user,
                    connectionStatus: 'connected'
                });
                
                // Send welcome message to owner
                sendWelcomeMessage(sock);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(chalk.red('🔌 Connection closed:'), statusCode);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Device logged out, clearing session...'));
                    try {
                        fs.rmSync('./session', { recursive: true, force: true });
                    } catch (error) {
                        console.error('Error clearing session:', error);
                    }
                    statusUpdater({
                        isConnected: false,
                        connectionStatus: 'logged_out'
                    });
                } else {
                    statusUpdater({
                        isConnected: false,
                        connectionStatus: 'reconnecting'
                    });
                }
                
                // Auto-reconnect
                console.log(chalk.yellow('🔄 Reconnecting in 5 seconds...'));
                setTimeout(() => startBot(statusUpdater), 5000);
            }
        });

        // Handle pairing code requests
        if (global.pairingRequest) {
            try {
                console.log(chalk.blue('🔢 Requesting pairing code for:'), global.pairingRequest);
                const pairingCode = await sock.requestPairingCode(global.pairingRequest);
                const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
                
                statusUpdater({
                    pairingCode: formattedCode,
                    qrCode: null,
                    connectionStatus: 'enter_pairing'
                });
                
                console.log(chalk.green('✅ Pairing Code:'), formattedCode);
                
                // Clear the request
                global.pairingRequest = null;
                
            } catch (error) {
                console.error('❌ Pairing error:', error);
                statusUpdater({
                    connectionStatus: 'pairing_error',
                    error: error.message
                });
            }
        }

        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type === 'notify') {
                await handleIncomingMessage(sock, messages[0]);
            }
        });

        console.log(chalk.green('🤖 Bot initialization complete!'));

    } catch (error) {
        console.error('❌ Bot initialization failed:', error);
        statusUpdater({
            connectionStatus: 'error',
            error: error.message
        });
        
        // Restart on error
        setTimeout(() => startBot(statusUpdater), 10000);
    }
}

async function sendWelcomeMessage(sock) {
    try {
        if (sock.user) {
            const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const welcomeMessage = `
🤖 *KNIGHT BOT - Koyeb Deployment*

✅ Bot successfully connected!
🕒 ${new Date().toLocaleString()}
🌐 Server: ${process.env.KOYEB_PUBLIC_DOMAIN || 'Koyeb Cloud'}
📊 Status: Online and Ready

*Features Available:*
• AI Chat Assistant
• Media Downloader
• Games
• Voice Notes
• And much more!

Type !menu to see all commands.
            `;
            
            await sock.sendMessage(botNumber, { 
                text: welcomeMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true
                }
            });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
}

async function handleIncomingMessage(sock, message) {
    try {
        if (!message.message) return;
        
        const messageType = Object.keys(message.message)[0];
        const jid = message.key.remoteJid;
        const fromMe = message.key.fromMe;
        
        if (fromMe) return;
        
        let text = '';
        if (messageType === 'conversation') {
            text = message.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            text = message.message.extendedTextMessage.text;
        }
        
        if (text) {
            // Update stats
            if (global.botState.stats) {
                global.botState.stats.messagesProcessed++;
            }
            
            // Simple auto-reply
            if (text.toLowerCase() === '!menu') {
                await sock.sendMessage(jid, {
                    text: `🎮 *KNIGHT BOT MENU*

🤖 AI Features:
• !ai <question> - Chat with AI
• !image <prompt> - Generate image

📥 Downloader:
• !yt <url> - Download YouTube video
• !ig <url> - Download Instagram
• !tiktok <url> - Download TikTok

🎮 Games:
• !game - Show games menu
• !quiz - Start quiz

🔊 Voice:
• !tts <text> - Text to speech
• !stt - Convert voice to text

⚙️ Other:
• !sticker - Create sticker
• !info - Bot info

🌐 Deployed on: ${process.env.KOYEB_PUBLIC_DOMAIN || 'Koyeb'}
                    `
                });
            } else if (text.toLowerCase().startsWith('!ai')) {
                const question = text.substring(3).trim();
                await sock.sendMessage(jid, {
                    text: `🤖 AI Response:\n\nQuestion: ${question}\n\nThis is a demo AI response. In production, connect to OpenAI API.`
                });
            } else if (text.toLowerCase() === 'ping') {
                await sock.sendMessage(jid, {
                    text: '🏓 Pong! Bot is alive and running on Koyeb!'
                });
            }
        }
        
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

module.exports = { startBot };
