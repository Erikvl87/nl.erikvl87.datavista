import Homey from 'homey/lib/Homey';
import { FlowCardAction } from 'homey';
import { BaseDataAction } from './BaseActionData.mjs';
import DataVistaLogger from '../DataVistaLogger.mjs';
import { CountdownSettings } from '../datavistasettings/CountdownSettings.mjs';

export default class ActionSetCountdownDatetime extends BaseDataAction {
	private static instance: ActionSetCountdownDatetime | null = null;

	private actionCard: FlowCardAction;

	private constructor(
		homey: Homey,
		logger: DataVistaLogger
	) {
		super(homey, logger);
		this.actionCard = this.homey.flow.getActionCard('set-countdown-datetime');
	}

	public static async initialize(
		homey: Homey,
		logger: DataVistaLogger
	): Promise<ActionSetCountdownDatetime> {
		if (this.instance === null) {
			this.instance = new this(homey, logger);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		this.actionCard.registerRunListener(async (args, _state) => {
			const raw = args.datetime as string;

			// ISO 8601 local datetime (no Z / offset) — use as-is in Homey's timezone without
			// round-tripping through new Date(), which would interpret it as the Node process
			// timezone instead of Homey's configured timezone.
			const hasTimezone = /[Z+\-]\d*$/.test(raw.trim());

			const timezone = await this.homey.clock.getTimezone();
			const fmtDate = (date: Date): string => {
				const parts = new Intl.DateTimeFormat('en', {
					timeZone: timezone,
					year: 'numeric', month: '2-digit', day: '2-digit',
					hour: '2-digit', minute: '2-digit', second: '2-digit',
					hour12: false,
				}).formatToParts(date);
				const get = (t: string): string => parts.find(p => p.type === t)!.value;
				return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
			};

			let endDatetime: string;
			if (hasTimezone) {
				const parsed = new Date(raw);
				if (isNaN(parsed.getTime()))
					throw new Error(`Invalid ISO 8601 datetime: "${raw}"`);
				endDatetime = fmtDate(parsed);
			} else {
				// Validate basic structure before storing directly
				if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw.trim()))
					throw new Error(`Invalid ISO 8601 datetime: "${raw}"`);
				endDatetime = raw.trim().length === 16 ? `${raw.trim()}:00` : raw.trim();
			}

			this.writeData(new CountdownSettings(args.identifier, {
				endDatetime,
				startDatetime: fmtDate(new Date()),
				message: (args.message as string) || undefined,
				name: (args.name as string) || undefined,
			}));
		});
	}
}
