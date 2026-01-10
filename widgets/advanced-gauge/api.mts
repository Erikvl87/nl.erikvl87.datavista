import { BaseSettings } from "../../datavistasettings/BaseSettings.mjs";
import { AdvancedGaugeWidgetData } from "../../datavistasettings/AdvancedGaugeWidgetSettings.mjs";
import type { ApiRequest } from '../../@types/api-types.js';
import { BaseWidgetApi, WidgetDataPayload } from "../BaseWidgetApi.mjs";

export type AdvancedGaugeWidgetPayload = { data: WidgetDataPayload | null, config?: AdvancedGaugeWidgetData | null };

class AdvancedGaugeWidgetApi extends BaseWidgetApi {
	public async datasource({ homey, body }: ApiRequest): Promise<AdvancedGaugeWidgetPayload> {
		let data = await this.getDatasource(homey.app, body.datasource);
		if (data != null && !BaseWidgetApi.isDataType(data, { percentage: true, range: true })) {
			void homey.app.logger.logMessage(`[${this.constructor.name}]: Unsupported data type for widget: ${data.type}`, true, data);
			data = null;
		}

		let config = null;
		if(body.configsource)
			config = homey.app.homey.settings.get(body.configsource) as BaseSettings<AdvancedGaugeWidgetData>;

		return { data, config: config?.settings };
	}
}

export default new AdvancedGaugeWidgetApi();