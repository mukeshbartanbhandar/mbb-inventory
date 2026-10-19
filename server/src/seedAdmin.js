import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

if (!process.env.MONGO_URI || !process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  console.error("Set MONGO_URI, ADMIN_USERNAME and ADMIN_PASSWORD in server/.env");
  process.exit(1);
}
if (process.env.ADMIN_PASSWORD.length < 5) {
  console.error("For safety, ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });
const Admin = mongoose.model("Admin", adminSchema);

try {
  await mongoose.connect(process.env.MONGO_URI);
  const username = process.env.ADMIN_USERNAME.trim();
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await Admin.findOneAndUpdate(
    { username },
    { username, passwordHash },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`Admin "${username}" created/updated successfully.`);
} catch (error) {
  console.error("Could not seed admin:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
