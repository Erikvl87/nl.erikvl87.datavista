import { ExtendedHomeyAPIV3Local, CapabilitiesObject, ExtendedDevice } from 'homey-api';
import DataVistaLogger from '../DataVistaLogger.mjs';

/**
 * Create a function to get a capability by id and deviceId.
 */
export function createGetCapability(homeyApi: ExtendedHomeyAPIV3Local, logger: DataVistaLogger) {
	return async (
		id: string,
		deviceId: string,
	): Promise<{ device: ExtendedDevice; capability: CapabilitiesObject } | null> => {
	let device = null;
	try {
		device = await homeyApi.devices.getDevice({ id: deviceId });
	} catch (error) {
		if (error instanceof Error && error.message.startsWith('Not Found')) {
			void logger.logMessage(`Device with id '${deviceId}' not found.`);
		} else {
			void logger.logException(error);
		}
		return null;
	}

		const capability = device.capabilitiesObj[id];
		if (!capability) {
			void logger.logMessage(`Capability with id '${id}' not found.`);
			return null;
		}

		return {
			device,
			capability,
		};
	};
}
