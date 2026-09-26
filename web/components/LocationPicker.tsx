"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { LatLngExpression } from "leaflet";

export type LatLng = { lat: number; lng: number };

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

// Leaflet reads `window`, so the map itself must never render during SSR
const MapView = dynamic(() => import("./MapView"), { ssr: false });

const DEFAULT_CENTER: LatLng = { lat: 26.1667, lng: 75.79 }; // Tonk, Rajasthan
const SEARCH_DEBOUNCE_MS = 400;

export default function LocationPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LatLng | null;
  onChange: (point: LatLng, address?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", query);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "5");
        url.searchParams.set("countrycodes", "in");
        const res = await fetch(url.toString(), { signal: controller.signal });
        const data = (await res.json()) as SearchResult[];
        setResults(data);
      } catch {
        // request was aborted or the network failed; leave old results as-is
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const pickResult = (r: SearchResult) => {
    const point = { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
    onChange(point, r.display_name);
    setQuery(r.display_name);
    setResults([]);
    setShowResults(false);
  };

  const pickOnMap = useCallback(
    (point: LatLng) => {
      onChange(point);
      setQuery(`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
      setShowResults(false);
    },
    [onChange]
  );

  const center: LatLngExpression = value ? [value.lat, value.lng] : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  return (
    <div className="space-y-2">
      <p className="text-sm text-cream/70">{label}</p>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder="Search a place or landmark"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-cream placeholder:text-cream/30 focus:outline-none focus:ring-2 focus:ring-amber"
        />
        {showResults && (searching || results.length > 0) && (
          <div className="absolute z-[1000] mt-1 w-full rounded-xl bg-[#26243a] border border-white/10 overflow-hidden shadow-lg">
            {searching && <p className="px-4 py-2 text-cream/40 text-sm">Searching...</p>}
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pickResult(r)}
                className="w-full text-left px-4 py-2 text-sm text-cream/80 hover:bg-white/5"
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="rounded-xl overflow-hidden border border-white/10 h-48">
        <MapView center={center} marker={value} onPick={pickOnMap} />
      </div>
      <p className="text-xs text-cream/40">Tap the map to fine-tune the exact spot</p>
    </div>
  );
}
