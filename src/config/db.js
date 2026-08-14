import mongoose from "mongoose";
import { env } from "./env.js";

async function connectToDatabase() {
    const mongoUri = env.mongoUri || process.env.MONGO_URI || process.env.MONGO_DB_URL;
    if (!mongoUri) {
        console.error("❌ MongoDB connection error: MONGO_URI environment variable is not defined");
        throw new Error("MONGO_URI environment variable is not defined");
    }
    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Successfully connected to MongoDB");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err);
        throw err;
    }
}

export default connectToDatabase;