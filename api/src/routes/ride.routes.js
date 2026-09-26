import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  estimateFare,
  requestRide,
  getNearbyRequests,
  acceptRide,
  getRide,
  startRide,
  completeRide,
  cancelRide,
} from "../controllers/ride.controller.js";

const router = Router();

const estimateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => String(req.user._id),
  message: { message: "Too many requests, please slow down" },
});

router.post("/estimate", requireAuth, estimateLimiter, asyncHandler(estimateFare));
router.post("/", requireAuth, requireRole("rider", "admin"), asyncHandler(requestRide));
router.get("/nearby", requireAuth, requireRole("driver"), asyncHandler(getNearbyRequests));
router.post("/:id/accept", requireAuth, requireRole("driver"), asyncHandler(acceptRide));
router.post("/:id/start", requireAuth, requireRole("driver"), asyncHandler(startRide));
router.post("/:id/complete", requireAuth, requireRole("driver"), asyncHandler(completeRide));
router.post("/:id/cancel", requireAuth, asyncHandler(cancelRide));
router.get("/:id", requireAuth, asyncHandler(getRide));

export default router;
