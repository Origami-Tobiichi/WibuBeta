const { makeInMemoryStore } = require('@whiskeysockets/baileys');

const store = makeInMemoryStore({ 
    logger: {
        level: 'silent'
    }
});

module.exports = store;