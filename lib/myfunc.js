const fs = require('fs');
const axios = require('axios');
const path = require('path');

const smsg = (sock, m, store) => {
    if (!m) return m;
    let M = proto.WebMessageInfo;
    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = m.key.fromMe;
        m.isGroup = m.chat.endsWith('@g.us');
        m.sender = sock.decodeJid(m.fromMe && sock.user.id || m.participant || m.key.participant || m.chat || '');
    }
    if (m.message) {
        m.type = getContentType(m.message);
        m.mtype = m.type;
        m.body = m.message.conversation || m.message[m.type]?.text || m.message[m.type]?.caption || m.message[m.type]?.contentText || m.type;
        m.msg = m.message[m.type];
        if (m.msg && m.msg.url) m.download = () => sock.downloadMediaMessage(m);
    }
    return m;
};

const getContentType = (message) => {
    return Object.keys(message)[0];
};

const isUrl = (url) => {
    return url.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/, 'gi'));
};

const getBuffer = async (url, options) => {
    try {
        const response = await axios({
            method: 'get',
            url,
            headers: {
                'DNT': 1,
                'Upgrade-Insecure-Request': 1
            },
            ...options,
            responseType: 'arraybuffer'
        });
        return response.data;
    } catch (error) {
        return null;
    }
};

const getSizeMedia = (buffer) => {
    return (buffer.length / 1024 / 1024).toFixed(2) + ' MB';
};

const generateMessageTag = (epoch) => {
    let tag = (0, exports.generateMessageTag)(epoch);
    return tag;
};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

const reSize = (buffer, width, height) => {
    return buffer; // Simple implementation
};

module.exports = {
    smsg,
    isUrl,
    getBuffer,
    getSizeMedia,
    generateMessageTag,
    sleep,
    reSize,
    fetch: axios.get,
    await: async (promise) => await promise
};
