import { ExtendedHomeyAPIV3Local, Resolution } from 'homey-api';
import Homey from 'homey/lib/Homey';
import Widget from 'homey/lib/Widget';
import { BooleanData } from '../datavistasettings/BooleanSettings.mjs';
import { DATA_TYPE_IDS, DATAVISTA_APP_NAME, HOMEY_LOGIC } from '../constants.mjs';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';
import { PercentageData } from '../datavistasettings/PercentageSettings.mjs';
import { RangeData } from '../datavistasettings/RangeSettings.mjs';
import DataVistaLogger from '../DataVistaLogger.mjs';
import { TextData } from '../datavistasettings/TextSettings.mjs';
import { StatusData } from '../datavistasettings/StatusSettings.mjs';
import { CountdownData } from '../datavistasettings/CountdownSettings.mjs';
import DeviceCache from '../common/DeviceCache.mjs';

type DataVistaResolution = Resolution
	| 'thisHour'
	| 'this60Minutes'
	| 'last60Minutes'
	| 'this6Hours'
	| 'last6Hours'
	| 'this12Hours'
	| 'last12Hours'
	| 'this24Hours'
	| 'last24Hours'
	| 'this7Days'
	| 'last7Days'
	| 'this31Days'
	| 'last31Days'
	| 'this365Days'
	| 'last365Days';

// TODO abstraction & per type?
export type DataSource = {
	name: string;
	description?: string;
	id: string;
	type?: 'capability' | 'advanced' | 'variable' | 'insight';
	deviceId?: string;
	deviceName: string;
	insightResolution?: DataVistaResolution
};

type AutocompleteQueryOptions = {
	query?: string | null;
	optional?: boolean;
	includeText?: boolean;
	includeBooleans?: boolean;
	includePercentages?: boolean;
	includeRanges?: boolean;
	includeNumbers?: boolean;
	includeStatus?: boolean;
	includeDataPoints?: boolean;
	includeCountdowns?: boolean;
	fromCapabilities?: boolean;
	fromSettings?: boolean;
	fromVariables?: boolean;
	fromInsights?: boolean;
};

export class BaseWidget {
	protected homey: Homey;
	protected homeyApi: ExtendedHomeyAPIV3Local;
	protected logger: DataVistaLogger;

	// Singleton device cache shared across all widget instances
	private deviceCache = DeviceCache.getInstance();

	constructor(homey: Homey, homeyApi: ExtendedHomeyAPIV3Local, logger: DataVistaLogger) {
		this.homey = homey;
		this.homeyApi = homeyApi;
		this.logger = logger;
	}

	async autocompleteQuery(options: AutocompleteQueryOptions): Promise<Widget.SettingAutocompleteResults> {
		const results: DataSource[] = [];

		try {
			if (options.fromSettings) {
				const settingsKeys = this.homey.settings.getKeys();
				settingsKeys.forEach(key => {
					switch (key.split('-')[0]) {
						case DATA_TYPE_IDS.BOOLEAN: {
							if (!options.includeBooleans) break;
							const data: BaseSettings<BooleanData> = this.homey.settings.get(key);
							results.push({
								name: data.identifier,
								description: `${DATAVISTA_APP_NAME} ${this.homey.__('boolean')} (${
									data.settings.value ? 'true' : 'false'
								})`,
								id: key,
								type: 'advanced',
								deviceName: DATAVISTA_APP_NAME,
							});
							break;
						}
						case DATA_TYPE_IDS.PERCENTAGE: {
							if (!options.includePercentages) break;
							const percentageData: BaseSettings<PercentageData> = this.homey.settings.get(key);
							results.push({
								name: percentageData.identifier,
								description: `${DATAVISTA_APP_NAME} ${this.homey.__('percentage')} (${
									percentageData.settings.percentage ?? '0'
								}%)`,
								id: key,
								type: 'advanced',
								deviceName: DATAVISTA_APP_NAME,
							});
							break;
						}
						case DATA_TYPE_IDS.RANGE: {
							if (!options.includeRanges) break;
							const rangeData: BaseSettings<RangeData> = this.homey.settings.get(key);
							results.push({
								name: rangeData.identifier,
								description: `${DATAVISTA_APP_NAME} ${this.homey.__('range')} (${rangeData.settings.min}-${
									rangeData.settings.max
								})`,
								id: key,
								type: 'advanced',
								deviceName: DATAVISTA_APP_NAME,
							});
							break;
						}
						case DATA_TYPE_IDS.TEXT: {
							if (!options.includeText) break;
							const rangeData: BaseSettings<TextData> = this.homey.settings.get(key);
							let description = `${DATAVISTA_APP_NAME} ${this.homey.__('text')}`;
							if (rangeData.settings.value != null && rangeData.settings.value != '')
								description += ` (${rangeData.settings.value})`;

							results.push({
								name: rangeData.identifier,
								description: description,
								id: key,
								type: 'advanced',
								deviceName: DATAVISTA_APP_NAME,
							});
							break;
						}
						case DATA_TYPE_IDS.STATUS: {
							if (!options.includeStatus) break;
							const data: BaseSettings<StatusData> = this.homey.settings.get(key);
							results.push({
								name: data.identifier,
								description: `${DATAVISTA_APP_NAME} ${this.homey.__('status')} (${data.settings.color} - ${
									data.settings.text
								})`,
								id: key,
								type: 'advanced',
								deviceName: DATAVISTA_APP_NAME,
							});
							break;
						}
						case DATA_TYPE_IDS.COUNTDOWN: {
							if (!options.includeCountdowns) break;
							const countdownData: BaseSettings<CountdownData> = this.homey.settings.get(key);
							results.push({
								name: countdownData.identifier,
								description: `${DATAVISTA_APP_NAME} ${this.homey.__('countdown')} (→ ${countdownData.settings.endDatetime})`,
								id: key,
								type: 'advanced',
								deviceName: DATAVISTA_APP_NAME,
							});
							break;
						}
					}
				});
			}

			if (options.fromCapabilities) {
				const devices = await this.homeyApi.devices.getDevices();
				if (devices != null) {
					for (const [_key, device] of Object.entries(devices)) {
						if (device.capabilitiesObj != null) {
							for (const [_key, capability] of Object.entries(device.capabilitiesObj)) {
								try {
									if (options.includeBooleans && capability.type === 'boolean') {
										results.push({
											name: capability.title ?? '[No name]',
											description: `${device.name} (${capability.value ? 'true' : 'false'})`,
											deviceName: device.name,
											id: capability.id,
											deviceId: device.id,
											type: 'capability',
										});
									} else if (
										options.includePercentages &&
										capability.type === 'number' &&
										capability.units !== undefined &&
										capability.units === '%'
									) {
										const min = capability.min ?? 0;
										const max = capability.max ?? 100;
										const currentValue = capability.value as number ?? 0;
										const percentageValue = max !== min ? Math.round(((currentValue - min) / (max - min)) * 100) : 0;

										results.push({
											name: capability.title ?? '[No name]',
											description: `${device.name} (${percentageValue}%)`,
											deviceName: device.name,
											id: capability.id,
											deviceId: device.id,
											type: 'capability',
										});
									} else if (
										options.includeRanges &&
										capability.type === 'number' &&
										capability.min !== undefined &&
										capability.max !== undefined
									) {
										results.push({
											name: capability.title ?? '[No name]',
											description: `${device.name} (${capability.value ?? '0'}${
												capability.units ? ` ${capability.units}` : ''
											})`,
											deviceName: device.name,
											id: capability.id,
											deviceId: device.id,
											type: 'capability',
										});
									} else if (options.includeNumbers && capability.type === 'number') {
										let description = device.name;
										if (capability.units != null || capability.value != null) {
											description += ` (${capability.value ?? '0'}${capability.units ? ` ${capability.units}` : ''})`;
										}
										results.push({
											name: capability.title ?? '[No name]',
											description: description,
											deviceName: device.name,
											id: capability.id,
											deviceId: device.id,
											type: 'capability',
										});
									} else if (options.includeText && capability.type === 'string') {
										let description = device.name;
										if (capability.value != null && capability.value != '') description += ` (${capability.value})`;
										results.push({
											name: capability.title ?? '[No name]',
											description: description,
											deviceName: device.name,
											id: capability.id,
											deviceId: device.id,
											type: 'capability',
										});
									}
								} catch (e) {
									void this.logger.logException(e);
								}
							}
						}
					}
				} else {
					void this.logger.logMessage('No devices found for autocomplete', true);
				}
			}

			if (options.fromVariables) {
				const variables = await this.homeyApi.logic.getVariables();
				for (const [_key, variable] of Object.entries(variables)) {
					if (options.includeBooleans && variable.type === 'boolean') {
						results.push({
							name: variable.name,
							description: `${this.homey.__('homey_variable')} (${variable.value ? 'true' : 'false'})`,
							id: variable.id,
							type: 'variable',
							deviceName: HOMEY_LOGIC,
						});
					} else if (options.includeNumbers && variable.type === 'number') {
						results.push({
							name: variable.name,
							description: `${this.homey.__('homey_variable')} (${variable.value ?? '0'})`,
							id: variable.id,
							type: 'variable',
							deviceName: HOMEY_LOGIC,
						});
					} else if (options.includeText && variable.type === 'string') {
						let description = `${this.homey.__('homey_variable')}`;
						if (variable.value != null && variable.value != '') description += ` (${variable.value})`;
						results.push({
							name: variable.name,
							description: description,
							id: variable.id,
							type: 'variable',
							deviceName: HOMEY_LOGIC,
						});
					}
				}
			}

			if (options.fromInsights) {
				if (options.includeDataPoints) {
					const insights = await this.homeyApi.insights.getLogs();
					if (insights != null) {
						for (const [key, insight] of Object.entries(insights)) {
							// TODO FILTER INSIGHTS!
							if (insight.type !== 'number') continue;

							let deviceName;
							if (insight.ownerUri.startsWith('homey:device:')) {
								const deviceId = insight.ownerUri.split('homey:device:')[1];
								try {
									const cachedDevice = this.deviceCache.get(deviceId);
									if (cachedDevice) {
										deviceName = cachedDevice.name;
									} else {
										const device = await this.homeyApi.devices.getDevice({ id: deviceId });
										deviceName = device.name;
										this.deviceCache.set(deviceId, device);
									}
								} catch (_e) {
									deviceName = key;
								}
							} else {
								deviceName = key;
							}

							let description = this.homey.__('homey_insight');

							if (insight.units != null || insight.lastValue != null) {
								description += ` (${insight.lastValue ?? '0'}${insight.units ? ` ${insight.units}` : ''})`;
							}

							let name = deviceName;
							if (insight.title)
								name += `: ${insight.title}`;

							results.push({
								name: name,
								description: description,
								id: insight.id,
								type: 'insight',
								deviceName: deviceName ?? '[No name]',
							});
						}
					}
				}
			}

			const filteredResults = options.query
				? results.filter(result => {
					const queryParts = options.query!.toLowerCase().split(' ');
					return queryParts.every(
						part => result.name.toLowerCase().includes(part) || result.deviceName.toLowerCase().includes(part),
					);
				})
				: results;

			filteredResults.sort((a, b) => {
				if (a.deviceName === DATAVISTA_APP_NAME && b.deviceName !== DATAVISTA_APP_NAME) {
					return -1;
				}
				if (a.deviceName !== DATAVISTA_APP_NAME && b.deviceName === DATAVISTA_APP_NAME) {
					return 1;
				}
				if (a.deviceName === HOMEY_LOGIC && b.deviceName !== HOMEY_LOGIC) {
					return -1;
				}
				if (a.deviceName !== HOMEY_LOGIC && b.deviceName === HOMEY_LOGIC) {
					return 1;
				}

				return a.name.localeCompare(b.name);
			});

			if (!options.query && options.optional) {
				filteredResults.unshift({
					name: this.homey.__('none'),
					id: '',
					deviceName: DATAVISTA_APP_NAME,
				});
			}

			return filteredResults;
		} catch (e) {
			void this.logger.logException(e);
			throw e;
		}
	}
}
