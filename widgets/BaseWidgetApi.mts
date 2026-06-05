import DataVista from '../app.mjs';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';
import type { ApiRequest } from '../@types/api-types.js';
import { DataSource } from './BaseWidget.mjs';
import type { WidgetDataPayload } from '../services/getDatasource.mjs';

export type { WidgetDataPayload };

export class BaseWidgetApi {
	/**
	 * Get the time and language.
	 */
	protected async getTimeAndLanguage({ homey }: ApiRequest): Promise<{ timezone: string; language: string }> {
		return await homey.app.getTimeAndLanguage();
	}

	/**
	 * Get a configuration source.
	 */
	protected async getConfigsource<T>(app: DataVista, configsource: string): Promise<BaseSettings<T> | null> {
		return app.getConfigsource<T>(configsource);
	}

	/**
	 * Get the data source.
	 */
	protected async getDatasource(app: DataVista, datasource: DataSource): Promise<WidgetDataPayload | null> {
		return await app.getDatasource(datasource);
	}

	/**
	 * Check if the payload is of a certain data type.
	 */
	protected static isDataType(
		app: DataVista,
		payload: WidgetDataPayload,
		options: {
			status?: boolean;
			string?: boolean;
			boolean?: boolean;
			percentage?: boolean;
			number?: boolean;
			range?: boolean;
			datapoint?: boolean;
			countdown?: boolean;
		},
	): boolean {
		return app.isDataType(payload, options);
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
