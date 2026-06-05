import { DATA_TYPE_IDS } from "../constants.mjs";
import { BaseSettingsRecord } from "./BaseSettings.mjs";

export interface CountdownData {
	endDatetime: string; // "YYYY-MM-DDTHH:MM:SS" — no timezone info, browser interprets as local time
	startDatetime?: string; // "YYYY-MM-DDTHH:MM:SS" — same format as endDatetime; when endDatetime was last set
	message?: string;
	name?: string;
}

export class CountdownSettings extends BaseSettingsRecord<CountdownData> {
	public override type = DATA_TYPE_IDS.COUNTDOWN;

	constructor(identifier: string, data: CountdownData) {
		super(identifier, data);
	}
}
