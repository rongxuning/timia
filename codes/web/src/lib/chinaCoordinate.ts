export type MapLngLat = {
  lat: number;
  lng: number;
};

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

export function isMainlandChina(lat: number, lng: number): boolean {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return false;
  if (lng > 119.3 && lng < 122.1 && lat > 21.8 && lat < 25.4) return false;
  if (lng > 113.75 && lng < 114.5 && lat > 22.13 && lat < 22.58) return false;
  if (lng > 113.52 && lng < 113.65 && lat > 22.09 && lat < 22.22) return false;
  return true;
}

/** Photon / HealthKit store WGS-84. Apple Maps and 高德 tiles in mainland China are GCJ-02. */
export function wgs84ToGcj02(lat: number, lng: number): MapLngLat {
  if (!isMainlandChina(lat, lng)) return { lat, lng };
  const dLat = transformLat(lng - 105.0, lat - 35.0);
  const dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  const magic = 1 - EE * Math.sin(radLat) * Math.sin(radLat);
  const sqrtMagic = Math.sqrt(magic);
  const latShift = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const lngShift = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: lat + latShift, lng: lng + lngShift };
}
