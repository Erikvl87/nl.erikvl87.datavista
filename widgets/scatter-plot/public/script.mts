import type HomeyWidget from 'homey/lib/HomeyWidget';
import type * as echarts from 'echarts';

// TODO: Merge all datasource type definitions!

type Timeframe = 'hour' | 'day' | 'week' | 'month' | 'year' | '60minutes' | '6hours' | '12hours' | '24hours' | '7days' | '31days' | '365days';
type Period = 'this' | 'last';

type Datasource = {
	deviceId: string;
	deviceName: string;
	id: string;
	name: string;
	type: 'insight';
};

type Settings = {
	showRefreshCountdown: boolean;
	datasourceX: Datasource;
	color: string;
	overwriteNameX: string;
	datasourceY: Datasource;
	overwriteNameY: string;
	timeframe: Timeframe;
	period: Period;
	tooltipFontSize: string;
	xMin: string;
	xMax: string;
	yMin: string;
	yMax: string;
	showTrendline: boolean;
	showCorrelation: boolean;
	showSampleSize: boolean;
};


class ScatterPlotWidgetScript {
	private settings: Settings;
	private homey: HomeyWidget;
	private chart!: echarts.ECharts;
	private configurationAnimationTimeout: NodeJS.Timeout | null | undefined;
	private static readonly RESOLUTION_LOOKUP: Record<Timeframe, Record<Period, string>> = {
		hour: {
			this: 'thisHour',
			last: 'lastHour',
		},
		day: {
			this: 'today',
			last: 'yesterday',
		},
		week: {
			this: 'thisWeek',
			last: 'lastWeek',
		},
		month: {
			this: 'thisMonth',
			last: 'lastMonth',
		},
		year: {
			this: 'thisYear',
			last: 'lastYear',
		},
		'60minutes': {
			this: 'this60Minutes',
			last: 'last60Minutes',
		},
		'6hours': {
			this: 'this6Hours',
			last: 'last6Hours',
		},
		'12hours': {
			this: 'this12Hours',
			last: 'last12Hours',
		},
		'24hours': {
			this: 'this24Hours',
			last: 'last24Hours',
		},
		'7days': {
			this: 'this7Days',
			last: 'last7Days',
		},
		'31days': {
			this: 'this31Days',
			last: 'last31Days',
		},
		'365days': {
			this: 'this365Days',
			last: 'last365Days',
		},
	};
	resolution!: string;
	scatterData?: [number, number][];
	unitsX: string = '';
	unitsY: string = '';
	refreshSyncDataTimeout: NodeJS.Timeout | null | undefined;
	nameX: string = 'datasourceX';
	nameY: string = 'datasourceY';
	language: string | undefined;
	timezone: string | undefined;
	windowStart: Date | null = null;
	windowEnd: Date | null = null;
	pairedCount: number = 0;
	totalPointsX: number = 0;
	totalPointsY: number = 0;
	private inConfigurationMode: boolean = false;

	constructor(homey: HomeyWidget) {
		this.settings = homey.getSettings() as Settings;

		const contrastColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--homey-color-mono-1000')
			.trim();

		if (!this.settings.color || this.settings.color === 'contrast') this.settings.color = contrastColor;

		this.homey = homey;
		this.resolution = ScatterPlotWidgetScript.getResolution(this.settings.timeframe, this.settings.period);
	}

	/**
	 * Logs a message to the Homey API.
	 * @param message - The message to log.
	 * @param logToSentry - Whether to log the message to Sentry.
	 * @param optionalParams - Additional parameters to include in the log.
	 */
	private async logMessage(message: string, logToSentry: boolean, ...optionalParams: any[]): Promise<void> {
		await this.homey.api('POST', '/logMessage', { message, logToSentry, optionalParams });
	}

	/**
	 * Logs an error to the Homey API.
	 * @param message - The error message to log.
	 * @param error - The error object to serialize and log.
	 */
	private async logError(message: string, error: Error): Promise<void> {
		const serializedError = JSON.stringify(error, Object.getOwnPropertyNames(error));
		await this.homey.api('POST', '/logError', { message, error: serializedError });
	}

	/**
	 * Determines the resolution string based on the timeframe and period.
	 * @param timeframe - The granularity of the data (e.g., 'day', 'week').
	 * @param period - The timeframe of the data (e.g., 'this', 'last').
	 * @returns The resolution string (e.g., 'today', 'thisWeek').
	 */
	private static getResolution(timeframe: Timeframe, period: Period): string {
		const resolutionByPeriod = ScatterPlotWidgetScript.RESOLUTION_LOOKUP[timeframe];
		if (!resolutionByPeriod) throw new Error(`Unknown timeframe: ${timeframe}`);

		const resolution = resolutionByPeriod[period];
		if (!resolution) throw new Error(`Unknown period: ${period}`);
		return resolution;
	}

	private async getData(): Promise<void> {
		const request: {
			datasourceX: { id: string };
			datasourceY: { id: string };
			settings: {
				timeframe: Timeframe;
				period: Period;
				insightResolution: string;
			};
		} = {
			settings: {
				timeframe: this.settings.timeframe,
				period: this.settings.period,
				insightResolution: this.resolution,
			},
			datasourceX: this.settings.datasourceX,
			datasourceY: this.settings.datasourceY,
		};

		const result = (await this.homey.api('POST', `/datasource`, request)) as {
			pairedData: [number, number][]; // [xValue, yValue] pairs
			updatesIn: number;
			nameX?: string;
			nameY?: string;
			unitsX?: string;
			unitsY?: string;
			pairedCount: number;
			totalPointsX: number;
			totalPointsY: number;
			windowStart?: string | null;
			windowEnd?: string | null;
		};

		if (!result || !result.pairedData) return;

		if (this.settings.datasourceX && this.settings.datasourceX.id) {
			this.nameX = this.settings.overwriteNameX || result.nameX || this.settings.datasourceX.name || this.nameX;
		}

		if (this.settings.datasourceY && this.settings.datasourceY.id) {
			this.nameY = this.settings.overwriteNameY || result.nameY || this.settings.datasourceY.name || this.nameY;
		}

		if (result.updatesIn !== Number.MAX_SAFE_INTEGER) {
			if (this.settings.showRefreshCountdown) document.getElementById('progress')!.style.display = 'block';
			this.scheduleCountdown(result.updatesIn);
		}

		this.unitsX = result.unitsX || '';
		this.unitsY = result.unitsY || '';

		this.windowStart = result.windowStart ? new Date(result.windowStart) : null;
		this.windowEnd = result.windowEnd ? new Date(result.windowEnd) : null;

		this.pairedCount = result.pairedCount ?? 0;
		this.totalPointsX = result.totalPointsX ?? 0;
		this.totalPointsY = result.totalPointsY ?? 0;

		this.scatterData = result.pairedData;
	}

	/**
	 * Gets the formatted time range text for display.
	 */
	private getTimeRangeText(): string {
		if (!this.windowStart || !this.windowEnd) return '';

		const formatDate = (date: Date): string => {
			if (this.settings.timeframe === 'hour' || this.settings.timeframe === 'day') {
				return date.toLocaleString(this.language, {
					timeZone: this.timezone,
					hour: '2-digit',
					minute: '2-digit',
				});
			}
			return date.toLocaleString(this.language, {
				timeZone: this.timezone,
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			});
		};

		return formatDate(this.windowStart) + ' – ' + formatDate(this.windowEnd);
	}

	/**
	 * Schedules a countdown timer for data refresh.
	 * @param updatesIn - The time in milliseconds until the next update.
	 */
	private scheduleCountdown(updatesIn: number): void {
		const progressBar = document.getElementById('progress-bar')!;

		const progressIcon = document.getElementById('progress-icon');
		progressBar.style.width = '100%';
		let countdown = Math.ceil(updatesIn / 1000);

		if (this.refreshSyncDataTimeout) {
			clearInterval(this.refreshSyncDataTimeout);
		}

		this.refreshSyncDataTimeout = setInterval(async () => {
			if (countdown <= 0) {
				clearInterval(this.refreshSyncDataTimeout!);
				this.refreshSyncDataTimeout = null;

				progressBar.style.width = '0%'; // Explicitly set to 0%

				// Respect the transition duration
				const transitionDuration = parseFloat(getComputedStyle(progressBar).transitionDuration.replace('s', '')) * 1000;

				await new Promise(resolve => setTimeout(resolve, transitionDuration));

				// Perform the spin animation
				if (progressIcon) {
					progressIcon.style.transition = 'transform 1s ease-in-out, color 1s ease-in-out';
					progressIcon.style.transform = 'rotate(720deg)';
					setTimeout(() => {
						progressIcon.style.transition = '';
						progressIcon.style.transform = '';
					}, 1000);
				}

				// Perform the action when countdown reaches 0
				await this.getData();
				await this.render();
			} else {
				const percentage = (countdown / (updatesIn / 1000)) * 100;
				progressBar.style.width = `${percentage}%`;
			}

			countdown--;
		}, 1000);
	}

	/**
	 * Format an axis or tooltip label; omits unit parens when no unit is set.
	 */
	private static labelWithUnit(name: string, unit: string): string {
		return unit ? `${name} (${unit})` : name;
	}

	/**
	 * Parse an axis bound string. Returns undefined for empty/invalid values so ECharts auto-scales.
	 */
	private static parseBound(value: string | undefined): number | undefined {
		if (value == null || value.trim() === '') return undefined;
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	/**
	 * Compute Pearson R, slope and intercept for a linear regression of paired data.
	 * Returns null if fewer than 2 unique X values are present.
	 */
	private static computeRegression(
		points: [number, number][],
	): { slope: number; intercept: number; r: number } | null {
		if (points.length < 2) return null;

		let sumX = 0;
		let sumY = 0;
		for (const [x, y] of points) {
			sumX += x;
			sumY += y;
		}
		const n = points.length;
		const meanX = sumX / n;
		const meanY = sumY / n;

		let varX = 0;
		let varY = 0;
		let covXY = 0;
		for (const [x, y] of points) {
			const dx = x - meanX;
			const dy = y - meanY;
			varX += dx * dx;
			varY += dy * dy;
			covXY += dx * dy;
		}

		if (varX === 0 || varY === 0) return null;

		const slope = covXY / varX;
		const intercept = meanY - slope * meanX;
		const r = covXY / Math.sqrt(varX * varY);
		return { slope, intercept, r };
	}

	/**
	 * Renders the correlation scatter chart.
	 */
	private async render(): Promise<void> {
		const hasBothDatasources = !!(this.settings.datasourceX?.id && this.settings.datasourceY?.id);

		if (!this.scatterData || this.scatterData.length === 0) {
			if (hasBothDatasources) {
				await this.stopConfigurationAnimation();
				this.renderNoOverlap();
				return;
			}
			await this.logMessage('No paired data available', false);
			await this.startConfigurationAnimation();
			return;
		}

		await this.stopConfigurationAnimation();

		const scatterData = this.scatterData;

		const mono200 = getComputedStyle(document.documentElement).getPropertyValue('--homey-color-mono-200').trim();
		const textColor = getComputedStyle(document.documentElement).getPropertyValue('--homey-text-color').trim();

		const xMin = ScatterPlotWidgetScript.parseBound(this.settings.xMin);
		const xMax = ScatterPlotWidgetScript.parseBound(this.settings.xMax);
		const yMin = ScatterPlotWidgetScript.parseBound(this.settings.yMin);
		const yMax = ScatterPlotWidgetScript.parseBound(this.settings.yMax);

		const xAxis = {
			type: 'value' as const,
			name: ScatterPlotWidgetScript.labelWithUnit(this.nameX, this.unitsX),
			nameLocation: 'middle' as const,
			nameGap: 30,
			scale: true,
			min: xMin,
			max: xMax,
			splitLine: {
				show: true,
				lineStyle: {
					color: mono200,
					width: 1,
					opacity: 0.5,
					type: 'dashed' as const,
				},
			},
		};

		const yAxis = {
			type: 'value' as const,
			name: ScatterPlotWidgetScript.labelWithUnit(this.nameY, this.unitsY),
			nameLocation: 'middle' as const,
			nameGap: 40,
			scale: true,
			min: yMin,
			max: yMax,
			splitLine: {
				show: true,
				lineStyle: {
					color: mono200,
					width: 1,
					opacity: 0.5,
					type: 'dashed' as const,
				},
			},
		};

		const regression = !this.inConfigurationMode && (this.settings.showTrendline || this.settings.showCorrelation)
			? ScatterPlotWidgetScript.computeRegression(scatterData)
			: null;

		let trendlineMarkLine: object | undefined;
		if (this.settings.showTrendline && regression) {
			const xs = scatterData.map(p => p[0]);
			const lineMin = xMin ?? Math.min(...xs);
			const lineMax = xMax ?? Math.max(...xs);
			trendlineMarkLine = {
				silent: true,
				symbol: ['none', 'none'],
				lineStyle: {
					color: this.settings.color,
					width: 2,
					type: 'dashed',
					opacity: 0.7,
				},
				label: { show: false },
				data: [[
					{ coord: [lineMin, regression.slope * lineMin + regression.intercept] },
					{ coord: [lineMax, regression.slope * lineMax + regression.intercept] },
				]],
			};
		}

		const series: object[] = [{
			name: `${this.nameX} vs ${this.nameY}`,
			type: 'scatter' as const,
			data: scatterData,
			symbolSize: 6,
			itemStyle: {
				color: this.settings.color,
				opacity: 0.7,
			},
			emphasis: {
				scale: 1.8,
				itemStyle: {
					opacity: 1,
					borderColor: textColor,
					borderWidth: 2,
					shadowBlur: 12,
					shadowColor: this.settings.color,
				},
			},
			markLine: trendlineMarkLine,
		}];

		const timeRangeText = this.getTimeRangeText();
		const correlationText = this.settings.showCorrelation && regression
			? `R² = ${(regression.r * regression.r).toFixed(3)}`
			: '';
		const pairedText = this.settings.showSampleSize && this.pairedCount > 0
			? (this.pairedCount === this.totalPointsX && this.pairedCount === this.totalPointsY
				? `n=${this.pairedCount}`
				: `n=${this.pairedCount} (X: ${this.totalPointsX}, Y: ${this.totalPointsY})`)
			: '';

		const subtextParts = [correlationText, pairedText].filter(Boolean);
		const subtext = subtextParts.join('  •  ');

		const titleBlock = (timeRangeText || subtext) ? {
			text: timeRangeText,
			subtext,
			left: 'right' as const,
			top: 10,
			textStyle: {
				fontSize: 12,
				color: textColor,
				fontWeight: 'normal' as const,
			},
			subtextStyle: {
				fontSize: 11,
				color: textColor,
			},
		} : undefined;

		const option = {
			title: titleBlock,
			tooltip: {
				trigger: 'item' as const,
				confine: true,
				borderColor: 'transparent',
				textStyle: {
					fontSize: 10,
					overflow: 'truncate',
				},
				formatter: (params: { data: [number, number]; seriesName?: string }): string => {
					const data = params.data;
					const xValue = typeof data[0] === 'number' ? (Number.isInteger(data[0]) ? data[0] : data[0].toFixed(2)) : data[0];
					const yValue = typeof data[1] === 'number' ? (Number.isInteger(data[1]) ? data[1] : data[1].toFixed(2)) : data[1];
					const xLabel = ScatterPlotWidgetScript.labelWithUnit(this.nameX, this.unitsX);
					const yLabel = ScatterPlotWidgetScript.labelWithUnit(this.nameY, this.unitsY);
					return `<div class="tooltip"><strong>${xLabel}:</strong> ${xValue}<br/><strong>${yLabel}:</strong> ${yValue}</div>`;
				},
			},
			grid: {
				top: titleBlock ? (subtext ? '50' : '35') : '20',
				left: '60',
				right: '20',
				bottom: '40',
				containLabel: false,
			},
			toolbox: {
				feature: {
					saveAsImage: {},
				},
			},
			xAxis: xAxis,
			yAxis: yAxis,
			series: series,
		};

		this.chart.setOption(option);
		this.chart.resize();
	}

	/**
	 * Render an explanatory message when both datasources are configured but
	 * no overlapping data points were paired in the selected time window.
	 */
	private renderNoOverlap(): void {
		const textColor = getComputedStyle(document.documentElement).getPropertyValue('--homey-text-color').trim();
		this.chart.clear();
		this.chart.setOption({
			title: {
				text: 'No overlapping data',
				subtext: this.totalPointsX === 0 || this.totalPointsY === 0
					? 'One of the datasources has no data in this period'
					: 'The two datasources have no aligned timestamps in this period',
				left: 'center',
				top: 'middle',
				textStyle: { fontSize: 14, color: textColor, fontWeight: 'normal' },
				subtextStyle: { fontSize: 11, color: textColor },
			},
		});
	}

	/**
	 * Starts a configuration animation for the chart.
	 * Used when no data is available or during initialization.
	 */
	private async startConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout) return;
		this.inConfigurationMode = true;

		const interval = 750;
		const data: [number, number][] = [];

		const update = async (): Promise<void> => {
			const x = Math.floor(Math.random() * 101);
			const y = Math.floor(Math.random() * 101);
			data.push([x, y]);
			if (data.length > 20) data.shift();

			this.scatterData = [...data];
			this.resolution = 'today';
			this.unitsX = 'X-axis';
			this.unitsY = 'Y-axis';
			this.nameX = 'Configure';
			this.nameY = 'Me';

			this.settings.timeframe = 'day';

			await this.render();
			this.configurationAnimationTimeout = setTimeout(update, interval);
		};

		this.configurationAnimationTimeout = setTimeout(update, interval);
	}

	/**
	 * Stops the configuration animation for the chart.
	 */
	private async stopConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout) clearTimeout(this.configurationAnimationTimeout);
		this.configurationAnimationTimeout = null;
		this.inConfigurationMode = false;
	}


	/**
	 * Called when the Homey API is ready.
	 */
	public async onHomeyReady(): Promise<void> {
		try {
			const result = (await this.homey.api('GET', '/getTimeAndLanguage')) as { timezone: string; language: string };
			this.language = result.language;
			this.timezone = result.timezone;

			this.chart = window.echarts.init(document.getElementById('scatter-chart'), null, {
				renderer: 'svg',
			});
			if (this.settings.datasourceX || this.settings.datasourceY)
				await this.getData();

			document.documentElement.style.setProperty('--tooltip-font-size', `${this.settings.tooltipFontSize}`);

			this.homey.ready();
			await this.render();
		} catch (error) {
			if (error instanceof Error) {
				await this.logError('An error occured while initializing the widget', error);
			} else {
				await this.logMessage('An error occured while initializing the widget', true, error);
			}
			await this.startConfigurationAnimation();
		}
	}
}

interface ModuleWindow extends Window {
	onHomeyReady: (homey: HomeyWidget) => Promise<void>;
	echarts: typeof echarts;
}

declare const window: ModuleWindow;

window.onHomeyReady = async (homey: HomeyWidget): Promise<void> =>
	await new ScatterPlotWidgetScript(homey).onHomeyReady();
