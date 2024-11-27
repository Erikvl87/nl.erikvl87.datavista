import Homey from 'homey';
import { HomeyAPI, ExtendedHomeyAPIV3Local } from 'homey-api';
import { Log } from 'homey-log';
import ActionSetDataPercentage from './actions/actionSetDataPercentage.mjs';
import ActionSetRange from './actions/actionSetDataRange.mjs';
import AdvancedGaugeWidget from './widgets/advanced-gauge/advancedGaugeWidget.mjs';
import ActionSetGaugeConfiguration from './actions/actionSetGaugeConfiguration.mjs';
import SimpleGaugeWidget from './widgets/simple-gauge/simpleGaugeWidget.mjs';
import { AdvancedGaugeWidgetData, AdvancedGaugeWidgetSettings } from './datavistasettings/advancedGaugeWidgetSettings.mjs';

export default class DataVista extends Homey.App {
	homeyApi!: ExtendedHomeyAPIV3Local;
	homeyLog?: Log;

	public override async onInit(): Promise<void> {
		this.homeyLog = new Log({ homey: this.homey });
		this.log(`${this.constructor.name} has been initialized`);

		this.homeyApi = await HomeyAPI.createAppAPI({
			homey: this.homey,
		});

		await ActionSetDataPercentage.initialize(this.homey, this.log, this.error);
		await ActionSetRange.initialize(this.homey, this.log, this.error);
		await SimpleGaugeWidget.initialize(this.homey, this.homeyApi, this.log, this.error);
		await AdvancedGaugeWidget.initialize(this.homey, this.log, this.error);

		await ActionSetGaugeConfiguration.initialize(this.homey, this.log, this.error);
		await ActionSetGaugeConfiguration.initialize(this.homey, this.log, this.error);
	}

	/**
	 * Get the timezone and language of this Homey.
	 * @returns An object containing the timezone and language.
	 */
	public async getTimeAndLanguage() : Promise<{ timezone: string, language: string}> {
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
		if(data == null) {
			this.homey.log(`Can't remove data with key '${key}' because it doesn't exist.`);
			return false;
		}

		this.homey.app.log(`[${this.constructor.name}] Deleting data with key '${key}'.`, data);
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
		if(existingData == null) {
			this.homey.log(`Can't update data with key '${key}' because it doesn't exist.`);
			return false;
		}

		const rangeSettings = new AdvancedGaugeWidgetSettings(existingData.identifier, data);
		rangeSettings.setSettings(this.homey);
		return true;
	}

	public addGauge(key: string, data: AdvancedGaugeWidgetData): void {
		const rangeSettings = new AdvancedGaugeWidgetSettings(key, data);
		rangeSettings.setSettings(this.homey);
	}
}
