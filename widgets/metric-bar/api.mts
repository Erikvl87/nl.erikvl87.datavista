import type { ApiRequest } from '../../types.mjs';
import { BaseWidgetApi, WidgetDataPayload } from '../baseWidgetApi.mjs';

export type progressBarWidgetPayload = {
	name: string,
	value: number | null;
	iconUrl?: string | null;
};

class metricBarWidgetApi extends BaseWidgetApi {
	public async datasource({ homey, body }: ApiRequest): Promise<WidgetDataPayload | null> {
		const data = await this.getDatasource(homey.app, body.datasource);
		if (data == null) return null;
		if (!BaseWidgetApi.isDataType(data, { number: true, percentage: true, range: true })) return null;
		return data;
	}
}

export default new metricBarWidgetApi();