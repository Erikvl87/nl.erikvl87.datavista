import type { ApiRequest } from '../../@types/api-types.js';
import { BaseWidgetApi, WidgetDataPayload } from '../BaseWidgetApi.mjs';

class StatusBadgeWidgetApi extends BaseWidgetApi {
	public async datasource({ homey, body }: ApiRequest): Promise<{
		datasource: WidgetDataPayload | null;
	}> {
		let datasource = await this.getDatasource(homey.app, body.datasource);
		if (datasource && !BaseWidgetApi.isDataType(datasource, { boolean: true, status: true })) {
			void homey.app.logger.logMessage(`[${this.constructor.name}]: Unsupported datasource type for widget: ${datasource.type}`, true, datasource);
			datasource = null;
		}

		return {
			datasource,
		};
	}
}

export default new StatusBadgeWidgetApi();
