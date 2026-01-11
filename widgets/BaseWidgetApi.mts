import { CapabilitiesObject, ExtendedDevice, ExtendedInsightsLogs, ExtendedLog, ExtendedVariable, Resolution } from 'homey-api';
import DataVista from '../app.mjs';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';
import type { ApiRequest } from '../@types/api-types.js';
import { DATA_TYPE_IDS, DATAVISTA_APP_NAME, HOMEY_LOGIC } from '../constants.mjs';
import { DataSource } from './BaseWidget.mjs';

export type WidgetDataPayload = {
	type: 'capability' | 'variable' | 'advanced' | 'insight';
	name: string;
	fallbackIcon?: string | null;
	data: unknown;
};

export class BaseWidgetApi {
	/**
	 * Get the time and language.
	 */
	protected async getTimeAndLanguage({ homey }: ApiRequest): Promise<{ timezone: string; language: string }> {
		return await homey.app.getTimeAndLanguage();
	}

	protected async getConfigsource<T>(app: DataVista, configsource: string): Promise<BaseSettings<T> | null> {
		if (configsource == null) return null;

		const data = app.homey.settings.get(configsource) as BaseSettings<T>;
		if (data == null) {
			void app.logger.logMessage(`[${this.constructor.name}]: Config source with id '${configsource}' not found.`);
			return null;
		}

		return data;
	}

	/**
	 * Get the data source.
	 */
	protected async getDatasource(app: DataVista, datasource: DataSource): Promise<WidgetDataPayload | null> {
		if (datasource?.type == null) return null;

		switch (datasource.type) {
			case 'capability': {
				const { device, capability } = (await this.getCapability(app, datasource.id, datasource.deviceId!)) ?? {
					device: null,
					capability: null,
				};

				if (device == null || capability == null) return null;

				if (capability.type === 'number' && capability.units !== undefined && capability.units === '%') {
					const min = capability.min ?? 0;
					const max = capability.max ?? 100;
					const currentValue = capability.value as number ?? 0;
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
				const result = this.getAdvanced(app, datasource.id);
				if (result == null) return null;

				return {
					type: 'advanced',
					name: `${DATAVISTA_APP_NAME} - ${result.identifier}`,
					data: result,
				};
			}
			case 'variable': {
				const result = await this.getVariable(app, datasource.id);
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
						const partialResult1 = await this.getInsight(app, datasource.id, 'thisYear');
						const partialResult2 = await this.getInsight(app, datasource.id, 'lastYear');
						result = this.mergeInsights(partialResult2, partialResult1);
						break;
					}
					case 'last365Days': {
						const partialResult1 = await this.getInsight(app, datasource.id, 'lastYear');
						const partialResult2 = await this.getInsight(app, datasource.id, 'last2Years');
						result = this.mergeInsights(partialResult2, partialResult1);
						break;
					}
					case 'thisHour': {
						result = await this.getInsight(app, datasource.id, 'lastHour');
						break;
					}
					case 'lastHour': {
						result = await this.getInsight(app, datasource.id, 'last6Hours');
						break;
					}
					case 'this60Minutes': {
						result = await this.getInsight(app, datasource.id, 'lastHour');
						break;
					}
					case 'last60Minutes': {
						result = await this.getInsight(app, datasource.id, 'last6Hours');
						break;
					}
					case 'this6Hours': {
						result = await this.getInsight(app, datasource.id, 'last6Hours');
						break;
					}
					case 'last6Hours': {
						result = await this.getInsight(app, datasource.id, 'last24Hours');
						break;
					}
					case 'this12Hours': {
						result = await this.getInsight(app, datasource.id, 'last24Hours');
						break;
					}
					case 'last12Hours': {
						result = await this.getInsight(app, datasource.id, 'last24Hours');
						break;
					}
					case 'this24Hours': {
						result = await this.getInsight(app, datasource.id, 'last24Hours');
						break;
					}
					case 'last24Hours': {
						result = await this.getInsight(app, datasource.id, 'last3Days');
						break;
					}
					case 'this7Days': {
						result = await this.getInsight(app, datasource.id, 'last7Days');
						break;
					}
					case 'last7Days': {
						result = await this.getInsight(app, datasource.id, 'last14Days');
						break;
					}
					case 'this31Days': {
						result = await this.getInsight(app, datasource.id, 'last31Days');
						break;
					}
					case 'last31Days': {
						result = await this.getInsight(app, datasource.id, 'last3Months');
						break;
					}
					default: {
						result = await this.getInsight(app, datasource.id, datasource.insightResolution!);
						break;
					}
				}
				
				if (result == null) return null;

				return {
					type: 'insight',
					name: result.insight.title ?? '[No name]',
					data: {
						insight: result.insight,
						logs: result.logs 
					},
				};
			}
			default:
				void app.logger.logMessage(
					`[${this.constructor.name}]: Unsupported data source type: ${datasource.type}`,
					true,
					datasource,
				);
				return null;
		}
	}

	/**
	 * Check if the payload is of a certain data type.
	 */
	protected static isDataType(
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

	/**
	 * Get a capability by id and deviceId.
	 */
	private async getCapability(
		app: DataVista,
		id: string,
		deviceId: string,
	): Promise<{ device: ExtendedDevice; capability: CapabilitiesObject } | null> {
		let device = null;
		try {
			device = await app.homeyApi.devices.getDevice({ id: deviceId });
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Not Found')) {
				void app.logger.logMessage(`[${this.constructor.name}]: Device with id '${deviceId}' not found.`);
			} else {
				void app.logger.logException(error);
			}
			return null;
		}

		const capability = device.capabilitiesObj[id];
		if (!capability) {
			void app.logger.logMessage(`[${this.constructor.name}]: Capability with id '${id}' not found.`);
			return null;
		}

		return {
			device,
			capability,
		};
	}

	/**
	 * Get an advanced setting by key.
	 */
	private getAdvanced(app: DataVista, key: string): BaseSettings<unknown> | null {
		const data = app.homey.settings.get(key) as BaseSettings<unknown>;
		return data;
	}

	/**
	 * Get a variable by id.
	 */
	private async getVariable(app: DataVista, id: string): Promise<ExtendedVariable | null> {
		let variable = null;
		try {
			variable = await app.homeyApi.logic.getVariable({ id: id });
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Not Found')) {
				void app.logger.logMessage(`[${this.constructor.name}]: Variable with id '${id}' not found.`);
			} else {
				void app.logger.logException(error);
			}
			return null;
		}

		return variable;
	}

	/**
	 * Get an insight log with a specific resolution.
	 */
	private async getInsight(
		app: DataVista,
		id: string,
		resolution: Resolution,
	): Promise<{ logs: ExtendedInsightsLogs; insight: ExtendedLog } | null> {
		const insight = await app.homeyApi.insights.getLog({ id: id });
		const logs = await app.homeyApi.insights.getLogEntries({ id: id, resolution });
		if (!logs) {
			void app.logger.logMessage(`[${this.constructor.name}]: Insight with id '${id}' not found.`);
			return null;
		}

		return {
			logs,
			insight,
		};
	}

	/**
	 * Merge two insight responses into a single chronological dataset without trimming.
	 * The first parameter is assumed to be the older period, the second the newer.
	 * Duplicate timestamps prefer the newer dataset's value.
	 */
	private mergeInsights(
		older: { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null,
		newer: { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null,
	): { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null {
		if (!older && !newer) return null;
		if (older && !newer) return older;
		if (!older && newer) return newer;

		const olderLogs = older!.logs;
		const newerLogs = newer!.logs;

		// Helper to gather all points (values + lastValue)
		const gather = (l: ExtendedInsightsLogs): { t: string; v: number }[] => [
			...(l.values ?? []),
			l.lastValue,
		];

		const map = new Map<string, number>();
		for (const p of gather(olderLogs)) map.set(p.t, p.v);
		for (const p of gather(newerLogs)) map.set(p.t, p.v); // overwrite duplicates with newer value

		const points = Array.from(map.entries()).map(([t, v]) => ({ t, v }));
		points.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
		if (points.length === 0) return newer; // fallback

		const lastPoint = points[points.length - 1];
		const values = points.slice(0, -1); // exclude last point -> becomes lastValue

		const start = values.length ? values[0].t : lastPoint.t;
		const end = lastPoint.t;
		const step = newerLogs.step ?? olderLogs.step;
		const updatesIn = newerLogs.updatesIn ?? olderLogs.updatesIn;

		return {
			insight: newer!.insight ?? older!.insight,
			logs: {
				updatesIn,
				values,
				start,
				end,
				step,
				uri: newerLogs.uri || olderLogs.uri,
				id: newerLogs.id || olderLogs.id,
				lastValue: lastPoint,
			},
		};
	}

	/**
	 * Log a message.
	 */
	public async logMessage({ homey, body }: ApiRequest): Promise<void> {
		await homey.app.logger.logMessage(
			`[${this.constructor.name}]: ${body.message}`,
			body.logToSentry,
			...body.optionalParams,
		);
	}

	/**
	 * Log an error.
	 */
	public async logError({ homey, body }: ApiRequest): Promise<void> {
		const cause = JSON.parse(body.error as string);
		const error = new Error(`[${this.constructor.name}]: ${body.message}: ${cause.message}`);
		error.name = `Error from ${this.constructor.name}`;
		error.stack = cause.stack;
		error.cause = cause;
		await homey.app.logger.logException(error);
	}

	/**
	 * Get an icon.
	 */
	public async getIcon({ homey, query }: ApiRequest): Promise<string> {
		const svgSource = await homey.app.getSvgForUrl(query.url, query.color);
		return svgSource;
	}


	/**
	 * Interpolates the color at a specific offset within a ColorStop array.
	 */
	public interpolateColorAt({ homey, body }: ApiRequest): string {
		const sortedStops: { offset?: number; color: string }[] = body.sortedStops;
		const targetOffset: number = body.targetOffset;
		return homey.app.colorUtils.interpolateColorAt(sortedStops, targetOffset);
	}
}
