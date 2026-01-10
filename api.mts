import { DATA_TYPE_IDS, WIDGET_TYPE_IDS } from './constants.mjs';
import { AdvancedGaugeWidgetData } from './datavistasettings/AdvancedGaugeWidgetSettings.mjs';
import type { ApiRequest } from './@types/api-types.js';

class AppApi {
	public dataTypes(_request: ApiRequest): string[] {
		return [...Object.values(DATA_TYPE_IDS), ...Object.values(WIDGET_TYPE_IDS)];
	}

	public async getTimeAndLanguage({ homey }: ApiRequest): Promise<{ timezone: string; language: string }> {
		return await homey.app.getTimeAndLanguage();
	}

	public deleteData({ homey, params }: ApiRequest): boolean {
		const key = params.id;
		return homey.app.removeData(key);
	}

	public updateGauge({ homey, params, body }: ApiRequest): boolean {
		const key = params.id;
		let data: AdvancedGaugeWidgetData;
		try {
			data = {
				color1: body.color1,
				colorOffset1: this.convertToNumber(body.colorOffset1),
				color2: body.color2,
				colorOffset2: this.convertToNumber(body.colorOffset2),
				color3: body.color3,
				colorOffset3: this.convertToNumber(body.colorOffset3),
				color4: body.color4,
				colorOffset4: this.convertToNumber(body.colorOffset4),
				color5: body.color5,
				colorOffset5: this.convertToNumber(body.colorOffset5),
			};
		} catch (error) {
			return false;
		}

		const colorKeys: (keyof AdvancedGaugeWidgetData)[] = ['color1', 'color2', 'color3', 'color4', 'color5'];
		for (const colorKey of colorKeys) {
			const colorValue = data[colorKey] as string;
			if (colorValue && !/^#[0-9A-F]{6}$/i.test(colorValue)) {
				return false;
			}
		}

		return homey.app.updateGauge(key, data);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addGauge({ homey, params, body }: ApiRequest): boolean {
		const identifier = body.identifier;
		if (homey.settings.get(identifier)) {
			return false;
		}

		homey.app.addGauge(identifier, {});
		return true;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	public addProgressBar({ homey, params, body }: ApiRequest): boolean {
		const identifier = body.identifier;
		if (homey.settings.get(identifier)) {
			return false;
		}

		homey.app.addProgressBar(identifier, {});
		return true;
	}

	private convertToNumber(value: string | null | undefined): number | undefined {
		if (value == null || String(value).trim() === '') {
			return undefined;
		}

		if (String(value).includes(','))
			value = value.replace(',', '.');
		const numberValue = parseFloat(value);
		if (isNaN(numberValue)) {
			throw new Error(`Value '${value}' is not a number.`);
		}

		return numberValue;
	}
}

export default new AppApi();
