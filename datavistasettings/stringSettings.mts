import { DATA_TYPE_IDS } from "../constants.mjs";
import { BaseSettingsRecord } from "./baseSettings.mjs";

export interface StringData {
	value: string;
}

export class StringSettings extends BaseSettingsRecord<StringData> {
	public override type = DATA_TYPE_IDS.STRING;

	constructor(identifier: string, data: StringData) {
		super(identifier, data);
	}
}