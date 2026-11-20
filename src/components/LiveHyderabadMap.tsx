import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { HYDERABAD_HUB, type Coordinates } from '../types/domain';

interface LiveHyderabadMapProps {
  customerCoords: Coordinates;
  agentCoords?: Coordinates;
  customerLabel: string;
  agentLabel?: string;
  heightClass?: string;
}

function makeCircleDivIcon(color: string, label: string) {
  const safeLabel = label.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[ch] || ch;
  });
  return L.divIcon({
    className: 'custom-leaflet-pin',
    html: `<div style="display:flex;align-items:center;gap:7px;white-space:nowrap;">
      <span style="width:12px;height:12px;border-radius:9999px;background:${color};border:2px solid #060d14;box-shadow:0 0 0 1px rgba(228,204,162,0.55), 0 3px 10px rgba(0,0,0,0.55);display:inline-block;"></span>
      <span style="background:rgba(6,13,20,0.92);color:#f4efe6;font-size:10.5px;font-weight:500;letter-spacing:0.04em;padding:3px 8px;border-radius:2px;border:1px solid rgba(228,204,162,0.28);box-shadow:0 4px 12px rgba(0,0,0,0.45);">${safeLabel}</span>
    </div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export const LiveHyderabadMap: React.FC<LiveHyderabadMapProps> = ({
  customerCoords,
  agentCoords,
  customerLabel,
  agentLabel,
  heightClass = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [HYDERABAD_HUB.lat, HYDERABAD_HUB.lng],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const hubLatLng: [number, number] = [HYDERABAD_HUB.lat, HYDERABAD_HUB.lng];
    const destLatLng: [number, number] = [customerCoords.lat, customerCoords.lng];
    const agentLatLng: [number, number] | null = agentCoords ? [agentCoords.lat, agentCoords.lng] : null;

    // Hub marker (Champagne Brass)
    L.marker(hubLatLng, {
      icon: makeCircleDivIcon('#d8b06c', 'Madhapur Hub · 500081'),
    })
      .bindPopup(`<strong>${HYDERABAD_HUB.name}</strong><br/>${HYDERABAD_HUB.address}`)
      .addTo(group);

    // Customer pin (Warm Ivory)
    L.marker(destLatLng, {
      icon: makeCircleDivIcon('#f8f5ef', customerLabel),
    })
      .bindPopup(`<strong>Customer Drop Pin</strong><br/>${customerLabel}`)
      .addTo(group);

    // Route polyline (Warm Brass Dashed)
    const pathPoints: [number, number][] = agentLatLng ? [hubLatLng, agentLatLng, destLatLng] : [hubLatLng, destLatLng];

    L.polyline(pathPoints, {
      color: '#d8b06c',
      weight: 2.5,
      opacity: 0.9,
      dashArray: '7 6',
    }).addTo(group);

    // Live Agent Marker (Emerald)
    if (agentLatLng) {
      L.marker(agentLatLng, {
        icon: makeCircleDivIcon('#34d399', agentLabel || 'Live Delivery Agent'),
      })
        .bindPopup(`<strong>${agentLabel || 'Delivery Agent'}</strong><br/>Live Route Position`)
        .addTo(group);
    }

    const bounds = L.latLngBounds(pathPoints);
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 });
  }, [customerCoords.lat, customerCoords.lng, agentCoords?.lat, agentCoords?.lng, customerLabel, agentLabel]);

  return (
    <div className={`relative w-full ${heightClass} rounded-sm overflow-hidden border border-[#e4cca2]/22 bg-[#060d14]`}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
