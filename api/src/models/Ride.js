import mongoose from "mongoose";

const pointSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    location: {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
  },
  { _id: false }
);

const rideSchema = new mongoose.Schema(
  {
    rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", default: null },
    vehicleType: { type: String, enum: ["bike", "erickshaw", "auto", "car"], required: true },
    pickup: { type: pointSchema, required: true },
    drop: { type: pointSchema, required: true },
    distanceKm: Number,
    fare: { type: Number, required: true },
    status: {
      type: String,
      enum: ["requested", "accepted", "arrived", "started", "completed", "cancelled"],
      default: "requested",
    },
    pin: { type: String, required: true, select: false },
    bookedFor: { name: String, phone: String },
    cancelledBy: { type: String, enum: ["rider", "driver", "system"] },
    // Drivers this ride has already been offered to / who have passed on it (avoid re-offering)
    offeredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "Driver" }],
  },
  { timestamps: true }
);

rideSchema.index({ rider: 1, createdAt: -1 });
rideSchema.index({ driver: 1, status: 1 });
rideSchema.index({ "pickup.location": "2dsphere" }); // required for the $near query

export default mongoose.model("Ride", rideSchema);
