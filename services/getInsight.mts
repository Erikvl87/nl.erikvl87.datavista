import { ExtendedHomeyAPIV3Local, ExtendedLog, ExtendedInsightsLogs, Resolution } from 'homey-api';
import DataVistaLogger from '../DataVistaLogger.mjs';

/**
 * Create a function to get an insight log with a specific resolution.
 */
export function createGetInsight(homeyApi: ExtendedHomeyAPIV3Local, logger: DataVistaLogger) {
	return async (
		id: string,
		resolution: Resolution,
	): Promise<{ logs: ExtendedInsightsLogs; insight: ExtendedLog } | null> => {
	const insight = await homeyApi.insights.getLog({ id: id });
	const logs = await homeyApi.insights.getLogEntries({ id: id, resolution });
		if (!logs) {
			void logger.logMessage(`Insight with id '${id}' not found.`);
			return null;
		}

		return {
			logs,
			insight,
		};
	};
}
