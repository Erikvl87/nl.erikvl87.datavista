import { DATA_TYPE_IDS } from "../constants.mjs";
import { BaseSettingsRecord } from "./baseSettings.mjs";

export interface BooleanData {
	value: boolean;
}

export class BooleanSettings extends BaseSettingsRecord<BooleanData> {
	public override type = DATA_TYPE_IDS.BOOLEAN;

	constructor(identifier: string, data: BooleanData) {
		super(identifier, data);
	}
}