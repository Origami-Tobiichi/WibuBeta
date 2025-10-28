const { smsg, isUrl, getBuffer, getSizeMedia } = require('../lib/myfunc');
const fs = require('fs');
const axios = require('axios');
const chalk = require('chalk');

// Load data
const loadUsers = () => {
    try {
        if (fs.existsSync('./data/users.json')) {
            return JSON.parse(fs.readFileSync('./data/users.json'));
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
    return {};
};

const saveUsers = (users) => {
    try {
        fs.writeFileSync('./data/users.json', JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('Error saving users:', error);
    }
};

const loadPremium = () => {
    try {
        if (fs.existsSync('./data/premium.json')) {
            return JSON.parse(fs.readFileSync('./data/premium.json'));
        }
    } catch (error) {
        console.error('Error loading premium:', error);
    }
    return {};
};

const loadOwner = () => {
    try {
        if (fs.existsSync('./data/owner.json')) {
            return JSON.parse(fs.readFileSync('./data/owner.json'));
        }
    } catch (error) {
        console.error('Error loading owner:', error);
    }
    return [];
};

async function handleMessages(sock, chatUpdate, isMe) {
    try {
        const m = chatUpdate.messages[0];
        if (!m.message) return;
        
        const jam = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        const body = (type === 'conversation') ? m.message.conversation : 
                    (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : '';
        
        // Skip if message is from bot itself
        if (m.key.fromMe) return;
        
        console.log(chalk.blue(`📨 Message from ${from}: ${body || type}`));
        
        // Update user data
        const users = loadUsers();
        const user = users[from] || { id: from, messageCount: 0, lastActive: jam };
        user.messageCount = (user.messageCount || 0) + 1;
        user.lastActive = jam;
        users[from] = user;
        saveUsers(users);
        
        // Update global stats
        if (global.botState && global.botState.stats) {
            global.botState.stats.messagesProcessed++;
        }
        
        // Handle commands
        await handleCommand(sock, m, from, body, type);
        
    } catch (error) {
        console.error('Error in handleMessages:', error);
    }
}

async function handleCommand(sock, m, from, body, type) {
    if (!body) return;
    
    const command = body.toLowerCase().trim();
    const args = body.slice(command.length).trim().split(' ');
    const pushname = m.pushName || 'User';
    
    // Button template untuk menu
    const menuButtons = {
        text: `🎮 *${global.botname || 'KNIGHT BOT'} MENU*\n\nPilih salah satu fitur di bawah:`,
        footer: `⚡ Version: ${require('../settings').version || '3.0.0'}`,
        templateButtons: [
            {index: 1, urlButton: {displayText: '🌐 Website', url: 'https://koyeb.com'}},
            {index: 2, quickReplyButton: {displayText: '🤖 AI Chat', id: '!ai'}},
            {index: 3, quickReplyButton: {displayText: '📥 Downloader', id: '!download'}},
            {index: 4, quickReplyButton: {displayText: '🎮 Games', id: '!game'}},
            {index: 5, quickReplyButton: {displayText: '🔊 Voice', id: '!voice'}},
            {index: 6, quickReplyButton: {displayText: '🖼️ Sticker', id: '!sticker'}}
        ]
    };
    
    // Button template untuk downloader
    const downloadButtons = {
        text: `📥 *MEDIA DOWNLOADER*\n\nPilih platform download:`,
        footer: `${global.themeemoji || '⚡'} Knight Bot Downloader`,
        templateButtons: [
            {index: 1, quickReplyButton: {displayText: '🎥 YouTube', id: '!yt'}},
            {index: 2, quickReplyButton: {displayText: '📷 Instagram', id: '!ig'}},
            {index: 3, quickReplyButton: {displayText: '🎵 TikTok', id: '!tiktok'}},
            {index: 4, quickReplyButton: {displayText: '🔊 YouTube Music', id: '!ytmusic'}},
            {index: 5, quickReplyButton: {displayText: '📱 YouTube Shorts', id: '!ytshorts'}},
            {index: 6, quickReplyButton: {displayText: '🔙 Back to Menu', id: '!menu'}}
        ]
    };
    
    // Button template untuk games
    const gameButtons = {
        text: `🎮 *GAMES MENU*\n\nPilih game yang ingin dimainkan:`,
        footer: `${global.themeemoji || '⚡'} Knight Bot Games`,
        templateButtons: [
            {index: 1, quickReplyButton: {displayText: '🧠 Quiz', id: '!quiz'}},
            {index: 2, quickReplyButton: {displayText: '🎯 Tebak Angka', id: '!tebakangka'}},
            {index: 3, quickReplyButton: {displayText: '📚 Tebak Kata', id: '!tebakkata'}},
            {index: 4, quickReplyButton: {displayText: '🎰 Slot', id: '!slot'}},
            {index: 5, quickReplyButton: {displayText: '🎲 Dadu', id: '!dadu'}},
            {index: 6, quickReplyButton: {displayText: '🔙 Back to Menu', id: '!menu'}}
        ]
    };

    try {
        switch (command) {
            case '!menu':
            case '.menu':
            case 'menu':
                await sock.sendMessage(from, menuButtons);
                break;
                
            case '!download':
                await sock.sendMessage(from, downloadButtons);
                break;
                
            case '!game':
                await sock.sendMessage(from, gameButtons);
                break;
                
            case '!ai':
                await sock.sendMessage(from, {
                    text: `🤖 *AI CHAT*\n\nFitur AI chat sedang dalam pengembangan. Silakan gunakan perintah:\n\n• !ai pertanyaan_anda - Untuk chat dengan AI\n• !image prompt_anda - Untuk generate gambar AI`
                });
                break;
                
            case '!sticker':
                if (m.message.imageMessage || (m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.quotedMessage && m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage)) {
                    await sock.sendMessage(from, {
                        text: '🖼️ Silakan reply gambar dengan caption !sticker untuk membuat stiker'
                    });
                } else {
                    await sock.sendMessage(from, {
                        text: '📌 Cara membuat stiker:\n1. Kirim gambar\n2. Reply gambar tersebut dengan caption !sticker'
                    });
                }
                break;
                
            case '!voice':
                await sock.sendMessage(from, {
                    text: `🔊 *VOICE FEATURES*\n\n• !tts teks - Convert text to speech\n• Kirim voice note untuk direspon AI\n• Voice note support aktif!`
                });
                break;
                
            case '!info':
                const users = loadUsers();
                const userCount = Object.keys(users).length;
                await sock.sendMessage(from, {
                    text: `🤖 *BOT INFORMATION*\n\n• Nama: ${global.botname || 'KNIGHT BOT'}\n• Version: ${require('../settings').version || '3.0.0'}\n• Platform: Koyeb\n• Total Users: ${userCount}\n• Status: Connected ✅\n• Server: ${process.env.KOYEB_PUBLIC_DOMAIN || 'Koyeb Cloud'}\n\nType !menu untuk melihat semua fitur.`
                });
                break;
                
            case '!ping':
                const start = Date.now();
                await sock.sendMessage(from, { text: '🏓 Pinging...' });
                const latency = Date.now() - start;
                await sock.sendMessage(from, {
                    text: `🏓 Pong!\n• Latency: ${latency}ms\n• Server: ${process.env.KOYEB_PUBLIC_DOMAIN || 'Koyeb'}\n• Status: ✅ Connected`
                });
                break;
                
            case '!owner':
                const owners = loadOwner();
                await sock.sendMessage(from, {
                    text: `👑 *BOT OWNER*\n\n• Creator: MR UNIQUE HACKER\n• YouTube: MR UNIQUE HACKER\n• GitHub: mrunqiuehacker\n\nUntuk kerjasama atau pertanyaan, hubungi owner.`
                });
                break;
                
            default:
                // Auto-response untuk pesan biasa
                if (body && !body.startsWith('!') && !body.startsWith('.') && !body.startsWith('/')) {
                    const responses = [
                        `Halo ${pushname}! 👋 Ketik !menu untuk melihat semua fitur bot.`,
                        `Hai ${pushname}! 🤖 Bot siap membantu. Gunakan !menu untuk pilihan.`,
                        `Halo! 🎯 Gunakan perintah !menu untuk mengakses fitur-fitur bot.`
                    ];
                    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                    
                    // Only respond sometimes to avoid spam
                    if (Math.random() < 0.3) {
                        await sock.sendMessage(from, { text: randomResponse });
                    }
                }
                break;
        }
    } catch (error) {
        console.error('Error handling command:', error);
        await sock.sendMessage(from, {
            text: '❌ Terjadi error saat memproses perintah. Silakan coba lagi.'
        });
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action } = update;
        
        for (const participant of participants) {
            if (action === 'add') {
                await sock.sendMessage(id, {
                    text: `👋 Welcome @${participant.split('@')[0]} to the group!\n\nGunakan !menu untuk melihat fitur bot.`,
                    mentions: [participant]
                });
            } else if (action === 'remove') {
                await sock.sendMessage(id, {
                    text: `👋 Goodbye @${participant.split('@')[0]}!`
                });
            }
        }
    } catch (error) {
        console.error('Error in group participant update:', error);
    }
}

async function handleStatus(sock, chatUpdate) {
    try {
        // Handle status updates
        console.log('Status update received');
    } catch (error) {
        console.error('Error handling status:', error);
    }
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus
};
