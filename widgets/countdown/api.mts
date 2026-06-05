import type { ApiRequest } from '../../@types/api-types.js';
import { BaseWidgetApi, WidgetDataPayload } from '../BaseWidgetApi.mjs';
import { BaseSettings } from '../../datavistasettings/BaseSettings.mjs';
import { CountdownData } from '../../datavistasettings/CountdownSettings.mjs';

export type CountdownPayload = {
	endDatetime: string;
	startDatetime: string | null;
	message: string | null;
	identifier: string;
	name: string | null;
};

class CountdownWidgetApi extends BaseWidgetApi {
	public async datasource({ homey, body }: ApiRequest): Promise<CountdownPayload | null> {
		const data: WidgetDataPayload | null = await this.getDatasource(homey.app, body.datasource);
		if (data == null) return null;

		if (!BaseWidgetApi.isDataType(homey.app, data, { countdown: true })) {
			void homey.app.logger.logMessage(
				`[${this.constructor.name}]: Unsupported data type for widget: ${(data.data as BaseSettings<unknown>)?.type ?? data.type}`,
				true,
				data,
			);
			return null;
		}

		const stored = data.data as BaseSettings<CountdownData>;
		return {
			endDatetime: stored.settings.endDatetime,
			startDatetime: stored.settings.startDatetime ?? null,
			message: stored.settings.message ?? null,
			identifier: stored.identifier,
			name: stored.settings.name ?? null,
		};
	}
}

export default new CountdownWidgetApi();
