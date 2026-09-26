import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { registerDriver, getMyDriver, setStatus } from "../controllers/driver.controller.js";

const router = Router();
router.post("/register", requireAuth, asyncHandler(registerDriver));
router.get("/me", requireAuth, requireRole("driver"), asyncHandler(getMyDriver));
router.patch("/status", requireAuth, requireRole("driver"), asyncHandler(setStatus));
export default router;
