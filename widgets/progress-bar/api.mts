import type { ProgressBarWidgetData } from '../../datavistasettings/ProgressBarWidgetSettings.mjs';
import type { ApiRequest } from '../../@types/api-types.js';
import { BaseWidgetApi, WidgetDataPayload } from '../BaseWidgetApi.mjs';

export type ProgressBarWidgetPayload = {
	name: string,
	value: number | null;
	iconUrl?: string | null;
};

class ProgressBarWidgetApi extends BaseWidgetApi {
	public async datasource({ homey, body }: ApiRequest): Promise<WidgetDataPayload | null> {
		const data = await this.getDatasource(homey.app, body.datasource);
		if (data == null) return null;
		if (!BaseWidgetApi.isDataType(data, { number: true, percentage: true, range: true })) {
			void homey.app.logger.logMessage(`[${this.constructor.name}]: Unsupported data type for widget: ${data.type}`, true, data);
			return null;
		}

		return data;
	}

	public async configsource({ homey, body }: ApiRequest): Promise<ProgressBarWidgetData | null> {
		if (body.configsource == null) return null;

		const data = await this.getConfigsource<ProgressBarWidgetData>(homey.app, body.configsource);

		if (data == null) {
			void homey.app.logger.logMessage(`[${this.constructor.name}]: Config source with id '${body.configsource}' not found.`, false);
			return null;
		}

		return data.settings;
	}
}

export default new ProgressBarWidgetApi();