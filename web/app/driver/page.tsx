"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

type NearbyRide = {
  _id: string;
  vehicleType: string;
  distanceKm: number;
  fare: number;
  pickup: { address?: string };
  drop: { address?: string };
};

type ActiveRide = {
  _id: string;
  status: "accepted" | "arrived" | "started";
  fare: number;
  distanceKm: number;
};

const POLL_MS = 5000;

export default function DriverPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();

  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nearby, setNearby] = useState<NearbyRide[]>([]);
  const [activeRide, setActiveRide] = useState<ActiveRide | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [busyRideId, setBusyRideId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !token) router.push("/login");
  }, [loading, token, router]);

  const goOnline = async () => {
    setError(null);
    setTogglingOnline(true);
    try {
      if (!navigator.geolocation) {
        setError("This device does not support location");
        return;
      }
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      await api<{ isOnline: boolean }>("/drivers/status", {
        method: "PATCH",
        token,
        body: { isOnline: true, lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
      setIsOnline(true);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not get location, please turn on GPS");
    } finally {
      setTogglingOnline(false);
    }
  };

  const goOffline = async () => {
    setTogglingOnline(true);
    try {
      await api<{ isOnline: boolean }>("/drivers/status", {
        method: "PATCH",
        token,
        body: { isOnline: false },
      });
      setIsOnline(false);
      setNearby([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not go offline");
    } finally {
      setTogglingOnline(false);
    }
  };

  const fetchNearby = useCallback(async () => {
    if (!token || !isOnline || activeRide) return;
    try {
      const res = await api<NearbyRide[]>("/rides/nearby", { token });
      setNearby(res);
    } catch {
      // the next poll will retry
    }
  }, [token, isOnline, activeRide]);

  useEffect(() => {
    if (!isOnline) return;
    fetchNearby();
    pollRef.current = setInterval(fetchNearby, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOnline, fetchNearby]);

  const acceptRide = async (rideId: string) => {
    setBusyRideId(rideId);
    setError(null);
    try {
      const res = await api<ActiveRide>(`/rides/${rideId}/accept`, { method: "POST", token });
      setActiveRide(res);
      setNearby([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the ride");
      fetchNearby();
    } finally {
      setBusyRideId(null);
    }
  };

  const startRide = async () => {
    if (!activeRide) return;
    setError(null);
    try {
      const res = await api<{ id: string; status: ActiveRide["status"] }>(
        `/rides/${activeRide._id}/start`,
        { method: "POST", token, body: { pin: pinInput } }
      );
      setActiveRide({ ...activeRide, status: res.status });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incorrect PIN");
    }
  };

  const completeRide = async () => {
    if (!activeRide) return;
    try {
      await api(`/rides/${activeRide._id}/complete`, { method: "POST", token });
      setActiveRide(null);
      setPinInput("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete the ride");
    }
  };

  if (loading || !token) return null;

  return (
    <main className="min-h-screen bg-ink px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-cream">Sawarika Driver</h1>
            <p className="text-cream/50 text-sm">Hi, {user?.name || user?.phone}</p>
          </div>
          <button
            onClick={isOnline ? goOffline : goOnline}
            disabled={togglingOnline}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              isOnline ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-cream/70"
            }`}
          >
            {togglingOnline ? "..." : isOnline ? "Online" : "Offline"}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {activeRide ? (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
            <p className="text-cream/60 text-sm">
              {activeRide.status === "accepted" ? "Head to the pickup point" : "Ride in progress"}
            </p>
            <p className="text-3xl font-bold text-amber">₹{activeRide.fare}</p>
            <p className="text-cream/50 text-sm">{activeRide.distanceKm} km</p>

            {activeRide.status === "accepted" && (
              <div className="space-y-2">
                <input
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter the rider's PIN"
                  maxLength={4}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-lg tracking-widest text-cream placeholder:text-cream/30"
                />
                <button
                  onClick={startRide}
                  className="w-full rounded-xl bg-amber text-ink font-semibold py-3"
                >
                  Start ride
                </button>
              </div>
            )}

            {activeRide.status === "started" && (
              <button
                onClick={completeRide}
                className="w-full rounded-xl bg-amber text-ink font-semibold py-3"
              >
                Complete ride
              </button>
            )}
          </div>
        ) : !isOnline ? (
          <p className="text-cream/50 text-center py-12">
            Go online to see new ride requests
          </p>
        ) : nearby.length === 0 ? (
          <p className="text-cream/50 text-center py-12">No ride requests right now...</p>
        ) : (
          <div className="space-y-3">
            {nearby.map((r) => (
              <div key={r._id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-amber font-bold text-lg">₹{r.fare}</p>
                  <p className="text-cream/50 text-sm">{r.distanceKm} km</p>
                </div>
                <button
                  onClick={() => acceptRide(r._id)}
                  disabled={busyRideId === r._id}
                  className="w-full rounded-xl bg-amber text-ink font-semibold py-2.5 disabled:opacity-50"
                >
                  {busyRideId === r._id ? "Accepting..." : "Accept"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
