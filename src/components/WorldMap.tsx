import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  colour: string;
  detail?: string;
  isSelf?: boolean;
}

/**
 * OpenStreetMap tiles via Leaflet — no key, no billing. Markers are drawn as
 * circles rather than image pins so nothing depends on bundled icon assets.
 */
export function WorldMap({ points, height = 320 }: { points: MapPoint[]; height?: number }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder || mapRef.current) return;

    const map = L.map(holder, {
      center: [20, 5],
      zoom: 1,
      minZoom: 1,
      maxZoom: 9,
      worldCopyJump: true,
      attributionControl: true,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
      crossOrigin: true,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet mis-measures inside a freshly laid-out flex container.
    const settle = window.setTimeout(() => map.invalidateSize(), 220);

    return () => {
      window.clearTimeout(settle);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    for (const point of points) {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: point.isSelf ? 9 : 7,
        color: point.isSelf ? '#FFFFFF' : point.colour,
        weight: point.isSelf ? 3 : 2,
        fillColor: point.colour,
        fillOpacity: 0.85,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(point.label)}</strong>${point.detail ? `<br/>${escapeHtml(point.detail)}` : ''}`
      );
      marker.addTo(layer);
    }

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 4);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])).pad(0.35), { maxZoom: 6 });
    }
  }, [points]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-ink-700">
      <div ref={holderRef} style={{ height }} className="bg-ink-850" />
      {points.length === 0 && (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/70 pointer-events-none">
          <p className="text-[12.5px] text-chalk-dim text-center px-6">
            Nobody is sharing a location yet. Turn yours on to appear here.
          </p>
        </div>
      )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  );
}
