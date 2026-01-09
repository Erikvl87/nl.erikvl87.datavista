import { ExtendedDevice } from 'homey-api';

/**
 * Cached device information - only stores properties actually used by the app.
 * Add more properties here as needed to extend cache functionality.
 */
export interface CachedDeviceInfo {
	name: string;
	// Easy to add later:
	// iconUrl?: string;
	// zone?: string;
	// capabilities?: string[];
}

/**
 * Singleton device cache shared across the entire app to reduce memory usage
 * and avoid redundant API calls.
 */
export default class DeviceCache {
	private static instance: DeviceCache | null = null;
	private cache: Map<string, CachedDeviceInfo> = new Map();

	private constructor() {}

	public static getInstance(): DeviceCache {
		if (!DeviceCache.instance) {
			DeviceCache.instance = new DeviceCache();
		}
		return DeviceCache.instance;
	}

	public get(deviceId: string): CachedDeviceInfo | undefined {
		return this.cache.get(deviceId);
	}

	public set(deviceId: string, device: ExtendedDevice): void {
		this.cache.set(deviceId, {
			name: device.name,
			// Add more properties as needed
		});
	}

	public clear(): void {
		this.cache.clear();
	}

	public size(): number {
		return this.cache.size;
	}
}
