import Homey from 'homey/lib/Homey';
import { FlowCardAction } from 'homey';
import { BaseDataAction } from './BaseActionData.mjs';
import DataVistaLogger from '../DataVistaLogger.mjs';
import { CountdownSettings } from '../datavistasettings/CountdownSettings.mjs';

export default class ActionSetCountdown extends BaseDataAction {
	private static instance: ActionSetCountdown | null = null;

	private actionCard: FlowCardAction;

	private constructor(
		homey: Homey,
		logger: DataVistaLogger
	) {
		super(homey, logger);
		this.actionCard = this.homey.flow.getActionCard('set-countdown');
	}

	public static async initialize(
		homey: Homey,
		logger: DataVistaLogger
	): Promise<ActionSetCountdown> {
		if (this.instance === null) {
			this.instance = new this(homey, logger);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		this.actionCard.registerRunListener(async (args, _state) => {
			// Homey's date arg returns "DD-MM-YYYY"; reorder to ISO "YYYY-MM-DD" for Date parsing
			const [day, month, year] = (args.date as string).split('-');
			const endDatetime = `${year}-${month}-${day}T${args.time}:00`;

			const timezone = await this.homey.clock.getTimezone();
			const parts = new Intl.DateTimeFormat('en', {
				timeZone: timezone,
				year: 'numeric', month: '2-digit', day: '2-digit',
				hour: '2-digit', minute: '2-digit', second: '2-digit',
				hour12: false,
			}).formatToParts(new Date());
			const get = (t: string): string => parts.find(p => p.type === t)!.value;
			const startDatetime = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

			this.writeData(new CountdownSettings(args.identifier, {
				endDatetime,
				startDatetime,
				message: (args.message as string) || undefined,
				name: (args.name as string) || undefined,
			}));
		});
	}
}
