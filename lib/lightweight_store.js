const { makeInMemoryStore } = require('@whiskeysockets/baileys');

const store = makeInMemoryStore({ 
    logger: {
        level: 'silent'
    }
});

// Tambahkan fungsi untuk kompatibilitas
store.readFromFile = () => {
    console.log('📖 Store initialized');
};

store.writeToFile = () => {
    // Simpan state store jika diperlukan
};

module.exports = store;
