import { Router } from "express";
import rateLimit from "express-rate-limit";
import { sendOtp, verifyOtp, me } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  message: { message: "Too many OTP requests, please try again later" },
});

router.post("/send-otp", otpLimiter, asyncHandler(sendOtp));
router.post("/verify-otp", otpLimiter, asyncHandler(verifyOtp));
router.get("/me", requireAuth, asyncHandler(me));

export default router;
