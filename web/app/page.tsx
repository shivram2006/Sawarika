"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.ok ? `API connected (${data.app})` : "API error"))
      .catch(() => setStatus("API not reachable"));
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3">
      <h1 className="text-4xl font-bold">Sawarika</h1>
      <p className="text-gray-500">Apni sawari, apne shehar me</p>
      <p className="text-sm">{status}</p>
    </main>
  );
}