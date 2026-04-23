import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { GeoFencingSettings, ShopLocationConfig } from '../types/models';

export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface ShopLocationInput {
  shopId: string;
  latitude: number;
  longitude: number;
  radius: number;
  updatedAt?: string;
}

export interface GeoFenceValidationResult {
  ok: boolean;
  message: string;
  distanceMeters: number | null;
  allowedRadiusMeters: number | null;
  deviceLocation: DeviceCoordinates | null;
}

const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_ACCURACY_BUFFER_METERS = 20;
const DEFAULT_LOCATION_TIMEOUT_MS = 12_000;

type GeoPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
};

type GeoPositionError = {
  code?: number;
  message?: string;
};

type GeoLocationAdapter = {
  getCurrentPosition: (
    success: (position: GeoPosition) => void,
    failure?: (error: GeoPositionError) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    },
  ) => void;
};

type HRMSLocationNativeModule = {
  getCurrentPosition: (timeoutMs: number) => Promise<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  }>;
};

const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

export const validateShopLocationConfig = (input: ShopLocationInput) => {
  if (!isValidLatitude(Number(input.latitude))) {
    return { ok: false as const, message: 'Latitude must be between -90 and 90.' };
  }
  if (!isValidLongitude(Number(input.longitude))) {
    return { ok: false as const, message: 'Longitude must be between -180 and 180.' };
  }
  if (!Number.isFinite(Number(input.radius)) || Number(input.radius) <= 0) {
    return { ok: false as const, message: 'Radius must be greater than 0.' };
  }
  return { ok: true as const };
};

export const buildShopLocationConfig = (input: ShopLocationInput): ShopLocationConfig => ({
  id: input.shopId,
  shopId: input.shopId,
  latitude: Number(input.latitude),
  longitude: Number(input.longitude),
  radius: Number(input.radius),
  updatedAt: input.updatedAt ?? new Date().toISOString(),
});

const toRadians = (value: number) => (value * Math.PI) / 180;

export const haversineDistanceMeters = (from: DeviceCoordinates, to: Pick<ShopLocationConfig, 'latitude' | 'longitude'>) => {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(fromLatitude) * Math.cos(toLatitude) *
      Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_METERS * c).toFixed(2));
};

async function requestLocationPermission() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Location access required',
      message: 'Attendance check-in needs your location to validate that you are at the shop.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getCurrentDeviceLocation(timeoutMs = DEFAULT_LOCATION_TIMEOUT_MS): Promise<DeviceCoordinates> {
  const permissionGranted = await requestLocationPermission();
  if (!permissionGranted) {
    throw new Error('Location permission denied.');
  }

  const nativeLocationModule = (NativeModules as { HRMSLocationModule?: HRMSLocationNativeModule }).HRMSLocationModule;
  if (nativeLocationModule?.getCurrentPosition) {
    const result = await nativeLocationModule.getCurrentPosition(timeoutMs);
    return {
      latitude: Number(result.latitude),
      longitude: Number(result.longitude),
      accuracy: result.accuracy == null ? undefined : Number(result.accuracy),
    };
  }

  const geolocation = (globalThis as typeof globalThis & { navigator?: { geolocation?: GeoLocationAdapter } }).navigator?.geolocation;
  if (!geolocation?.getCurrentPosition) {
    throw new Error('Device location service is unavailable.');
  }

  return await new Promise<DeviceCoordinates>((resolve, reject) => {
    geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracy: position.coords.accuracy == null ? undefined : Number(position.coords.accuracy),
        });
      },
      error => {
        if (error?.code === 1) {
          reject(new Error('Location permission denied.'));
          return;
        }
        if (error?.code === 2) {
          reject(new Error('GPS is disabled or location is unavailable.'));
          return;
        }
        if (error?.code === 3) {
          reject(new Error('Location fetch timed out.'));
          return;
        }
        reject(new Error(error?.message || 'Unable to fetch device location.'));
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      },
    );
  });
}

export const validateGeoFenceForAttendance = async ({
  settings,
  fetchLocation = getCurrentDeviceLocation,
}: {
  settings: GeoFencingSettings;
  fetchLocation?: () => Promise<DeviceCoordinates>;
}): Promise<GeoFenceValidationResult> => {
  if (!settings.enabled) {
    return {
      ok: true,
      message: '',
      distanceMeters: null,
      allowedRadiusMeters: null,
      deviceLocation: null,
    };
  }

  if (!settings.location) {
    if (settings.allowAttendanceWhenLocationMissing) {
      return {
        ok: true,
        message: '',
        distanceMeters: null,
        allowedRadiusMeters: null,
        deviceLocation: null,
      };
    }
    return {
      ok: false,
      message: 'Shop location is not configured.',
      distanceMeters: null,
      allowedRadiusMeters: null,
      deviceLocation: null,
    };
  }

  const deviceLocation = await fetchLocation();
  if (!isValidLatitude(deviceLocation.latitude) || !isValidLongitude(deviceLocation.longitude)) {
    return {
      ok: false,
      message: 'Device location is invalid.',
      distanceMeters: null,
      allowedRadiusMeters: null,
      deviceLocation,
    };
  }

  const maxAccuracy = Number(settings.requireGpsAccuracyMeters ?? 0);
  if (maxAccuracy > 0 && Number(deviceLocation.accuracy ?? 0) > maxAccuracy) {
    return {
      ok: false,
      message: 'GPS accuracy is too low. Move to an open area and try again.',
      distanceMeters: null,
      allowedRadiusMeters: settings.location.radius + Math.max(0, Number(settings.accuracyBufferMeters ?? DEFAULT_ACCURACY_BUFFER_METERS)),
      deviceLocation,
    };
  }

  const distanceMeters = haversineDistanceMeters(deviceLocation, settings.location);
  const allowedRadiusMeters =
    Number(settings.location.radius) + Math.max(0, Number(settings.accuracyBufferMeters ?? DEFAULT_ACCURACY_BUFFER_METERS));

  if (distanceMeters <= allowedRadiusMeters) {
    return {
      ok: true,
      message: '',
      distanceMeters,
      allowedRadiusMeters,
      deviceLocation,
    };
  }

  return {
    ok: false,
    message: 'You are outside the allowed location.',
    distanceMeters,
    allowedRadiusMeters,
    deviceLocation,
  };
};
