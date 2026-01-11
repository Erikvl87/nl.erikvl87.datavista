import Homey from 'homey/lib/Homey';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';

/**
 * Create a function to get an advanced setting by key.
 */
export function createGetAdvanced(homey: Homey) {
	return (key: string): BaseSettings<unknown> | null => {
		const data = homey.settings.get(key) as BaseSettings<unknown>;
		return data;
	};
}
