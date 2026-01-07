import Homey from 'homey';
import { HomeyAPI, ExtendedHomeyAPIV3Local } from 'homey-api';
import ActionSetDataPercentage from './actions/ActionSetDataPercentage.mjs';
import ActionSetRange from './actions/ActionSetDataRange.mjs';
import AdvancedGaugeWidget from './widgets/advanced-gauge/advancedGaugeWidget.mjs';
import ActionSetGaugeConfiguration from './actions/ActionSetGaugeConfiguration.mjs';
import SimpleGaugeWidget from './widgets/simple-gauge/simpleGaugeWidget.mjs';
import {
	AdvancedGaugeWidgetData,
	AdvancedGaugeWidgetSettings,
} from './datavistasettings/AdvancedGaugeWidgetSettings.mjs';
import ProgressBarWidget from './widgets/progress-bar/ProgressBarWidget.mjs';
import ToggleSwitchWidget from './widgets/toggle-switch/ToggleSwitchWidget.mjs';
import ActionSetDataBoolean from './actions/ActionSetDataBoolean.mjs';
import DataVistaLogger from './DataVistaLogger.mjs';
import LabelWidget from './widgets/label/LabelWidget.mjs';
import ActionSetDataString from './actions/ActionSetDataString.mjs';
import StatusBadgeWidget from './widgets/status-badge/StatusBadgeWidget.mjs';
import ActionSetDataColor from './actions/ActionSetDataStatus.mjs';
import LineChartWidget from './widgets/line-chart/LineChartWidget.mjs';
import ActionSetProgressBarConfiguration from './actions/ActionSetProgressBarConfiguration.mjs';
import { ProgressBarWidgetData, ProgressBarWidgetSettings } from './datavistasettings/ProgressBarWidgetSettings.mjs';
import ColorUtils from './common/ColorUtils.mjs';
import ScatterPlotWidget from './widgets/scatter-plot/ScatterPlotWidget.mjs';
import { createGetSvgForUrl } from './services/getSvgForUrl.mjs';
import { createGetConfigsource } from './services/getConfigsource.mjs';
import { createGetDatasource, WidgetDataPayload } from './services/getDatasource.mjs';
import { isDataType } from './services/isDataType.mjs';
import { BaseSettings } from './datavistasettings/BaseSettings.mjs';
import { DataSource } from './widgets/BaseWidget.mjs';

export type { WidgetDataPayload };

export default class DataVista extends Homey.App {
	homeyApi!: ExtendedHomeyAPIV3Local;
	logger!: DataVistaLogger;
	colorUtils!: ColorUtils;
	getSvgForUrl!: (url: string, color: string | null) => Promise<string>;
	getConfigsource!: <T>(configsource: string) => BaseSettings<T> | null;
	getDatasource!: (datasource: DataSource) => Promise<WidgetDataPayload | null>;

	public override async onInit(): Promise<void> {
		this.logger = await DataVistaLogger.initialize(this.homey, this.log, this.error);
		await this.logger.logMessage(`${this.constructor.name} has been initialized`);

		this.homeyApi = await HomeyAPI.createAppAPI({
			homey: this.homey,
		});

		this.colorUtils = ColorUtils.initialize(this.homey, this.logger);

		this.getSvgForUrl = createGetSvgForUrl(this.logger);
		this.getConfigsource = createGetConfigsource(this.homey, this.logger);
		this.getDatasource = createGetDatasource(this.homey, this.homeyApi, this.logger);

		await SimpleGaugeWidget.initialize(this.homey, this.homeyApi, this.logger);
		await AdvancedGaugeWidget.initialize(this.homey, this.homeyApi, this.logger);
		await ProgressBarWidget.initialize(this.homey, this.homeyApi, this.logger);
		await ToggleSwitchWidget.initialize(this.homey, this.homeyApi, this.logger);
		await LabelWidget.initialize(this.homey, this.homeyApi, this.logger);
		await StatusBadgeWidget.initialize(this.homey, this.homeyApi, this.logger);
		await LineChartWidget.initialize(this.homey, this.homeyApi, this.logger);
		await ScatterPlotWidget.initialize(this.homey, this.homeyApi, this.logger);

		await ActionSetDataPercentage.initialize(this.homey, this.logger);
		await ActionSetRange.initialize(this.homey, this.logger);
		await ActionSetGaugeConfiguration.initialize(this.homey, this.logger);
		await ActionSetDataBoolean.initialize(this.homey, this.logger);
		await ActionSetDataString.initialize(this.homey, this.logger);
		await ActionSetDataColor.initialize(this.homey, this.logger);
		await ActionSetProgressBarConfiguration.initialize(this.homey, this.logger);
	}

	/**
	 * Get the timezone and language of this Homey.
	 * @returns An object containing the timezone and language. Example: { timezone: 'Europe/Amsterdam', language: 'nl' }
	 */
	public async getTimeAndLanguage(): Promise<{ timezone: string; language: string }> {
		const timezone = await this.homey.clock.getTimezone();
		const language = this.homey.i18n.getLanguage();
		return { timezone, language };
	}

	/**
	 * Remove a data item from the settings.
	 * @param key The settings key to remove.
	 * @returns A boolean indicating a successful removal.
	 */
	public removeData(key: string): boolean {
		const data = this.homey.settings.get(key);
		if (data == null) {
			void this.logger.logMessage(`Can't remove data with key '${key}' because it doesn't exist.`);
			return false;
		}

		void this.logger.logMessage(`[${this.constructor.name}] Deleting data with key '${key}'.`, false, data);
		this.homey.app.homey.settings.unset(key);
		this.homey.api.realtime(`settings/${key}`, null);
		return true;
	}

	/**
	 * Update a range data item in the settings.
	 * @param key The settings key to update.
	 * @param data The new data to set.
	 * @returns A boolean indicating a successful removal.
	 */
	public updateGauge(key: string, data: AdvancedGaugeWidgetData): boolean {
		const existingData = this.homey.settings.get(key);
		if (existingData == null) {
			void this.logger.logMessage(`Can't update data with key '${key}' because it doesn't exist.`);
			return false;
		}

		const rangeSettings = new AdvancedGaugeWidgetSettings(existingData.identifier, data);
		rangeSettings.setSettings(this.homey, this.logger);
		return true;
	}

	/**
	 * Add a gauge to the settings.
	 * @param key The settings key to add.
	 * @param data The data to add.
	 * @returns A boolean indicating a successful removal.
	 */
	public addGauge(key: string, data: AdvancedGaugeWidgetData): void {
		const settings = new AdvancedGaugeWidgetSettings(key, data);
		settings.setSettings(this.homey, this.logger);
	}

	/**
	 * Add a gauge to the settings.
	 * @param key The settings key to add.
	 * @param data The data to add.
	 * @returns A boolean indicating a successful removal.
	 */
	public addProgressBar(key: string, data: ProgressBarWidgetData): void {
		const settings = new ProgressBarWidgetSettings(key, data);
		settings.setSettings(this.homey, this.logger);
	}



	/**
	 * Check if the payload is of a certain data type.
	 * @param payload The widget data payload.
	 * @param options Data type options to check.
	 * @returns True if the payload matches the specified data type.
	 */
	public isDataType(
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
		return isDataType(payload, options);
	}
}
