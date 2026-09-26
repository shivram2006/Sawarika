"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp, useAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api";

const PHONE_RE = /^[6-9]\d{9}$/;

export default function LoginPage() {
  const router = useRouter();
  const { loginWithToken } = useAuth();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const sendOtp = async () => {
    setError(null);
    if (!PHONE_RE.test(phone)) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setBusy(true);
    try {
      await requestOtp(phone);
      setStep("otp");
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send OTP, please try again");
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit OTP");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyOtp(phone, otp, name || undefined);
      loginWithToken(res.token, res.user);
      router.push(res.user.role === "driver" ? "/driver" : "/book");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify OTP, please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-cream mb-1">Sawarika</h1>
        <p className="text-cream/60 mb-8">Your ride, in your town</p>

        {step === "phone" ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm text-cream/70 mb-1">
                Mobile number
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="9876543210"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-lg text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={sendOtp}
              disabled={busy}
              className="w-full rounded-xl bg-amber text-ink font-semibold py-3 text-lg disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send OTP"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-cream/70 text-sm">
              OTP sent to {phone}.{" "}
              <button
                onClick={() => setStep("phone")}
                className="text-amber underline underline-offset-2"
              >
                change number
              </button>
            </p>
            <div>
              <label htmlFor="otp" className="block text-sm text-cream/70 mb-1">
                OTP
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-lg tracking-widest text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm text-cream/70 mb-1">
                Name (first time only)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-lg text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={confirmOtp}
              disabled={busy}
              className="w-full rounded-xl bg-amber text-ink font-semibold py-3 text-lg disabled:opacity-50"
            >
              {busy ? "Verifying..." : "Log in"}
            </button>
            <button
              onClick={sendOtp}
              disabled={cooldown > 0 || busy}
              className="w-full text-center text-cream/50 text-sm disabled:opacity-40"
            >
              {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
