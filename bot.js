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

        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);

        // Handle incoming messages
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type === 'notify') {
                await handleIncomingMessage(sock, messages[0]);
            }
        });

        // Cek apakah ada permintaan pairing code dari environment variable
        if (process.env.PAIRING_NUMBER) {
            await requestPairingCode(sock, process.env.PAIRING_NUMBER, statusUpdater);
        }

        // Handle pairing code request via message
        global.requestPairing = async (number) => {
            return await requestPairingCode(sock, number, statusUpdater);
        };

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

// Fungsi untuk meminta pairing code
async function requestPairingCode(sock, number, statusUpdater) {
    try {
        console.log(chalk.blue('🔢 Requesting pairing code for:'), number);
        
        // Format nomor (pastikan format internasional tanpa +)
        let formattedNumber = number.replace(/\D/g, '');
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        }
        
        const pairingCode = await sock.requestPairingCode(formattedNumber);
        const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
        
        statusUpdater({
            pairingCode: formattedCode,
            qrCode: null,
            connectionStatus: 'enter_pairing',
            pairingNumber: formattedNumber
        });
        
        console.log(chalk.green('✅ Pairing Code:'), formattedCode);
        console.log(chalk.blue('📱 Enter this code in WhatsApp on the phone with number:'), formattedNumber);
        
        return {
            success: true,
            pairingCode: formattedCode,
            number: formattedNumber
        };
        
    } catch (error) {
        console.error('❌ Pairing error:', error);
        statusUpdater({
            connectionStatus: 'pairing_error',
            error: error.message
        });
        
        return {
            success: false,
            error: error.message
        };
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

*Connection Methods:*
• QR Code Scanning
• Pairing Code

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
            if (global.botState && global.botState.stats) {
                global.botState.stats.messagesProcessed++;
            }
            
            // Simple auto-reply dengan tambahan command pairing
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

🔗 Connection:
• !pair <number> - Request pairing code
• !qr - Show QR code

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
            } else if (text.toLowerCase().startsWith('!pair')) {
                // Handle pairing request via message
                const number = text.substring(5).trim();
                if (!number) {
                    await sock.sendMessage(jid, {
                        text: '❌ Please provide a phone number. Example: !pair 628123456789'
                    });
                    return;
                }
                
                await sock.sendMessage(jid, {
                    text: '🔄 Requesting pairing code...'
                });
                
                const result = await requestPairingCode(sock, number, global.updateBotStatus || (() => {}));
                
                if (result.success) {
                    await sock.sendMessage(jid, {
                        text: `✅ Pairing Code: *${result.pairingCode}*\n\nEnter this code in WhatsApp on the phone with number: ${result.number}`
                    });
                } else {
                    await sock.sendMessage(jid, {
                        text: `❌ Failed to get pairing code: ${result.error}`
                    });
                }
            } else if (text.toLowerCase() === '!qr') {
                await sock.sendMessage(jid, {
                    text: '📱 Please scan the QR code shown in the terminal or browser interface to connect.'
                });
            }
        }
        
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

module.exports = { startBot };
