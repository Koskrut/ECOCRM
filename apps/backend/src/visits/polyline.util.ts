import type { LatLng } from "./route-geometry";

/** Decode Google encoded polyline (precision 5). */
export function decodeEncodedPolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/** Build path from waypoint chain (straight segments fallback). */
export function pathFromWaypoints(
  origin: LatLng,
  intermediates: LatLng[],
  destination: LatLng,
): LatLng[] {
  const legs: LatLng[] = [origin, ...intermediates, destination];
  const out: LatLng[] = [];
  for (const p of legs) {
    const last = out[out.length - 1];
    if (!last || last.lat !== p.lat || last.lng !== p.lng) {
      out.push(p);
    }
  }
  return out;
}
