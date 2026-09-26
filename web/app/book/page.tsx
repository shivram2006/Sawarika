"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import LocationPicker, { type LatLng } from "../../components/LocationPicker";

type VehicleType = "bike" | "erickshaw" | "auto" | "car";

type Estimate = {
  distanceKm: number;
  source: string;
  estimates: { type: VehicleType; fare: number }[];
};

type RideCreated = {
  id: string;
  status: string;
  fare: number;
  distanceKm: number;
  pin: string;
};

type RideStatus = {
  _id: string;
  status: "requested" | "accepted" | "arrived" | "started" | "completed" | "cancelled";
  fare: number;
  distanceKm: number;
  driver?: string | null;
};

const VEHICLE_LABEL: Record<VehicleType, string> = {
  bike: "Bike",
  erickshaw: "E-Rickshaw",
  auto: "Auto",
  car: "Car",
};

const POLL_MS = 3000;

export default function BookPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [drop, setDrop] = useState<LatLng | null>(null);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ride, setRide] = useState<RideCreated | null>(null);
  const [rideStatus, setRideStatus] = useState<RideStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  const parsedPoints = useCallback(() => {
    if (!pickup || !drop) return null;
    return { pickup, drop };
  }, [pickup, drop]);

  const getEstimate = async () => {
    setError(null);
    const points = parsedPoints();
    if (!points) {
      setError("Enter a valid pickup and drop location");
      return;
    }
    setEstimating(true);
    try {
      const res = await api<Estimate>("/rides/estimate", { method: "POST", body: points, token });
      setEstimate(res);
      setSelectedVehicle(res.estimates[0]?.type ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not get an estimate");
    } finally {
      setEstimating(false);
    }
  };

  const requestRide = async () => {
    setError(null);
    const points = parsedPoints();
    if (!points || !selectedVehicle) return;
    setRequesting(true);
    try {
      const res = await api<RideCreated>("/rides", {
        method: "POST",
        body: { ...points, vehicleType: selectedVehicle },
        token,
      });
      setRide(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not book the ride");
    } finally {
      setRequesting(false);
    }
  };

  // Poll ride status once a ride has been created
  useEffect(() => {
    if (!ride || !token) return;

    const poll = async () => {
      try {
        const res = await api<RideStatus>(`/rides/${ride.id}`, { token });
        setRideStatus(res);
        if (["completed", "cancelled"].includes(res.status) && pollRef.current) {
          clearInterval(pollRef.current);
        }
      } catch {
        // one failed poll is fine, the next one will retry
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [ride, token]);

  const cancelRide = async () => {
    if (!ride || !token) return;
    try {
      await api(`/rides/${ride.id}/cancel`, { method: "POST", token });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel the ride");
    }
  };

  if (loading || !token) return null;

  return (
    <main className="min-h-screen bg-ink px-4 py-8">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-cream">Sawarika</h1>
            <p className="text-cream/50 text-sm">Hi, {user?.name || user?.phone}</p>
          </div>
        </div>

        {ride ? (
          <RideStatusCard
            ride={ride}
            status={rideStatus}
            onCancel={cancelRide}
            onNewRide={() => {
              setRide(null);
              setRideStatus(null);
              setEstimate(null);
            }}
          />
        ) : (
          <div className="space-y-5">
            <LocationPicker label="Pickup" value={pickup} onChange={(p) => setPickup(p)} />
            <LocationPicker label="Drop" value={drop} onChange={(p) => setDrop(p)} />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={getEstimate}
              disabled={estimating}
              className="w-full rounded-xl bg-white/10 text-cream font-medium py-3 disabled:opacity-50"
            >
              {estimating ? "Calculating..." : "Get fare estimate"}
            </button>

            {estimate && (
              <div className="space-y-3">
                <p className="text-cream/60 text-sm">
                  Distance: about {estimate.distanceKm} km
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {estimate.estimates.map((e) => (
                    <button
                      key={e.type}
                      onClick={() => setSelectedVehicle(e.type)}
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                        selectedVehicle === e.type
                          ? "border-amber bg-amber/10"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <p className="text-cream font-medium">{VEHICLE_LABEL[e.type]}</p>
                      <p className="text-amber font-semibold">₹{e.fare}</p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={requestRide}
                  disabled={requesting || !selectedVehicle}
                  className="w-full rounded-xl bg-amber text-ink font-semibold py-3 text-lg disabled:opacity-50"
                >
                  {requesting ? "Booking..." : "Book ride"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}


const STATUS_LABEL: Record<RideStatus["status"], string> = {
  requested: "Looking for a driver...",
  accepted: "Driver is on the way",
  arrived: "Driver has arrived",
  started: "Ride in progress",
  completed: "Ride completed",
  cancelled: "Ride cancelled",
};

function RideStatusCard({
  ride,
  status,
  onCancel,
  onNewRide,
}: {
  ride: RideCreated;
  status: RideStatus | null;
  onCancel: () => void;
  onNewRide: () => void;
}) {
  const current = status?.status ?? "requested";
  const canCancel = ["requested", "accepted", "arrived"].includes(current);
  const isFinal = current === "completed" || current === "cancelled";

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
      <p className="text-cream/60 text-sm">{STATUS_LABEL[current]}</p>
      <p className="text-3xl font-bold text-amber">₹{ride.fare}</p>
      <p className="text-cream/50 text-sm">{ride.distanceKm} km</p>

      {current === "requested" && (
        <div className="rounded-xl bg-amber/10 border border-amber/30 px-4 py-3">
          <p className="text-cream/60 text-xs mb-1">Share this PIN with the driver</p>
          <p className="text-2xl font-bold text-amber tracking-widest">{ride.pin}</p>
        </div>
      )}

      {isFinal ? (
        <button
          onClick={onNewRide}
          className="w-full rounded-xl bg-amber text-ink font-semibold py-3"
        >
          Book a new ride
        </button>
      ) : (
        canCancel && (
          <button
            onClick={onCancel}
            className="w-full rounded-xl bg-white/10 text-cream/80 font-medium py-3"
          >
            Cancel ride
          </button>
        )
      )}
    </div>
  );
}
