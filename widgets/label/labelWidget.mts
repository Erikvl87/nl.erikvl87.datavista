import { ExtendedHomeyAPIV3Local } from 'homey-api';
import Homey from 'homey/lib/Homey';
import { Widget } from 'homey';
import { BaseWidget } from '../baseWidget.mjs';
import DataVistaLogger from '../../dataVistaLogger.mjs';

export default class labelWidget extends BaseWidget {
	private static instance: labelWidget | null = null;
	private widget: Widget;

	private constructor(
		homey: Homey,
		homeyApi: ExtendedHomeyAPIV3Local,
		logger: DataVistaLogger
	) {
		super(homey, homeyApi, logger);
		this.widget = this.homey.dashboards.getWidget('label');
	}

	public static async initialize(
		homey: Homey,
		homeyApi: ExtendedHomeyAPIV3Local,
		logger: DataVistaLogger
	): Promise<labelWidget> {
		if (this.instance === null) {
			this.instance = new this(homey, homeyApi, logger);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		this.widget.registerSettingAutocompleteListener('datasource', async (query: string) => 
			this.autocompleteQuery({
				query,
				includeStrings: true,
				fromCapabilities: true,
				fromSettings: true,
				fromVariables: true
			}));
	}
}
