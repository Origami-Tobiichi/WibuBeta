const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const axios = require('axios')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")

// Import handlers dan settings
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./handlers/messageHandler');
const settings = require('./settings')
const store = require('./lib/lightweight_store')

// Global variables
let sock = null;
let isConnecting = false;
global.botname = settings.botname || "KNIGHT BOT"
global.themeemoji = settings.themeemoji || "⚡"

// Buat folder session jika belum ada
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session', { recursive: true });
}

// Buat folder data jika belum ada
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
}

// Simple phone number validation
function validatePhoneNumber(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Basic validation - minimal 10 digit, maksimal 15 digit
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return false;
    }
    
    // Cek jika nomor dimulai dengan kode negara yang umum
    const countryCodes = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '379', '380', '381', '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850', '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998'];
    
    for (const code of countryCodes) {
        if (cleanNumber.startsWith(code)) {
            return true;
        }
    }
    
    return false;
}

async function startBot(statusUpdater) {
    try {
        if (isConnecting) {
            console.log(chalk.yellow('🔄 Connection already in progress...'));
            return;
        }

        isConnecting = true;
        console.log(chalk.blue('🔐 Initializing WhatsApp Bot...'));
        
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        const msgRetryCounterCache = new NodeCache();

        sock = makeWASocket({
            version,
            logger: pino({ level: 'fatal' }),
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            getMessage: async (key) => {
                try {
                    const jid = jidNormalizedUser(key.remoteJid);
                    const msg = await store.loadMessage(jid, key.id);
                    return msg?.message || undefined;
                } catch {
                    return undefined;
                }
            },
            msgRetryCounterCache,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            maxRetries: 10,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 0,
            transactionOpts: {
                maxRetries: 10,
                delayInMs: 3000
            }
        });

        // Store binding
        store.bind(sock.ev);

        // Extended functions
        sock.decodeJid = (jid) => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {};
                return decode.user && decode.server && decode.user + '@' + decode.server || jid;
            } else return jid;
        };

        sock.getName = (jid, withoutContact = false) => {
            let id = sock.decodeJid(jid);
            withoutContact = sock.withoutContact || withoutContact;
            let v;
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {};
                if (!(v.name || v.subject)) v = sock.groupMetadata(id) || {};
                resolve(v.name || v.subject || `Group: ${id}`);
            });
            else v = id === '0@s.whatsapp.net' ? {
                id,
                name: 'WhatsApp'
            } : id === sock.decodeJid(sock.user.id) ?
                sock.user :
                (store.contacts[id] || {});
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || `User: ${id.split('@')[0]}`;
        };

        sock.public = true;

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            
            console.log(chalk.yellow('🔗 Connection update:'), connection);

            if (qr) {
                console.log(chalk.green('📱 QR Code received - Ready for scanning'));
                statusUpdater({
                    qrCode: qr,
                    pairingCode: null,
                    connectionStatus: 'scan_qr'
                });
                isConnecting = false;
            }

            if (connection === 'open') {
                console.log(chalk.green('✅ Bot connected successfully!'));
                isConnecting = false;
                
                statusUpdater({
                    isConnected: true,
                    qrCode: null,
                    pairingCode: null,
                    user: sock.user,
                    connectionStatus: 'connected'
                });
                
                // Send welcome message
                await sendWelcomeMessage(sock);
                
                // Process pending pairing request after connection is open
                if (global.pendingPairingRequest) {
                    console.log(chalk.blue('🔄 Processing pending pairing request...'));
                    await processPairingRequest(sock, statusUpdater);
                }

                // Update bot info
                await delay(2000);
                console.log(chalk.yellow(`\n\n                  ${chalk.bold.blue(`[ ${global.botname} ]`)}\n\n`));
                console.log(chalk.cyan(`< ================================================== >`));
                console.log(chalk.magenta(`\n${global.themeemoji} YT CHANNEL: MR UNIQUE HACKER`));
                console.log(chalk.magenta(`${global.themeemoji} GITHUB: mrunqiuehacker`));
                console.log(chalk.magenta(`${global.themeemoji} WA NUMBER: ${settings.ownerNumber}`));
                console.log(chalk.magenta(`${global.themeemoji} CREDIT: MR UNIQUE HACKER`));
                console.log(chalk.green(`${global.themeemoji} 🤖 Bot Connected Successfully! ✅`));
                console.log(chalk.blue(`Bot Version: ${settings.version}`));
            }

            if (connection === 'close') {
                isConnecting = false;
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
                console.log(chalk.yellow('🔄 Reconnecting in 10 seconds...'));
                setTimeout(() => {
                    isConnecting = false;
                    startBot(statusUpdater);
                }, 10000);
            }

            // Handle connecting state
            if (connection === 'connecting') {
                statusUpdater({
                    connectionStatus: 'connecting'
                });
            }
        });

        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);

        // Handle messages
        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.message) return;
                
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? 
                    mek.message.ephemeralMessage.message : mek.message;
                
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(sock, chatUpdate);
                    return;
                }
                
                if (!sock.public && !mek.key.fromMe && chatUpdate.type === 'notify') return;
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;

                // Clear message retry cache
                if (sock?.msgRetryCounterCache) {
                    sock.msgRetryCounterCache.clear();
                }

                try {
                    await handleMessages(sock, chatUpdate, true);
                } catch (err) {
                    console.error("Error in handleMessages:", err);
                    if (mek.key && mek.key.remoteJid) {
                        await sock.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.',
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true
                            }
                        }).catch(console.error);
                    }
                }
            } catch (err) {
                console.error("Error in messages.upsert:", err);
            }
        });

        // Handle group updates
        sock.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(sock, update);
        });

        // Handle contacts update
        sock.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = sock.decodeJid(contact.id);
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify };
            }
        });

        // Handle pairing requests after connection is established
        if (global.pendingPairingRequest && sock && sock.user) {
            await processPairingRequest(sock, statusUpdater);
        }

        console.log(chalk.green('🤖 Bot initialization complete!'));

    } catch (error) {
        console.error('❌ Bot initialization failed:', error);
        isConnecting = false;
        statusUpdater({
            connectionStatus: 'error',
            error: error.message
        });
        
        // Restart on error
        setTimeout(() => {
            isConnecting = false;
            startBot(statusUpdater);
        }, 15000);
    }
}

async function processPairingRequest(sock, statusUpdater) {
    if (!global.pendingPairingRequest || !sock) {
        return;
    }

    try {
        const phoneNumber = global.pendingPairingRequest;
        console.log(chalk.blue('🔢 Requesting pairing code for:'), phoneNumber);
        
        // Validasi nomor telepon sederhana
        if (!validatePhoneNumber(phoneNumber)) {
            throw new Error('Invalid phone number format. Please use international format without + (e.g., 6281234567890)');
        }

        // Pastikan koneksi sudah ready
        if (!sock.user) {
            console.log(chalk.yellow('⚠️ Waiting for connection to be ready...'));
            statusUpdater({
                connectionStatus: 'waiting_connection'
            });
            return;
        }

        statusUpdater({
            connectionStatus: 'requesting_pairing'
        });

        const pairingCode = await sock.requestPairingCode(phoneNumber);
        const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
        
        statusUpdater({
            pairingCode: formattedCode,
            qrCode: null,
            connectionStatus: 'enter_pairing'
        });
        
        console.log(chalk.green('✅ Pairing Code:'), formattedCode);
        
        // Clear the request setelah sukses
        global.pendingPairingRequest = null;
        
    } catch (error) {
        console.error('❌ Pairing error:', error);
        statusUpdater({
            connectionStatus: 'pairing_error',
            error: error.message
        });
        
        // Clear pending request pada error
        global.pendingPairingRequest = null;
        
        // Coba reconnect setelah pairing error
        setTimeout(() => {
            startBot(statusUpdater);
        }, 5000);
    }
}

async function sendWelcomeMessage(sock) {
    try {
        if (sock.user) {
            const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const welcomeMessage = `
🤖 *${global.botname} - Koyeb Deployment*

✅ Bot successfully connected!
🕒 ${new Date().toLocaleString()}
🌐 Server: ${process.env.KOYEB_PUBLIC_DOMAIN || 'Koyeb Cloud'}
📊 Status: Online and Ready
⚡ Version: ${settings.version}

*Features Available:*
• 🤖 AI Chat Assistant
• 📥 Media Downloader (YT, IG, TikTok)
• 🎮 Interactive Games
• 🔊 Voice Notes Support
• 🖼️ Sticker Creator
• 🎯 Button Menu System
• 🌟 Premium Features

Type !menu to see all commands.
            `;
            
            await sock.sendMessage(botNumber, { 
                text: welcomeMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true
                }
            }).catch(error => {
                console.log('Note: Could not send welcome message', error.message);
            });
        }
    } catch (error) {
        console.error('Error sending welcome message:', error);
    }
}

// Function untuk manual pairing request
async function requestPairing(phoneNumber, statusUpdater) {
    try {
        global.pendingPairingRequest = phoneNumber;
        
        // Jika bot sudah connected, process immediately
        if (sock && sock.user) {
            await processPairingRequest(sock, statusUpdater);
        } else {
            // Jika belum connected, restart bot
            console.log(chalk.yellow('🔄 Restarting bot for pairing request...'));
            statusUpdater({
                connectionStatus: 'restarting_for_pairing'
            });
            
            if (sock) {
                sock.ev.removeAllListeners();
                if (sock.ws) sock.ws.close();
            }
            
            setTimeout(() => {
                startBot(statusUpdater);
            }, 3000);
        }
        
        return { success: true, message: 'Pairing request queued' };
    } catch (error) {
        console.error('Pairing request error:', error);
        return { success: false, message: error.message };
    }
}

// Export functions
module.exports = { 
    startBot, 
    requestPairing,
    sock: () => sock,
    validatePhoneNumber
};
