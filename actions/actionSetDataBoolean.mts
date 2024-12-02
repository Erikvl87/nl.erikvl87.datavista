import Homey from 'homey/lib/Homey';
import { FlowCardAction } from 'homey';
import { BaseDataAction } from './baseActionData.mjs';
import { BooleanSettings } from '../datavistasettings/booleanSettings.mjs';

export default class actionSetDataBoolean extends BaseDataAction {
	private static instance: actionSetDataBoolean | null = null;

	private actionCard: FlowCardAction;

	private constructor(
		homey: Homey,
		log: (...args: unknown[]) => void,
		error: (...args: unknown[]) => void,
	) {
		super(homey, log, error);
		this.actionCard = this.homey.flow.getActionCard('set-boolean');
	}

	public static async initialize(
		homey: Homey,
		log: (...args: unknown[]) => void,
		error: (...args: unknown[]) => void,
	): Promise<actionSetDataBoolean> {
		if (this.instance === null) {
			this.instance = new this(homey, log, error);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		this.actionCard.registerRunListener(async (args, _state) => {
			this.writeData(new BooleanSettings(args.identifier, {
				value: args.value,
			}));
		});
	}
}
