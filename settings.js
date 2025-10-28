module.exports = {
    botname: "KNIGHT BOT",
    version: "3.0.0",
    ownerNumber: "628xxxxxxxx", // Ganti dengan nomor owner
    themeemoji: "⚡",
    
    // AI Configuration
    openaiKey: process.env.OPENAI_API_KEY || "",
    
    // Premium Features
    premiumPrice: "Rp 20.000",
    premiumDuration: "30 days",
    
    // Web Server
    port: process.env.PORT || 3000,
    
    // Features Toggle
    features: {
        ai: true,
        games: true,
        downloads: true,
        nsfw: false,
        voiceNotes: true
    }
};