import Homey from 'homey/lib/Homey';
import { FlowCardAction } from 'homey';
import { BaseDataAction } from './BaseActionData.mjs';
import DataVistaLogger from '../DataVistaLogger.mjs';
import { CountdownSettings } from '../datavistasettings/CountdownSettings.mjs';

export default class ActionSetCountdownDuration extends BaseDataAction {
	private static instance: ActionSetCountdownDuration | null = null;

	private actionCard: FlowCardAction;

	private constructor(
		homey: Homey,
		logger: DataVistaLogger
	) {
		super(homey, logger);
		this.actionCard = this.homey.flow.getActionCard('set-countdown-duration');
	}

	public static async initialize(
		homey: Homey,
		logger: DataVistaLogger
	): Promise<ActionSetCountdownDuration> {
		if (this.instance === null) {
			this.instance = new this(homey, logger);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		this.actionCard.registerRunListener(async (args, _state) => {
			const totalMs =
				((args.days as number) ?? 0) * 86_400_000
				+ ((args.hours as number) ?? 0) * 3_600_000
				+ ((args.minutes as number) ?? 0) * 60_000
				+ ((args.seconds as number) ?? 0) * 1_000;

			const end = new Date(Date.now() + totalMs);
			const timezone = await this.homey.clock.getTimezone();

			const fmt = (date: Date): string => {
				const p = new Intl.DateTimeFormat('en', {
					timeZone: timezone,
					year: 'numeric', month: '2-digit', day: '2-digit',
					hour: '2-digit', minute: '2-digit', second: '2-digit',
					hour12: false,
				}).formatToParts(date);
				const get = (type: string): string => p.find(part => part.type === type)!.value;
				return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
			};

			this.writeData(new CountdownSettings(args.identifier as string, {
				endDatetime: fmt(end),
				startDatetime: fmt(new Date()),
				message: (args.message as string) || undefined,
				name: (args.name as string) || undefined,
			}));
		});
	}
}
