const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
    // If already connected, reuse connection
    if (isConnected) {
        return;
    }

    // Check environment variable
    if (!process.env.MONGO_URL) {
        console.error('❌ Error: MONGO_URL environment variable is not defined.');
        return;
    }

    try {
        const db = await mongoose.connect(process.env.MONGO_URL);

        isConnected = db.connections[0].readyState;
        console.log('✅ MongoDB Connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        throw error;
    }
};


module.exports = connectDB;