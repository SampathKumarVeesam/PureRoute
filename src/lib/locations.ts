import masterLocationsJson from '../data/locations/india_cascading_locations_master.json';

export interface LocationArea {
  zone: string;
  area: string;
  pin: string;
}

export interface StateLocationData {
  code: string;
  cities: Record<string, LocationArea[]>;
}

export interface DeliveryLocationItem {
  state: string;
  city: string;
  area: string;
  pin: string;
  zone?: string;
}

export const MASTER_LOCATIONS = masterLocationsJson as Record<string, StateLocationData>;

export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Hyderabad (Core + 300km Radius)': { lat: 17.3850, lng: 78.4867 },
  'Warangal': { lat: 17.9689, lng: 79.5941 },
  'Vijayawada': { lat: 16.5062, lng: 80.6480 },
  'Visakhapatnam': { lat: 17.6868, lng: 83.2185 },
  'Kurnool': { lat: 15.8281, lng: 78.0373 },
  'Nellore': { lat: 14.4426, lng: 79.9865 },
  'Tirupati': { lat: 13.6288, lng: 79.4192 },
  'Bengaluru': { lat: 12.9716, lng: 77.5946 },
  'Mysuru': { lat: 12.2958, lng: 76.6394 },
  'Hubballi-Dharwad': { lat: 15.3647, lng: 75.1240 },
  'Mangaluru': { lat: 12.9141, lng: 74.8560 },
  'Chennai': { lat: 13.0827, lng: 80.2707 },
  'Coimbatore': { lat: 11.0168, lng: 76.9558 },
  'Madurai': { lat: 9.9252, lng: 78.1198 },
  'Mumbai': { lat: 19.0760, lng: 72.8777 },
  'Pune': { lat: 18.5204, lng: 73.8567 },
  'Nagpur': { lat: 21.1458, lng: 79.0882 },
  'Nashik': { lat: 19.9975, lng: 73.7898 },
  'New Delhi': { lat: 28.6139, lng: 77.2090 },
  'Gurugram': { lat: 28.4595, lng: 77.0266 },
  'Noida': { lat: 28.5355, lng: 77.3910 },
  'Kolkata': { lat: 22.5726, lng: 88.3639 },
  'Ahmedabad': { lat: 23.0225, lng: 72.5714 },
  'Surat': { lat: 21.1702, lng: 72.8311 },
  'Vadodara': { lat: 22.3072, lng: 73.1812 },
  'Jaipur': { lat: 26.9124, lng: 75.7873 },
  'Lucknow': { lat: 26.8467, lng: 80.9462 },
  'Kanpur': { lat: 26.4499, lng: 80.3319 },
  'Varanasi': { lat: 25.3176, lng: 82.9739 },
  'Kochi': { lat: 9.9312, lng: 76.2673 },
  'Thiruvananthapuram': { lat: 8.5241, lng: 76.9366 },
  'Indore': { lat: 22.7196, lng: 75.8577 },
  'Bhopal': { lat: 23.2599, lng: 77.4126 },
  'Chandigarh Tricity': { lat: 30.7333, lng: 76.7794 },
  'Bhubaneswar (Odisha)': { lat: 20.2961, lng: 85.8245 },
  'Patna (Bihar)': { lat: 25.5941, lng: 85.1376 },
  'Ranchi (Jharkhand)': { lat: 23.3441, lng: 85.3096 },
  'Raipur (Chhattisgarh)': { lat: 21.2514, lng: 81.6296 },
};

/**
 * Returns available states in consistent order with Telangana prioritized
 */
export function getAvailableStates(): string[] {
  const allStates = Object.keys(MASTER_LOCATIONS);
  const priority = ['Telangana', 'Andhra Pradesh', 'Karnataka', 'Maharashtra', 'Tamil Nadu', 'Delhi NCR'];
  const sorted = [
    ...priority.filter((s) => allStates.includes(s)),
    ...allStates.filter((s) => !priority.includes(s)).sort(),
  ];
  return sorted;
}

/**
 * Returns cities for a given state
 */
export function getCitiesForState(state: string): string[] {
  const st = MASTER_LOCATIONS[state];
  if (!st || !st.cities) return [];
  return Object.keys(st.cities);
}

/**
 * Returns areas for a state and city
 */
export function getAreasForCity(state: string, city: string): LocationArea[] {
  const st = MASTER_LOCATIONS[state];
  if (!st || !st.cities) return [];
  return st.cities[city] || [];
}

/**
 * Returns approximate map coordinates for a given city and PIN
 */
export function getLocationCoordinates(city: string, pin: string, areaIndex: number = 0): { lat: number; lng: number } {
  const base = CITY_COORDINATES[city] || { lat: 17.3850, lng: 78.4867 };
  const pinNum = parseInt(pin, 10) || 500000;
  // Deterministic micro-jitter within ~3km based on pin code and area index
  const latOffset = ((pinNum % 47) - 23) * 0.0018 + (areaIndex % 7) * 0.001;
  const lngOffset = (((pinNum >> 2) % 43) - 21) * 0.0021 + (areaIndex % 5) * 0.001;
  return {
    lat: Number((base.lat + latOffset).toFixed(4)),
    lng: Number((base.lng + lngOffset).toFixed(4)),
  };
}

/**
 * Unique key for a delivery location item
 */
export function getLocationKey(item: { state: string; city: string; area: string; pin?: string }): string {
  return `${item.state}:::${item.city}:::${item.area}:::${item.pin || ''}`;
}
