import Homey from 'homey/lib/Homey';
import { ExtendedHomeyAPIV3Local } from 'homey-api';
import DataVistaLogger from '../DataVistaLogger.mjs';
import { DataSource } from '../widgets/BaseWidget.mjs';
import { DATAVISTA_APP_NAME, HOMEY_LOGIC } from '../constants.mjs';
import { createGetCapability } from './getCapability.mjs';
import { createGetAdvanced } from './getAdvanced.mjs';
import { createGetVariable } from './getVariable.mjs';
import { createGetInsight } from './getInsight.mjs';
import { mergeInsights } from './mergeInsights.mjs';

/**
 * Payload structure for widget data.
 */
export type WidgetDataPayload = {
	type: 'capability' | 'variable' | 'advanced' | 'insight';
	name: string;
	fallbackIcon?: string | null;
	data: unknown;
};

/**
 * Create a function to get data from a data source (capability, variable, advanced, or insight).
 */
export function createGetDatasource(
	homey: Homey,
	homeyApi: ExtendedHomeyAPIV3Local,
	logger: DataVistaLogger,
): (datasource: DataSource) => Promise<WidgetDataPayload | null> {
	const getCapability = createGetCapability(homeyApi, logger);
	const getAdvanced = createGetAdvanced(homey);
	const getVariable = createGetVariable(homeyApi, logger);
	const getInsight = createGetInsight(homeyApi, logger);

	return async (datasource: DataSource): Promise<WidgetDataPayload | null> => {
		if (datasource?.type == null) return null;

		switch (datasource.type) {
			case 'capability': {
				const { device, capability } =
					(await getCapability(datasource.id, datasource.deviceId!)) ?? {
						device: null,
						capability: null,
					};

				if (device == null || capability == null) return null;

				if (capability.type === 'number' && capability.units !== undefined && capability.units === '%') {
					const min = capability.min ?? 0;
					const max = capability.max ?? 100;
					const currentValue = (capability.value as number) ?? 0;
					const percentageValue = max !== min ? Math.round(((currentValue - min) / (max - min)) * 100) : 0;
					capability.min = 0;
					capability.max = 100;
					capability.value = percentageValue;
				}

				return {
					type: 'capability',
					name: `${device.name} - ${capability.title}`,
					data: capability,
					fallbackIcon: device.iconObj?.id ? `https://icons-cdn.athom.com/${device.iconObj?.id}.svg?ver=1` : null,
				};
			}
			case 'advanced': {
				const result = getAdvanced(datasource.id);
				if (result == null) return null;

				return {
					type: 'advanced',
					name: `${DATAVISTA_APP_NAME} - ${result.identifier}`,
					data: result,
				};
			}
			case 'variable': {
				const result = await getVariable(datasource.id);
				if (result == null) return null;

				return {
					type: 'variable',
					name: `${HOMEY_LOGIC} - ${result.name}`,
					data: result,
				};
			}
			case 'insight': {
				let result = null;
				switch (datasource.insightResolution) {
					case 'this365Days': {
						const partialResult1 = await getInsight(datasource.id, 'thisYear');
						const partialResult2 = await getInsight(datasource.id, 'lastYear');
						result = mergeInsights(partialResult2, partialResult1);
						break;
					}
					case 'last365Days': {
						const partialResult1 = await getInsight(datasource.id, 'lastYear');
						const partialResult2 = await getInsight(datasource.id, 'last2Years');
						result = mergeInsights(partialResult2, partialResult1);
						break;
					}
					case 'thisHour': {
						result = await getInsight(datasource.id, 'lastHour');
						break;
					}
					case 'lastHour': {
						result = await getInsight(datasource.id, 'last6Hours');
						break;
					}
					case 'this60Minutes': {
						result = await getInsight(datasource.id, 'lastHour');
						break;
					}
					case 'last60Minutes': {
						result = await getInsight(datasource.id, 'last6Hours');
						break;
					}
					case 'this6Hours': {
						result = await getInsight(datasource.id, 'last6Hours');
						break;
					}
					case 'last6Hours': {
						result = await getInsight(datasource.id, 'last24Hours');
						break;
					}
					case 'this12Hours': {
						result = await getInsight(datasource.id, 'last24Hours');
						break;
					}
					case 'last12Hours': {
						result = await getInsight(datasource.id, 'last24Hours');
						break;
					}
					case 'this24Hours': {
						result = await getInsight(datasource.id, 'last24Hours');
						break;
					}
					case 'last24Hours': {
						result = await getInsight(datasource.id, 'last3Days');
						break;
					}
					case 'this7Days': {
						result = await getInsight(datasource.id, 'last7Days');
						break;
					}
					case 'last7Days': {
						result = await getInsight(datasource.id, 'last14Days');
						break;
					}
					case 'this31Days': {
						result = await getInsight(datasource.id, 'last31Days');
						break;
					}
					case 'last31Days': {
						result = await getInsight(datasource.id, 'last3Months');
						break;
					}
					default: {
						result = await getInsight(datasource.id, datasource.insightResolution!);
						break;
					}
				}

				if (result == null) return null;

				return {
					type: 'insight',
					name: result.insight.title ?? '[No name]',
					data: {
						insight: result.insight,
						logs: result.logs,
					},
				};
			}
			default:
				void logger.logMessage(`Unsupported data source type: ${datasource.type}`, true, datasource);
				return null;
		}
	};
}
