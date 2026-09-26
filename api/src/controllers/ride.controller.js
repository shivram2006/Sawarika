import mongoose from "mongoose";
import crypto from "crypto";
import Ride from "../models/Ride.js";
import Driver from "../models/Driver.js";
import { getRoadDistanceKm, calcFare, VEHICLE_TYPES } from "../utils/fare.js";

const validPoint = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

const toGeo = (p) => ({
  address: typeof p.address === "string" ? p.address.trim().slice(0, 200) : undefined,
  location: { type: "Point", coordinates: [p.lng, p.lat] },
});

const OFFER_RADIUS_M = 5000; // offer to drivers within 5 km
const MAX_OFFER_BATCH = 5;

export const estimateFare = async (req, res) => {
  const { pickup, drop } = req.body ?? {};
  if (!validPoint(pickup) || !validPoint(drop)) {
    return res.status(400).json({ message: "Enter a valid pickup and drop location" });
  }
  const { km, source } = await getRoadDistanceKm(pickup, drop);
  const estimates = VEHICLE_TYPES.map((type) => ({ type, fare: calcFare(type, km) }));
  res.json({ distanceKm: Math.round(km * 10) / 10, source, estimates });
};

// ---- Rider: create a ride request ----
export const requestRide = async (req, res) => {
  const { pickup, drop, vehicleType, bookedFor } = req.body ?? {};

  if (!VEHICLE_TYPES.includes(vehicleType)) {
    return res.status(400).json({ message: "Invalid vehicle type" });
  }
  if (!validPoint(pickup) || !validPoint(drop)) {
    return res.status(400).json({ message: "Enter a valid pickup and drop location" });
  }

  // Don't allow a new ride if the rider already has one active
  const active = await Ride.exists({
    rider: req.user._id,
    status: { $in: ["requested", "accepted", "arrived", "started"] },
  });
  if (active) {
    return res.status(409).json({ message: "You already have an active ride" });
  }

  const { km } = await getRoadDistanceKm(pickup, drop);
  const fare = calcFare(vehicleType, km);
  const pin = String(crypto.randomInt(1000, 10000));

  let cleanBookedFor;
  if (bookedFor?.phone) {
    const phone = String(bookedFor.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ message: "The number for the person you're booking for is invalid" });
    }
    cleanBookedFor = {
      name: typeof bookedFor.name === "string" ? bookedFor.name.trim().slice(0, 60) : undefined,
      phone,
    };
  }

  const ride = await Ride.create({
    rider: req.user._id,
    vehicleType,
    pickup: toGeo(pickup),
    drop: toGeo(drop),
    distanceKm: Math.round(km * 10) / 10,
    fare,
    pin,
    bookedFor: cleanBookedFor,
  });

  res.status(201).json({
    id: ride._id,
    status: ride.status,
    fare: ride.fare,
    distanceKm: ride.distanceKm,
    pin: ride.pin, // must be shown to the rider, never to the driver
  });
};

// ---- Driver: view nearby offered rides ----
export const getNearbyRequests = async (req, res) => {
  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) return res.status(404).json({ message: "Driver profile not found" });
  if (!driver.isOnline) {
    return res.status(403).json({ message: "Go online first" });
  }

  const rides = await Ride.find({
    status: "requested",
    vehicleType: driver.vehicle.type,
    offeredTo: { $ne: driver._id },
    "pickup.location": {
      $near: {
        $geometry: driver.location,
        $maxDistance: OFFER_RADIUS_M,
      },
    },
  })
    .limit(MAX_OFFER_BATCH)
    .select("-pin");

  // Mark as offered so it isn't listed again (soft claim, accept does the final lock)
  if (rides.length) {
    await Ride.updateMany(
      { _id: { $in: rides.map((r) => r._id) } },
      { $addToSet: { offeredTo: driver._id } }
    );
  }

  res.json(rides);
};

// ---- Driver: accept a ride (atomic, race-safe) ----
export const acceptRide = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }

  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) return res.status(404).json({ message: "Driver profile not found" });
  if (!driver.isOnline) return res.status(403).json({ message: "Go online first" });

  // The status: "requested" condition is what prevents the race:
  // if two drivers accept at the same time, only one update will match
  const ride = await Ride.findOneAndUpdate(
    { _id: id, status: "requested", vehicleType: driver.vehicle.type },
    { $set: { driver: driver._id, status: "accepted" } },
    { returnDocument: "after" }
  ).select("-pin");

  if (!ride) {
    return res.status(409).json({ message: "This ride is no longer available" });
  }

  res.json(ride);
};

// ---- Rider/Driver: check ride status ----
export const getRide = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }

  const ride = await Ride.findById(id).select("-pin");
  if (!ride) return res.status(404).json({ message: "Ride not found" });

  const driver = req.user.role === "driver" ? await Driver.findOne({ user: req.user._id }) : null;
  const isOwner =
    String(ride.rider) === String(req.user._id) ||
    (driver && ride.driver && String(ride.driver) === String(driver._id));
  if (!isOwner && req.user.role !== "admin") {
    return res.status(403).json({ message: "You don't have access to this" });
  }

  res.json(ride);
};

// ---- Driver: start the ride with the PIN ----
export const startRide = async (req, res) => {
  const { id } = req.params;
  const { pin } = req.body ?? {};
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }

  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) return res.status(404).json({ message: "Driver profile not found" });

  const ride = await Ride.findOne({ _id: id, driver: driver._id, status: "accepted" }).select("+pin");
  if (!ride) {
    return res.status(404).json({ message: "This ride is not in the accepted state" });
  }

  const expected = Buffer.from(String(ride.pin));
  const given = Buffer.from(String(pin ?? ""));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return res.status(400).json({ message: "Incorrect PIN" });
  }

  ride.status = "started";
  await ride.save();
  res.json({ id: ride._id, status: ride.status });
};

// ---- Driver: complete the ride ----
export const completeRide = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }

  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) return res.status(404).json({ message: "Driver profile not found" });

  const ride = await Ride.findOneAndUpdate(
    { _id: id, driver: driver._id, status: "started" },
    { $set: { status: "completed" } },
    { returnDocument: "after" }
  ).select("-pin");

  if (!ride) return res.status(404).json({ message: "This ride is not in the started state" });
  res.json(ride);
};

// ---- Rider or Driver: cancel ----
export const cancelRide = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid ride id" });
  }

  const isRider = req.user.role === "rider" || req.user.role === "admin";
  const driver = req.user.role === "driver" ? await Driver.findOne({ user: req.user._id }) : null;

  const filter = { _id: id, status: { $in: ["requested", "accepted", "arrived"] } };
  if (driver) filter.driver = driver._id;
  else filter.rider = req.user._id;

  const ride = await Ride.findOneAndUpdate(
    filter,
    { $set: { status: "cancelled", cancelledBy: driver ? "driver" : "rider" } },
    { returnDocument: "after" }
  ).select("-pin");

  if (!ride) {
    return res.status(404).json({ message: "This ride cannot be cancelled (it has already moved forward)" });
  }
  res.json(ride);
};
