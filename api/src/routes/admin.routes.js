import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { listDrivers, verifyDriver } from "../controllers/driver.controller.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/drivers", asyncHandler(listDrivers));
router.patch(
  "/drivers/:id/verify",
  (req, res, next) =>
    mongoose.isValidObjectId(req.params.id)
      ? next()
      : res.status(400).json({ message: "Invalid driver id" }),
  asyncHandler(verifyDriver)
);

export default router;
