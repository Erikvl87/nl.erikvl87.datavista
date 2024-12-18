import { CapabilitiesObject, ExtendedDevice, ExtendedVariable } from 'homey-api';
import DataVista from '../app.mjs';
import { BaseSettings } from '../datavistasettings/baseSettings.mjs';
import { ApiRequest } from '../types.mjs';
import { DATAVISTA_APP_NAME, HOMEY_LOGIC } from '../constants.mjs';

export type WidgetDataPayload = {
	type: 'capability' | 'variable' | 'advanced';
	name: string;
	fallbackIcon?: string | null,
	data: CapabilitiesObject | BaseSettings<unknown> | ExtendedVariable;
};

export class BaseWidgetApi {
	/**
	 * Get the data source.
	 */
	protected async getDatasource(app: DataVista, datasource: any) : Promise<WidgetDataPayload | null> {
		if (datasource?.type == null) return null;

		switch (datasource.type) {
			case 'capability': {
				const { device, capability } = (await this.getCapability(
					app,
					datasource.id,
					datasource.deviceId,
				)) ?? { device: null, capability: null };

				if (device == null || capability == null) return null;

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
			default:
				return null;
		}
	}

	/**
	 * Check if the payload is of a certain data type.
	 */
	protected static isDataType(payload: WidgetDataPayload, options: {
		string?: boolean;
		boolean?: boolean;
		percentage?: boolean;
		number?: boolean;
		range?: boolean;
	}): boolean {
		switch (payload.type) {
			case 'capability': {
				const capability = payload.data as CapabilitiesObject;
				if (options.boolean && capability.type === 'boolean') return true;
				if (options.percentage && capability.type === 'number' && capability.units === '%') return true;
				if (options.number && capability.type === 'number') return true;
				if (options.range && capability.type === 'number' && capability.min !== undefined && capability.max !== undefined) return true;
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
				if (options.boolean && advanced.type === 'boolean') return true;
				if (options.number && advanced.type === 'number') return true;
				if (options.percentage && advanced.type === 'percentage') return true;
				if (options.range && advanced.type === 'range') return true;
				if (options.string && advanced.type === 'string') return true;
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
		const device = await app.homeyApi.devices.getDevice({ id: deviceId });
		if (!device) {
			void app.logger.logMessage(`[${this.constructor.name}]: Device with id '${deviceId}' not found.`);
			return null;
		}

		const capability = device.capabilitiesObj[id];

		return {
			device,
			capability
		}
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
		const variable = await app.homeyApi.logic.getVariable({ id: id });
		if (!variable) {
			void app.logger.logMessage(`[${this.constructor.name}]: Variable with id '${id}' not found.`);
			return null;
		}

		return variable;
	}

	/**
	 * Log a message.
	 */
	public async log({ homey, body }: ApiRequest): Promise<void> {
		void homey.app.logger.logMessage(`[${this.constructor.name}]: ${body.message}`, body.logToSentry, ...body.optionalParams);
	}

	/**
	 * Get an icon.
	 */
	public async getIcon({ homey, query }: ApiRequest): Promise<string> {
		const svgSource = await homey.app.getSvgForUrl(query.url, query.color);
		return svgSource;
	}
}
