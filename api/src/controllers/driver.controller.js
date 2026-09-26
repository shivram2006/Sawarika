import Driver from "../models/Driver.js";
import User from "../models/User.js";
import { VEHICLE_TYPES } from "../utils/fare.js";

const PLATE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
const STATUSES = ["pending", "approved", "rejected"];

export const registerDriver = async (req, res) => {
  const vehicle = req.body?.vehicle;
  const type = vehicle?.type;
  const number = String(vehicle?.number ?? "").replace(/[\s-]/g, "").toUpperCase();

  if (!VEHICLE_TYPES.includes(type)) {
    return res.status(400).json({ message: "Invalid vehicle type" });
  }
  if (!PLATE_RE.test(number)) {
    return res.status(400).json({ message: "Invalid vehicle number (e.g. RJ26CA1234)" });
  }
  if (req.user.role === "admin") {
    return res.status(400).json({ message: "An admin cannot become a driver" });
  }

  const existing = await Driver.findOne({ user: req.user._id }).select("_id");
  if (existing) {
    // In case a previous attempt failed midway, fix the role too
    if (req.user.role !== "driver") {
      await User.updateOne({ _id: req.user._id }, { role: "driver" });
    }
    return res.status(409).json({ message: "You are already registered" });
  }

  let driver;
  try {
    driver = await Driver.create({
      user: req.user._id,
      vehicle: {
        type,
        number,
        model: typeof vehicle.model === "string" ? vehicle.model.trim().slice(0, 40) : undefined,
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      const plateTaken = err.keyPattern?.["vehicle.number"];
      return res.status(409).json({
        message: plateTaken ? "This vehicle number is already registered" : "You are already registered",
      });
    }
    throw err;
  }

  await User.updateOne({ _id: req.user._id }, { role: "driver" });
  res.status(201).json(driver);
};

export const getMyDriver = async (req, res) => {
  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) return res.status(404).json({ message: "Driver profile not found" });
  res.json(driver);
};

export const setStatus = async (req, res) => {
  const { isOnline, lat, lng } = req.body ?? {};
  if (typeof isOnline !== "boolean") {
    return res.status(400).json({ message: "isOnline must be true or false" });
  }

  const update = { isOnline };
  if (isOnline) {
    const valid =
      Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    if (!valid) {
      return res.status(400).json({ message: "A valid location is required to go online" });
    }
    update.location = { type: "Point", coordinates: [lng, lat] };
  }

  // Check + update in a single query, no race condition
  const driver = await Driver.findOneAndUpdate(
    { user: req.user._id, verificationStatus: "approved" },
    update,
    { returnDocument: "after" }
  ).select("isOnline");

  if (!driver) {
    const exists = await Driver.exists({ user: req.user._id });
    return exists
      ? res.status(403).json({ message: "Your account is not verified yet" })
      : res.status(404).json({ message: "Driver profile not found" });
  }
  res.json({ isOnline: driver.isOnline });
};

// ---- Admin ----
export const listDrivers = async (req, res) => {
  const { status } = req.query;
  const filter =
    typeof status === "string" && STATUSES.includes(status) ? { verificationStatus: status } : {};
  const drivers = await Driver.find(filter).populate("user", "name phone").sort({ createdAt: -1 });
  res.json(drivers);
};

export const verifyDriver = async (req, res) => {
  const { status } = req.body ?? {};
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "status must be approved or rejected" });
  }

  const update = { verificationStatus: status };
  if (status === "rejected") update.isOnline = false;

  const driver = await Driver.findByIdAndUpdate(req.params.id, update, { returnDocument: "after" });
  if (!driver) return res.status(404).json({ message: "Driver not found" });
  res.json(driver);
};
