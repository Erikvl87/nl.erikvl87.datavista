import { ExtendedHomeyAPIV3Local, ExtendedVariable } from 'homey-api';
import DataVistaLogger from '../DataVistaLogger.mjs';

/**
 * Create a function to get a variable by id.
 */
export function createGetVariable(homeyApi: ExtendedHomeyAPIV3Local, logger: DataVistaLogger) {
	return async (id: string): Promise<ExtendedVariable | null> => {
		let variable = null;
		try {
			variable = await homeyApi.logic.getVariable({ id: id });
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Not Found')) {
				void logger.logMessage(`Variable with id '${id}' not found.`);
			} else {
				void logger.logException(error);
			}
			return null;
		}

		return variable;
	};
}
