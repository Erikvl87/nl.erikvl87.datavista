import { Widget } from 'homey';
import { ExtendedHomeyAPIV3Local } from 'homey-api';
import Homey from 'homey/lib/Homey';
import { BaseWidget } from '../BaseWidget.mjs';
import DataVistaLogger from '../../DataVistaLogger.mjs';

export default class ScatterPlotWidget extends BaseWidget {
	private static instance: ScatterPlotWidget | null = null;
	private widget: Widget;

	private constructor(
		homey: Homey,
		homeyApi: ExtendedHomeyAPIV3Local,
		logger: DataVistaLogger
	) {
		super(homey, homeyApi, logger);
		this.widget = this.homey.dashboards.getWidget('scatter-plot');
	}

	public static async initialize(
		homey: Homey,
		homeyApi: ExtendedHomeyAPIV3Local,
		logger: DataVistaLogger
	): Promise<ScatterPlotWidget> {
		if (this.instance === null) {
			this.instance = new this(homey, homeyApi, logger);
			await this.instance.setup();
		}
		return this.instance;
	}

	private async setup(): Promise<void> {
		['datasourceX', 'datasourceY'].forEach((setting) => {
			this.widget.registerSettingAutocompleteListener(setting, async (query: string) =>
				this.autocompleteQuery({
					query,
					includeDataPoints: true,
					fromInsights: true,
				}),
			);
		});
	}
}
