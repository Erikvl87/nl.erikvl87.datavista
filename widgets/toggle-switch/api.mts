import { DATAVISTA_APP_NAME } from "../../constants.mjs";
import type { ApiRequest } from "../../types.mjs";

export type toggleSwitchWidgetPayload = {
	value?: boolean | null;
	iconUrl?: string | null;
	name: string;
};

class ToggleSwitchWidgetApi {
	public async getCapabilityBoolean({ homey, query }: ApiRequest): Promise<toggleSwitchWidgetPayload | null> {
		const device = await homey.app.homeyApi.devices.getDevice({ id: query.deviceId });
		if (!device) {
			homey.app.log(`[${this.constructor.name}]: Device with id '${query.deviceId}' not found.`);
			return null;
		}

		const capability = device.capabilitiesObj[query.capabilityId];
		if (capability?.type !== 'boolean') {
			homey.app.log(
				`[${this.constructor.name}]: The capability with id '${query.capabilityId}' is not a boolean.`,
				capability,
			);
			return null;
		}

		const iconId = capability.iconObj?.id || device.iconObj?.id;
		let iconUrl = null;
		if (iconId != null) {
			iconUrl = `https://icons-cdn.athom.com/${iconId}.svg?ver=1`;
		}

		const payload: toggleSwitchWidgetPayload = {
			value: capability.value as boolean,
			iconUrl,
			name: `${device.name} - ${capability.title}`
		};

		return payload;
	}

	public async getAdvancedBoolean({ homey, query }: ApiRequest): Promise<toggleSwitchWidgetPayload | null> {
		const data = homey.app.homey.settings.get(query.key); // TODO, get "AS" type
		const payload: toggleSwitchWidgetPayload = {
			value: data.settings.value,
			iconUrl: null,
			name: `${DATAVISTA_APP_NAME} - ${data.identifier}`
		};

		return payload;
	}

	public async log({ homey, body }: ApiRequest): Promise<void> {
		homey.app.log(`[${this.constructor.name}]: ${body.message}`, ...body.optionalParams);
	}
}

export default new ToggleSwitchWidgetApi();