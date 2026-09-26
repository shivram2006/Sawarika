import crypto from "crypto";
import Otp from "../models/Otp.js";
import User from "../models/User.js";
import { signToken } from "../utils/jwt.js";

const PHONE_RE = /^[6-9]\d{9}$/;
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashOtp = (phone, otp) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${phone}:${otp}`)
    .digest("hex");

export const sendOtp = async (req, res) => {
  const phone = String(req.body?.phone ?? "");
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ message: "Enter a valid 10-digit mobile number" });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const now = Date.now();

  try {
    // Filter only matches if the previous OTP is older than 60 sec.
    // If it doesn't match, upsert tries an insert and the unique phone index throws a duplicate key error.
    await Otp.findOneAndUpdate(
      { phone, lastSentAt: { $lte: new Date(now - RESEND_COOLDOWN_MS) } },
      {
        $set: {
          hash: hashOtp(phone, otp),
          expiresAt: new Date(now + OTP_TTL_MS),
          attempts: 0,
          lastSentAt: new Date(now),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(429).json({ message: "Please request a new OTP after 60 seconds" });
    }
    throw err;
  }

  // TODO: send the OTP via an SMS provider (MSG91 etc.) here
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV OTP] ${phone} -> ${otp}`);
  }

  res.json({ message: "OTP sent" });
};

export const verifyOtp = async (req, res) => {
  const { phone: rawPhone, otp: rawOtp, name } = req.body ?? {};
  const phone = String(rawPhone ?? "");
  const otp = String(rawOtp ?? "");
  if (!PHONE_RE.test(phone) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: "Phone or OTP is not valid" });
  }

  // Count the attempt atomically first, so parallel requests can't bypass the limit
  const record = await Otp.findOneAndUpdate(
    { phone, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  if (!record) {
    return res
      .status(400)
      .json({ message: "OTP expired or attempt limit reached, please request a new one" });
  }

  const expected = Buffer.from(record.hash);
  const given = Buffer.from(hashOtp(phone, otp));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return res.status(400).json({ message: "Incorrect OTP" });
  }

  // OTP should only work once: whoever deletes it wins the login
  const consumed = await Otp.findOneAndDelete({ phone, hash: record.hash });
  if (!consumed) {
    return res.status(400).json({ message: "This OTP has already been used" });
  }

  const cleanName = typeof name === "string" ? name.trim().slice(0, 60) : "";
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, name: cleanName || undefined });
  } else if (cleanName && !user.name) {
    user.name = cleanName;
    await user.save();
  }

  if (!user.isActive) {
    return res.status(403).json({ message: "This account is disabled" });
  }

  res.json({
    token: signToken(user),
    user: { id: user._id, name: user.name, phone: user.phone, role: user.role },
  });
};

export const me = async (req, res) => {
  const u = req.user;
  res.json({ id: u._id, name: u.name, phone: u.phone, role: u.role });
};
