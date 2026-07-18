const axios = require('axios');

/**
 * Looks up approximate location for an IP address using ip-api.com (free tier).
 * Returns null on failure so callers can proceed without blocking signup/login.
 */
async function getLocationFromIP(ip) {
  try {
    // Local/dev IPs won't resolve - skip the call.
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) {
      return null;
    }
    const cleanIp = ip.replace('::ffff:', '');
    const { data } = await axios.get(
      `http://ip-api.com/json/${cleanIp}?fields=status,country,city,lat,lon,isp`,
      { timeout: 4000 }
    );
    if (data.status !== 'success') return null;
    return {
      type: 'ip',
      ip: cleanIp,
      country: data.country,
      city: data.city,
      lat: data.lat,
      lon: data.lon,
      isp: data.isp,
    };
  } catch (err) {
    console.warn('IP geolocation failed:', err.message);
    return null;
  }
}

/**
 * Converts lat/lon coordinates into a city/country using OpenStreetMap Nominatim.
 */
async function reverseGeocode(lat, lon) {
  try {
    const { data } = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon, format: 'json' },
      headers: { 'User-Agent': 'HeartConnect/1.0' },
      timeout: 4000,
    });
    return {
      country: data?.address?.country || null,
      city: data?.address?.city || data?.address?.town || data?.address?.village || null,
    };
  } catch (err) {
    console.warn('Reverse geocoding failed:', err.message);
    return { country: null, city: null };
  }
}

module.exports = { getLocationFromIP, reverseGeocode };
