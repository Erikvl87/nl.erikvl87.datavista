import { ExtendedHomeyAPIV3Local } from 'homey-api';
import Homey from 'homey/lib/Homey';
import { Widget } from 'homey';
import { BaseWidget } from '../baseWidget.mjs';

export default class metricBarWidget extends BaseWidget {
	private static instance: metricBarWidget | null = null;
	private widget: Widget;

	private constructor(
		homey: Homey,
		homeyApi: ExtendedHomeyAPIV3Local,
		log: (...args: unknown[]) => void,
		error: (...args: unknown[]) => void,
	) {
		super(homey, homeyApi, log, error);
		this.widget = this.homey.dashboards.getWidget('metric-bar');
	}

	public static async initialize(
		homey: Homey,
		homeyApi: ExtendedHomeyAPIV3Local,
		log: (...args: unknown[]) => void,
		error: (...args: unknown[]) => void,
	): Promise<metricBarWidget> {
		if (this.instance === null) {
			this.instance = new this(homey, homeyApi, log, error);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		this.widget.registerSettingAutocompleteListener('datasource', async (query: string) => 
			this.autocompleteQuery({ 
				query,
				includePercentages: true,
				includeRanges: true,
				fromCapabilities: true,
				fromSettings: true
			}));
	}
}
