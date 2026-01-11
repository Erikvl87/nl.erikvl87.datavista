import Homey from 'homey/lib/Homey';
import DataVistaLogger from '../DataVistaLogger.mjs';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';

/**
 * Create a function to get a configuration source from settings.
 */
export function createGetConfigsource(homey: Homey, logger: DataVistaLogger) {
	return <T,>(configsource: string): BaseSettings<T> | null => {
		if (configsource == null) return null;

		const data = homey.settings.get(configsource) as BaseSettings<T>;
		if (data == null) {
			void logger.logMessage(`Config source with id '${configsource}' not found.`);
			return null;
		}

		return data;
	};
}
