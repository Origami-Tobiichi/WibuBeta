const fs = require('fs');
const path = require('path');

async function handleMessages(sock, chatUpdate) {
    // Basic message handler
    // Anda bisa mengembangkan ini sesuai kebutuhan
    console.log('Message received:', chatUpdate.messages[0]);
}

module.exports = { handleMessages };