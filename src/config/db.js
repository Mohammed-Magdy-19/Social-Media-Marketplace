import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

async function connectToDatabase() {
    await mongoose.connect(process.env.MONGO_DB_URL).then(() => console.log("✅ Successfully connected to MongoDB"))
        .catch((err) => console.error("❌ MongoDB connection error:", err));;
}

export default connectToDatabase;