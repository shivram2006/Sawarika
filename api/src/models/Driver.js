import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    vehicle: {
      type: { type: String, enum: ["auto", "erickshaw", "bike", "car"], required: true },
      number: { type: String, required: true, uppercase: true, trim: true, unique: true },
      model: { type: String, trim: true },
    },
    documents: { licenseUrl: String, rcUrl: String, photoUrl: String },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    isOnline: { type: Boolean, default: false },
    // Location is only saved once the driver goes online
    location: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number], default: undefined }, // [longitude, latitude]
    },
  },
  { timestamps: true }
);

driverSchema.index({ location: "2dsphere" });

export default mongoose.model("Driver", driverSchema);
