import { CapabilitiesObject, ExtendedVariable } from 'homey-api';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';
import { DATA_TYPE_IDS } from '../constants.mjs';
import { WidgetDataPayload } from './getDatasource.mjs';

/**
 * Check if the payload is of a certain data type.
 */
export function isDataType(
	payload: WidgetDataPayload,
	options: {
		status?: boolean;
		string?: boolean;
		boolean?: boolean;
		percentage?: boolean;
		number?: boolean;
		range?: boolean;
		datapoint?: boolean;
	},
): boolean {
	switch (payload.type) {
		case 'capability': {
			const capability = payload.data as CapabilitiesObject;
			if (options.boolean && capability.type === 'boolean') return true;
			if (options.percentage && capability.type === 'number' && capability.units === '%') return true;
			if (options.number && capability.type === 'number') return true;
			if (
				options.range &&
				capability.type === 'number' &&
				capability.min !== undefined &&
				capability.max !== undefined
			)
				return true;
			if (options.string && capability.type === 'string') return true;
			return false;
		}
		case 'variable': {
			const variable = payload.data as ExtendedVariable;
			if (options.boolean && variable.type === 'boolean') return true;
			if (options.number && variable.type === 'number') return true;
			if (options.string && variable.type === 'string') return true;
			return false;
		}
		case 'advanced': {
			const advanced = payload.data as BaseSettings<unknown>;
			if (options.boolean && advanced.type === DATA_TYPE_IDS.BOOLEAN) return true;
			if (options.percentage && advanced.type === DATA_TYPE_IDS.PERCENTAGE) return true;
			if (options.range && advanced.type === DATA_TYPE_IDS.RANGE) return true;
			if (options.string && advanced.type === DATA_TYPE_IDS.TEXT) return true;
			if (options.status && advanced.type === DATA_TYPE_IDS.STATUS) return true;
			return false;
		}
		case 'insight': {
			if (options.datapoint) return true;
			return false;
		}
		default:
			return false;
	}
}
