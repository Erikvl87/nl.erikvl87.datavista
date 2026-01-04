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
	datasource1?: Datasource;
	color1: string;
	overwriteName1: string;
	datasource2?: Datasource;
	color2: string;
	overwriteName2: string;
	datasource3?: Datasource;
	color3?: string;
	overwriteName3?: string;
	datasource4?: Datasource;
	color4?: string;
	overwriteName4?: string;
	timeframe: Timeframe;
	period1: Period;
	period2: Period;
	period3?: Period;
	period4?: Period;
	yAxisCalculationMethod: 'fullRange' | 'iqr' | 'sameAxis';
	hideLegend: boolean;
	tooltipFontSize: string;
	legendFontSize: string;
};

type TooltipParam = {
	marker: string;
	seriesName: string;
	seriesIndex: number;
	value: [string | number | Date, number | '-'];
};

interface AxisDefinition {
	unit: string;
	color: string;
	min: number;
	max: number;
	datasetIndices: number[];
}

class LineChartWidgetScript {
	private settings: Settings;
	private homey: HomeyWidget;
	private chart!: echarts.ECharts;
	private axisAssignments: number[] = [-1, -1, -1, -1];
	private axisDefinitions: AxisDefinition[] = [];
	private seriesNameByDatasetIndex: Array<string | undefined> = [];
	private displayNameByLegendName: Record<string, string> = {};
	private axisLabelCache: string[] = [];
	private seriesVisibility: boolean[] = [true, true, true, true];
	private configurationAnimationTimeout: NodeJS.Timeout | null | undefined;
	private static readonly RESOLUTION_LOOKUP: Record<Exclude<Timeframe, 'hour'>, Record<Period, string>> = {
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
	resolution1!: string;
	resolution2!: string;
	resolution3!: string;
	resolution4!: string;
	data1?: [Date, number | '-'][];
	data2?: [Date, number | '-'][];
	data3?: [Date, number | '-'][];
	data4?: [Date, number | '-'][];
	units1: string = '';
	units2: string = '';
	units3: string = '';
	units4: string = '';
	refreshSyncDataTimeout: NodeJS.Timeout | null | undefined;
	name1: string = 'datasource1';
	name2: string = 'datasource2';
	name3: string = 'datasource3';
	name4: string = 'datasource4';
	timezone: string | undefined;
	language: string | undefined;
	dateMin: Date | null = null;
	dateMax: Date | null = null;
	windowStart: Date | null = null;
	windowEnd: Date | null = null;
	shiftOffsetMs: number[] = [0, 0, 0, 0];

	constructor(homey: HomeyWidget) {
		this.settings = homey.getSettings() as Settings;

		const contrastColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--homey-color-mono-1000')
			.trim();

		if (!this.settings.color1 || this.settings.color1 === 'contrast') this.settings.color1 = contrastColor;
		if (!this.settings.color2 || this.settings.color2 === 'contrast') this.settings.color2 = contrastColor;
		if (!this.settings.color3 || this.settings.color3 === 'contrast') this.settings.color3 = contrastColor;
		if (!this.settings.color4 || this.settings.color4 === 'contrast') this.settings.color4 = contrastColor;

		this.homey = homey;
		this.resolution1 = LineChartWidgetScript.getResolution(this.settings.timeframe, this.settings.period1);
		this.resolution2 = LineChartWidgetScript.getResolution(this.settings.timeframe, this.settings.period2);
		this.resolution3 = LineChartWidgetScript.getResolution(this.settings.timeframe, this.settings.period3 ?? this.settings.period1);
		this.resolution4 = LineChartWidgetScript.getResolution(this.settings.timeframe, this.settings.period4 ?? this.settings.period1);
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
		if (timeframe === 'hour') return 'last6Hours';

		const resolutionByPeriod = LineChartWidgetScript.RESOLUTION_LOOKUP[timeframe];
		if (!resolutionByPeriod) throw new Error(`Unknown timeframe: ${timeframe}`);

		const resolution = resolutionByPeriod[period];
		if (!resolution) throw new Error(`Unknown period: ${period}`);
		return resolution;
	}

	/**
	 * Converts a hex color to an RGBA string.
	 * @param hex - The hex color string (e.g., "#ff0000").
	 * @param opacity - The opacity value (0 to 1).
	 * @returns The RGBA color string.
	 * @throws Error if the hex color is invalid.
	 */
	private static hexToRgba(hex: string, opacity: number): string {
		const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
		hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);

		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) {
			throw new Error(`Invalid hex color: ${hex}`);
		}

		const r = parseInt(result[1], 16);
		const g = parseInt(result[2], 16);
		const b = parseInt(result[3], 16);

		return `rgba(${r}, ${g}, ${b}, ${opacity})`;
	}

	private getFriendlyResolutionTranslationId(resolution: string, period: Period): string {
		if (this.settings.timeframe !== 'hour') 
			return resolution;

		if (period === 'this') {
			return 'thisHour';
		} else if (period === 'last') {
			return 'lastHour';
		} else {
			return 'rollingHour';
		}
	}

	/**
	 * Reverses the normalization shift for a date to get the original timestamp.
	 * Uses the shift offset provided by the backend.
	 */
	private reverseNormalizationShift(date: Date, seriesIndex: number): Date | null {
		const offset = this.shiftOffsetMs[seriesIndex];
		if (offset === 0) {
			return null;
		}

		// Subtract the offset to get the original timestamp
		return new Date(date.getTime() - offset);
	}

	private async getData(): Promise<void> {
		const request: {
			datasource1?: { id: string; insightResolution: string };
			datasource2?: { id: string; insightResolution: string };
			datasource3?: { id: string; insightResolution: string };
			datasource4?: { id: string; insightResolution: string };
			settings: {
				timeframe: Timeframe;
				period1: Period;
				period2: Period;
				period3?: Period;
				period4?: Period;
			};
		} = {
			settings: {
				timeframe: this.settings.timeframe,
				period1: this.settings.period1,
				period2: this.settings.period2,
				period3: this.settings.period3,
				period4: this.settings.period4,
			},
		};

		if (this.settings.datasource1?.id) {
			request.datasource1 = {
				...this.settings.datasource1,
				insightResolution: this.resolution1,
			};
		}

		if (this.settings.datasource2?.id?.trim()) {
			request.datasource2 = {
				...this.settings.datasource2,
				insightResolution: this.resolution2,
			};
		}

		if (this.settings.datasource3?.id?.trim()) {
			request.datasource3 = {
				...this.settings.datasource3,
				insightResolution: this.resolution3,
			};
		}

		if (this.settings.datasource4?.id?.trim()) {
			request.datasource4 = {
				...this.settings.datasource4,
				insightResolution: this.resolution4,
			};
		}

		const result = (await this.homey.api('POST', `/datasource`, request)) as {
			data1: [Date, number | '-'][];
			data2: [Date, number | '-'][];
			data3: [Date, number | '-'][];
			data4: [Date, number | '-'][];
			updatesIn: number;
			name1?: string;
			name2?: string;
			name3?: string;
			name4?: string;
			units1?: string;
			units2?: string;
			units3?: string;
			units4?: string;
			windowStart: Date | null;
			windowEnd: Date | null;
			shiftOffsetMs1: number;
			shiftOffsetMs2: number;
			shiftOffsetMs3: number;
			shiftOffsetMs4: number;
		};

		// TODO: if all is null

		if (result.data1 !== null && this.settings.datasource1?.id) {
			const fallbackName = result.name1 ?? this.settings.datasource1.name ?? this.name1;
			this.name1 = (this.settings.overwriteName1?.trim())
				? this.settings.overwriteName1
				: `${fallbackName} (${this.homey.__(this.getFriendlyResolutionTranslationId(this.resolution1, this.settings.period1))})`;
		}

		if (result.data2 !== null && this.settings.datasource2?.id) {
			const fallbackName = result.name2 ?? this.settings.datasource2.name ?? this.name2;
			this.name2 = (this.settings.overwriteName2?.trim())
				? this.settings.overwriteName2
				: `${fallbackName} (${this.homey.__(this.getFriendlyResolutionTranslationId(this.resolution2, this.settings.period2))})`;
		}

		if (result.data3 !== null && this.settings.datasource3?.id) {
			const fallbackName = result.name3 ?? this.settings.datasource3.name ?? this.name3;
			this.name3 = (this.settings.overwriteName3?.trim())
				? this.settings.overwriteName3
				: `${fallbackName} (${this.homey.__(this.getFriendlyResolutionTranslationId(this.resolution3, this.settings.period3 ?? this.settings.period1))})`;
		}

		if (result.data4 !== null && this.settings.datasource4?.id) {
			const fallbackName = result.name4 ?? this.settings.datasource4.name ?? this.name4;
			this.name4 = (this.settings.overwriteName4?.trim())
				? this.settings.overwriteName4
				: `${fallbackName} (${this.homey.__(this.getFriendlyResolutionTranslationId(this.resolution4, this.settings.period4 ?? this.settings.period1))})`;
		}

		if (result.updatesIn !== Number.MAX_SAFE_INTEGER) {
			if (this.settings.showRefreshCountdown) document.getElementById('progress')!.style.display = 'block';
			this.scheduleCountdown(result.updatesIn);
		}

		this.windowStart = result.windowStart;
		this.windowEnd = result.windowEnd;
		this.shiftOffsetMs = [result.shiftOffsetMs1, result.shiftOffsetMs2, result.shiftOffsetMs3, result.shiftOffsetMs4];

		await this.setData(
			result.data1,
			result.units1 ?? '',
			result.data2,
			result.units2 ?? '',
			result.data3,
			result.units3 ?? '',
			result.data4,
			result.units4 ?? '',
		);
	}

	private async setData(
		data1: [Date, number | '-'][],
		units1: string,
		data2: [Date, number | '-'][],
		units2: string,
		data3?: [Date, number | '-'][],
		units3: string = '',
		data4?: [Date, number | '-'][],
		units4: string = '',
	): Promise<void> {
		const normalize = (data: [Date | string, number | '-'][] | undefined): [Date, number | '-'][] => {
			if (!data) return [];
			return data.map(([d, v]) => [d instanceof Date ? d : new Date(d), v]);
		};
		this.data1 = normalize(data1);
		this.data2 = normalize(data2);
		this.data3 = normalize(data3);
		this.data4 = normalize(data4);

		this.units1 = units1;
		this.units2 = units2;
		this.units3 = units3;
		this.units4 = units4;

		const datasetsForScale: [Date, number | '-'][][] = [
			this.data1 ?? [],
			this.data2 ?? [],
			this.data3 ?? [],
			this.data4 ?? [],
		];
		const unitsForScale = [this.units1, this.units2, this.units3, this.units4];
		const colorsForScale = [
			this.settings.color1,
			this.settings.color2 ?? this.settings.color1,
			this.settings.color3 ?? this.settings.color1,
			this.settings.color4 ?? this.settings.color1,
		];
		const activeDatasetCount = datasetsForScale.filter(dataset => dataset.length > 0).length;
		if (activeDatasetCount > 0) {
			const layout = await this.determineAxisLayout(datasetsForScale, unitsForScale, colorsForScale);
			this.axisAssignments = layout.assignments;
			this.axisDefinitions = layout.axes;
		} else {
			this.axisAssignments = [-1, -1, -1, -1];
			this.axisDefinitions = [];
		}

		const allDates = [this.data1, this.data2, this.data3, this.data4]
			.flatMap(dataset => (dataset ?? []).map(point => point[0]))
			.filter((value): value is Date => value instanceof Date);
		if (allDates.length) {
			this.dateMin = new Date(Math.min(...allDates.map(date => date.getTime())));
			this.dateMax = new Date(Math.max(...allDates.map(date => date.getTime())));
		} else {
			this.dateMin = null;
			this.dateMax = null;
		}
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
	 * Determines whether the data for the current timeframe is potentially incomplete.
	 * @returns True if the data might not be complete, otherwise false.
	 */
	private potentiallyNotComplete(): boolean {
		if (!['hour', 'day', 'week', 'month', 'year'].includes(this.settings.timeframe)) {
			return false;
		}

		// Check all configured datasources - if any has 'this' period, data might be incomplete
		const datasourcePeriodPairs = [
			{ datasource: this.settings.datasource1, period: this.settings.period1 },
			{ datasource: this.settings.datasource2, period: this.settings.period2 },
			{ datasource: this.settings.datasource3, period: this.settings.period3 },
			{ datasource: this.settings.datasource4, period: this.settings.period4 },
		];

		const activeDatasources = datasourcePeriodPairs.filter(pair => pair.datasource?.id);
		if (activeDatasources.length === 0) return false;

		// If any active datasource uses 'this' period, the data is potentially incomplete
		return activeDatasources.some(pair => pair.period === 'this');
	}

	/**
	 * Determines the appropriate options for rendering based on the timeframe and data range.
	 * @param timeframe - The selected timeframe (e.g., 'week', 'month', 'year').
	 * @param dateMin - The minimum date in the dataset.
	 * @param dateMax - The maximum date in the dataset.
	 * @returns An object containing options for rendering and intervals.
	 */
	private getTimeframeOptions(timeframe: Timeframe): {
		options: Intl.DateTimeFormatOptions;
		interval: number;
	} {
		const dateMin = this.dateMin!;
		const dateMax = this.dateMax!;
		const diff = Math.abs(dateMin.getTime() - dateMax.getTime());
		const options: Intl.DateTimeFormatOptions = {};
		let interval = 0;

		switch (timeframe) {
			case 'hour':
			case 'day': {
				const diffInMinutes = Math.ceil(diff / (1000 * 60));
				if (diffInMinutes < 2) {
					// Probably in demo mode
					interval = 10000; // 10 seconds
				} else {
					interval = 1000 * 60 * 10;
				}
				break;
			}
			case 'week': {
				const diffInDays = Math.ceil(diff / (1000 * 3600 * 24));
				if (diffInDays < 4) {
					options.hour = '2-digit';
					options.minute = '2-digit';
					interval = 3600 * 1000 * 4; // 4 hours
				} else {
					interval = 3600 * 1000 * 24; // 1 day
				}
				break;
			}
			case 'month': {
				const diffInDays = Math.ceil(diff / (1000 * 3600 * 24));
				if (diffInDays < 3) {
					options.hour = '2-digit';
					options.minute = '2-digit';
					interval = 3600 * 1000 * 6; // 6 hours
				} else {
					interval = 3600 * 1000 * 24; // 1 day
				}
				break;
			}
			case 'year': {
				const diffInMonths = Math.ceil(diff / (1000 * 3600 * 24 * 30));
				if (diffInMonths < 3) {
					options.month = '2-digit';
					options.day = '2-digit';
					interval = 3600 * 1000 * 24; // 1 day
				} else {
					interval = 3600 * 1000 * 24 * 27; // 27 days
				}
				break;
			}
		}

		return { options, interval };
	}

	/**
	 * Formats the X-axis value based on the selected timeframe and language.
	 * * @param value - The value to format.
	 * @param friendly - Whether the value is for a tooltip or not.
	 * @return The formatted value as a string.
	 * @throws Error if the value is not a valid date.
	 * */
	private formatXAxisValue(value: string, friendly: boolean = false): string {
		const capitalizeFirstLetter = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);

		const date = new Date(value);

		const options: Intl.DateTimeFormatOptions = {
			timeZone: this.timezone,
			weekday: this.settings.timeframe === 'week' || this.settings.timeframe === '7days' ? (friendly ? 'long' : 'short') : undefined,
			day: this.settings.timeframe === 'month' || this.settings.timeframe === '31days' ? 'numeric' : undefined,
			month: this.settings.timeframe === 'year' || this.settings.timeframe === '365days' ? (friendly ? 'long' : 'short') : undefined,
			hour: (
				friendly
					? this.settings.timeframe !== 'year' && this.settings.timeframe !== '365days' && this.settings.timeframe !== 'hour' && this.settings.timeframe !== '60minutes'
					: this.settings.timeframe === 'day' || this.settings.timeframe === '24hours' || this.settings.timeframe === '6hours' || this.settings.timeframe === '12hours'
			)
				? 'numeric'
				: undefined,
			minute: (
				friendly
					? this.settings.timeframe !== 'year' && this.settings.timeframe !== '365days'
					: this.settings.timeframe === 'day' || this.settings.timeframe === '24hours' || this.settings.timeframe === 'hour' || this.settings.timeframe === '60minutes' || this.settings.timeframe === '6hours' || this.settings.timeframe === '12hours'
			)
				? '2-digit'
				: undefined,
			hourCycle: this.settings.timeframe === 'day' || this.settings.timeframe === '60minutes' || this.settings.timeframe === '6hours' || this.settings.timeframe === '12hours' ? 'h23' : undefined,
		};

		if (!friendly && this.potentiallyNotComplete() && this.dateMin && this.dateMax) {
			const { options: adjustedOptions } = this.getTimeframeOptions(this.settings.timeframe);
			Object.assign(options, adjustedOptions);
		}

		let formattedDate = Intl.DateTimeFormat(this.language, options).format(date).replace(',', '');

		if (friendly) {
			switch (this.settings.timeframe) {
				case 'hour':
				case '60minutes':
					formattedDate = this.homey.__('minute') + ' ' + formattedDate;
					break;
				case 'month':
				case '31days':
					formattedDate = this.homey.__('day') + ' ' + formattedDate;
					break;
			}
		} else if (options.hour || options.minute) {
			formattedDate = formattedDate.replace(' ', '\n');
		}
		return capitalizeFirstLetter(formattedDate);
	}

	/**
	 * Determines whether a second Y-axis is required based on the data ranges and settings.
	 * @param data1 - The first dataset.
	 * @param data2 - The second dataset.
	 * @returns True if a second axis is required, otherwise false.
	 */
	private async determineAxisLayout(
		datasets: [Date, number | '-'][][],
		units: string[],
		colors: (string | undefined)[],
	): Promise<{ assignments: number[]; axes: AxisDefinition[] }> {
		const assignments: number[] = [-1, -1, -1, -1];
		const activeDatasets = datasets
			.map((data, index) => ({
				index,
				data,
				unit: units[index] ?? '',
				color: colors[index],
			}))
			.filter(entry => entry.data.length > 0);

		if (!activeDatasets.length) return { assignments, axes: [] };

		const computeMetrics = (data: [Date, number | '-'][]): { min: number; max: number; range: number } => {
			const numericValues = data
				.map(point => point[1])
				.filter((value): value is number => typeof value === 'number');
			if (!numericValues.length) return { min: 0, max: 0, range: 0 };

			let values = numericValues;
			if (this.settings.yAxisCalculationMethod === 'iqr') {
				const sortedValues = [...numericValues].sort((a, b) => a - b);
				const q1 = sortedValues[Math.floor(sortedValues.length / 4)];
				const q3 = sortedValues[Math.floor((sortedValues.length * 3) / 4)];
				const iqr = q3 - q1;
				const lowerBound = q1 - 1.5 * iqr;
				const upperBound = q3 + 1.5 * iqr;
				const bounded = numericValues.filter(value => value >= lowerBound && value <= upperBound);
				if (bounded.length) values = bounded;
			}

			const min = Math.min(...values);
			const max = Math.max(...values);
			return { min, max, range: max - min };
		};

		const datasetMetrics = activeDatasets.map(entry => ({
			...entry,
			metrics: computeMetrics(entry.data),
		}));

		if (this.settings.yAxisCalculationMethod === 'sameAxis' || datasetMetrics.length === 1) {
			datasetMetrics.forEach(entry => {
				assignments[entry.index] = 0;
			});
			const primary = datasetMetrics[0];
			const aggregated = datasetMetrics.reduce(
				(acc, entry) => ({
					min: Math.min(acc.min, entry.metrics.min),
					max: Math.max(acc.max, entry.metrics.max),
				}),
				{ min: primary.metrics.min, max: primary.metrics.max },
			);
			return {
				assignments,
				axes: [
					{
						unit: primary.unit,
						color: primary.color ?? this.settings.color1,
						min: aggregated.min,
						max: aggregated.max,
						datasetIndices: datasetMetrics.map(entry => entry.index),
					},
				],
			};
		}

		const threshold = 10;
		const axes: AxisDefinition[] = [];
		const tryAssignToAxis = (axis: AxisDefinition, metrics: { min: number; max: number; range: number }): boolean => {
			const axisRange = axis.max - axis.min;
			const combinedMin = Math.min(axis.min, metrics.min);
			const combinedMax = Math.max(axis.max, metrics.max);
			const combinedRange = combinedMax - combinedMin;
			const largestIndividualRange = Math.max(axisRange, metrics.range);

			if (largestIndividualRange === 0) return combinedRange === 0;
			if (axisRange > 0 && metrics.range > 0) {
				const rangeRatio = Math.max(axisRange, metrics.range) / Math.min(axisRange, metrics.range);
				if (rangeRatio > threshold) return false;
			}

			return combinedRange / largestIndividualRange <= threshold;
		};

		for (const entry of datasetMetrics) {
			let axisIndex = -1;
			for (let index = 0; index < axes.length; index += 1) {
				const axis = axes[index];
				if (axis.unit !== entry.unit) continue;
				if (tryAssignToAxis(axis, entry.metrics)) {
					axisIndex = index;
					break;
				}
			}

			if (axisIndex === -1) {
				axisIndex = axes.length;
				axes.push({
					unit: entry.unit,
					color: entry.color ?? this.settings.color1,
					min: entry.metrics.min,
					max: entry.metrics.max,
					datasetIndices: [entry.index],
				});
			} else {
				const axis = axes[axisIndex];
				axis.min = Math.min(axis.min, entry.metrics.min);
				axis.max = Math.max(axis.max, entry.metrics.max);
				axis.datasetIndices.push(entry.index);
			}

			assignments[entry.index] = axisIndex;
		}

		return { assignments, axes };
	}

	/**
	 * Renders the chart using the current data and settings.
	 * Updates the chart options and legend toggles.
	 */
	private async render(): Promise<void> {
		const datasets = [
			{
				data: this.data1 ?? [],
				name: this.name1,
				color: this.settings.color1,
				datasource: this.settings.datasource1,
				units: this.units1,
			},
			{
				data: this.data2 ?? [],
				name: this.name2,
				color: this.settings.color2,
				datasource: this.settings.datasource2,
				units: this.units2,
			},
			{
				data: this.data3 ?? [],
				name: this.name3,
				color: this.settings.color3 ?? this.settings.color1,
				datasource: this.settings.datasource3,
				units: this.units3,
			},
			{
				data: this.data4 ?? [],
				name: this.name4,
				color: this.settings.color4 ?? this.settings.color1,
				datasource: this.settings.datasource4,
				units: this.units4,
			},
		];

		if (!datasets.some(dataset => dataset.data.length > 0)) {
			await this.logMessage('The payload is null', false);
			await this.startConfigurationAnimation();
			return;
		}

		await this.stopConfigurationAnimation();

		let splitNumber = 1;
		const referenceData = datasets.find(dataset => dataset.data.length)?.data ?? [];
		switch (this.settings.timeframe) {
			case 'hour':
			case '60minutes':
			case '6hours':
			case '12hours':
			case 'day':
			case '24hours':
				splitNumber = 6;
				break;
			case 'week':
			case '7days':
				splitNumber = 7;
				break;
			case 'month':
			case '31days': {
				if (referenceData.length) {
					const referenceDate = referenceData[0][0];
					const daysInMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
					splitNumber = Math.ceil(daysInMonth / 2);
				}
				break;
			}
			case 'year':
			case '365days':
				splitNumber = 12;
				break;
		}

		const mono200 = getComputedStyle(document.documentElement).getPropertyValue('--homey-color-mono-200').trim();
		const axisDefinitions = this.axisDefinitions.length
			? this.axisDefinitions
			: [
				{
					unit: this.units1,
					color: this.settings.color1,
					min: 0,
					max: 0,
					datasetIndices: [0],
				},
			];
		this.axisLabelCache = axisDefinitions.map(definition => definition.unit ?? '');
		const baseMargin = 45; // Space for single axis labels
		const extraMarginPerAxis = 45; // Additional space for each extra axis

		// Determine which axes have data (will be visible on initial render)
		const axisHasData = axisDefinitions.map((_, axisIndex) => {
			return datasets.some((dataset, datasetIndex) => {
				const datasourceId = dataset.datasource?.id?.trim();
				if (!datasourceId || !dataset.data.length) return false;
				return this.axisAssignments[datasetIndex] === axisIndex;
			});
		});

		// Count axes with data on each side
		const leftAxesWithData = axisHasData.filter((hasData, idx) => hasData && idx % 2 === 0).length;
		const rightAxesWithData = axisHasData.filter((hasData, idx) => hasData && idx % 2 !== 0).length;

		// Calculate grid margins based on axes with data
		const gridLeft = leftAxesWithData > 0 ? baseMargin + (leftAxesWithData - 1) * extraMarginPerAxis : 10;
		const gridRight = rightAxesWithData > 0 ? baseMargin + (rightAxesWithData - 1) * extraMarginPerAxis : 10;

		let leftAxisIndex = 0;
		let rightAxisIndex = 0;
		const yAxis = axisDefinitions.map((axis, axisIndex) => {
			const isLeft = axisIndex % 2 === 0;
			const axisColor = axis.color && axis.color.trim().length > 0 ? axis.color : mono200;
			// Calculate offset: first axis on each side gets 0, subsequent axes get stacked
			let offset = 0;
			if (isLeft) {
				offset = leftAxisIndex * extraMarginPerAxis;
				leftAxisIndex++;
			} else {
				offset = rightAxisIndex * extraMarginPerAxis;
				rightAxisIndex++;
			}
			return {
				type: 'value',
				name: axis.unit,
				nameLocation: 'end',
				position: isLeft ? 'left' : 'right',
				offset,
				nameTextStyle: {
					align: isLeft ? 'right' : 'left',
					// align: 'left',
					color: axisColor,
					padding: isLeft ? [0, 4, 0, 0] :  [0, 0, 0, 4],
				},
				axisLine: {
					show: false,
				},
				axisTick: {
					show: false,
				},
				axisLabel: {
					margin: 4,
				},
				scale: true,
				alignTicks: true,
				splitLine: {
					show: axisIndex === 0,
					lineStyle: {
						color: mono200,
						width: 1,
						opacity: 0.5,
						type: 'dashed',
					},
				},
			};
		});

		const legendData: string[] = [];
		const unitMap: Record<string, string> = {};
		const series: unknown[] = [];
		this.seriesNameByDatasetIndex = [undefined, undefined, undefined, undefined];
		this.displayNameByLegendName = {};
		const legendNameCounts = new Map<string, number>();

		datasets.forEach((dataset, index) => {
			const datasourceId = dataset.datasource?.id?.trim();
			if (!datasourceId || !dataset.data.length) return;

			const baseName = dataset.name && dataset.name.trim().length > 0 ? dataset.name : `Series ${index + 1}`;
			const occurrence = legendNameCounts.get(baseName) ?? 0;
			const legendName = occurrence === 0 ? baseName : `${baseName} (${occurrence + 1})`;
			legendNameCounts.set(baseName, occurrence + 1);
			legendData.push(legendName);
			unitMap[legendName] = dataset.units ?? '';
			this.seriesNameByDatasetIndex[index] = legendName;
			this.displayNameByLegendName[legendName] = baseName;
			const assignedAxis = this.axisAssignments[index];
			const resolvedAxisIndex = typeof assignedAxis === 'number' && assignedAxis >= 0 ? assignedAxis : 0;

			series.push({
				name: legendName,
				type: 'line',
				data: dataset.data,
				sampling: this.settings.timeframe === 'year' ? 'lttb' : undefined,
				showSymbol: false,
				itemStyle: {
					color: index === 0 ? dataset.color : LineChartWidgetScript.hexToRgba(dataset.color, 0.7),
				},
				areaStyle: {
					color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
						{
							offset: 0.1,
							color: LineChartWidgetScript.hexToRgba(dataset.color, 0.5),
						},
						{
							offset: 0.9,
							color: LineChartWidgetScript.hexToRgba(dataset.color, 0),
						},
					]),
				},
				lineStyle: {
					width: 1.5,
				},
				yAxisIndex: resolvedAxisIndex,
			});
		});


		const { interval } = this.getTimeframeOptions(this.settings.timeframe);
		const axisColorForDataset = (datasetIndex: number, datasetColor: string): string => {
			const assignment = this.axisAssignments[datasetIndex];
			if (assignment == null || assignment < 0) return datasetColor;
			const axis = axisDefinitions[assignment];
			const candidate = axis?.color?.trim();
			return candidate && candidate.length ? candidate : datasetColor;
		};

		const option = {
			legend: {
				show: false,
				data: legendData,
				bottom: 0,
			},
			tooltip: {
				trigger: 'axis',
				confine: true,
				textStyle: {
					fontSize: 10,
					overflow: 'truncate',
				},
				formatter: (params: TooltipParam[]): string => {
					if (!params.length) return '';
					const firstValue = params[0].value[0];
					const firstDate = new Date(firstValue);
					const formattedTitle = this.formatXAxisValue(firstDate.toISOString(), true);

					const seriesData = params.map(item => {
						const marker = item.marker;
						const seriesName = item.seriesName;
						const displayName = this.displayNameByLegendName[seriesName] ?? seriesName;
						const yValue = item.value[1];
						const unit = unitMap[seriesName] ?? '';
						const formattedYValue =
							yValue !== '-' && typeof yValue === 'number'
								? `${Number.isInteger(yValue) ? yValue : yValue.toFixed(2)} ${unit}`
								: '-';

						// Show original date for shifted series (calendar timeframes only)
						const seriesIndex = item.seriesIndex;
						const itemDate = new Date(item.value[0]);
						const originalDate = this.reverseNormalizationShift(itemDate, seriesIndex);
						const originalDateStr = originalDate
							? ` <span style="opacity:0.7">(${this.formatXAxisValue(originalDate.toISOString(), true)})</span>`
							: '';

						return `${marker}<strong>${displayName}</strong>: ${formattedYValue}${originalDateStr}`;
					});

					return `<div class="tooltip"><strong>${formattedTitle}</strong><br/>${seriesData.join('<br/>')}</div>`;
				},
			},
			grid: {
				top: '30',
				left: gridLeft,
				right: gridRight,
				bottom: '20',
				height: 'auto',
				containLabel: false,
			},
			toolbox: {
				feature: {
					saveAsImage: {},
				},
			},
			xAxis: {
				type: 'time',
				min: this.windowStart,
				max: this.windowEnd,
				splitNumber: splitNumber,
				splitLine: {
					show: false,
				},
				minInterval: interval,
				axisLabel: {
					formatter: (value: string): string => this.formatXAxisValue(value),
					hideOverlap: true,
					showMinLabel: this.settings.timeframe !== '60minutes' && this.settings.timeframe !== '6hours' && this.settings.timeframe !== '24hours' && this.settings.timeframe !== '7days' && this.settings.timeframe !== '365days',
					showMaxLabel: this.settings.timeframe !== '60minutes' && this.settings.timeframe !== '6hours' && this.settings.timeframe !== '24hours' && this.settings.timeframe !== '7days' && this.settings.timeframe !== '365days' ?
						this.potentiallyNotComplete()
							? false
							: true
						: false,
					alignMinLabel: this.settings.timeframe !== 'month' && this.settings.timeframe !== '31days' ? 'center' : 'left',
					alignMaxLabel: this.settings.timeframe !== 'month' && this.settings.timeframe !== '31days' ? 'center' : 'right',
					rotate: this.settings.timeframe !== 'month' && this.settings.timeframe !== '31days' && this.settings.timeframe !== 'hour' && this.settings.timeframe !== '60minutes' ? 45 : 0,
					align: 'center',
					margin: this.settings.timeframe !== 'month' && this.settings.timeframe !== '31days' ? 20 : 8,
				},
			},
			yAxis: yAxis,
			series: series,
		};

		this.chart.setOption(option);

		// Re-apply hidden state for any series that were toggled off
		this.seriesNameByDatasetIndex.forEach((legendName, index) => {
			if (legendName && !this.seriesVisibility[index]) {
				this.chart.dispatchAction({
					type: 'legendUnSelect',
					name: legendName,
				});
			}
		});

		this.updateAxisLabelVisibility();

		// render/update the legend toggles
		// Check if any series is tied to another series' axis and there are multiple axes
		const seriesColors = [this.settings.color1, this.settings.color2, this.settings.color3 ?? this.settings.color1, this.settings.color4 ?? this.settings.color1];
		const hasMultipleAxes = axisDefinitions.length > 1;
		const anySeriesSharingAxis = hasMultipleAxes && seriesColors.some((color, index) => {
			const datasource = [this.settings.datasource1, this.settings.datasource2, this.settings.datasource3, this.settings.datasource4][index];
			if (!datasource?.id) return false;
			return axisColorForDataset(index, color) !== color;
		});

		const renderToggle = (index: number, datasource: Datasource | undefined, name: string, color: string, units: string): void => {
			const toggleId = `toggle${index + 1}`;
			if (!this.settings.hideLegend && datasource?.id) {
				const toggleElement = document.getElementById(toggleId)!;
				document.querySelector(`#${toggleId} .label`)!.textContent = name;
				const toggleIcon = document.querySelector(`#${toggleId} .toggle-icon`)! as HTMLElement;
				toggleIcon.style.backgroundColor = color;
				const axisColor = axisColorForDataset(index, color);
				const unitsSpan = document.querySelector(`#${toggleId} .units`)! as HTMLElement;
				// Show units for all legends if any series is sharing an axis
				if (units && anySeriesSharingAxis) {
					unitsSpan.innerHTML = `<span style="color: ${axisColor}">${units}</span>`;
				} else {
					unitsSpan.textContent = '';
				}
				toggleElement.style.display = 'flex';
				toggleElement.classList.toggle('hidden', !this.seriesVisibility[index]);
			} else {
				document.getElementById(toggleId)!.style.display = 'none';
			}
		};

		renderToggle(0, this.settings.datasource1, this.name1, this.settings.color1, this.units1);
		renderToggle(1, this.settings.datasource2, this.name2, this.settings.color2, this.units2);
		renderToggle(2, this.settings.datasource3, this.name3, this.settings.color3 ?? this.settings.color1, this.units3);
		renderToggle(3, this.settings.datasource4, this.name4, this.settings.color4 ?? this.settings.color1, this.units4);

		// resize due to toggles being shown/hidden
		this.chart.resize();
	}

	/**
	 * Starts a configuration animation for the chart.
	 * Used when no data is available or during initialization.
	 */
	private async startConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout) return;

		const interval = 750;
		const data: [Date, number][] = [];

		const update = async (): Promise<void> => {
			const randomValue = Math.floor(Math.random() * 101);
			data.push([new Date(), randomValue]);
			if (data.length > 20) data.shift();
			await this.setData(data, 'Demo', [], '', undefined, '', undefined, '');
			this.resolution1 = 'today';
			this.units1 = 'Configure me';

			// TODO
			this.settings.timeframe = 'day';
			this.settings.datasource1 = {
				deviceId: 'demo',
				deviceName: 'Demo',
				id: 'demo',
				name: 'Demo',
				type: 'insight',
			};

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
	}

	/**
	 * Toggles the visibility of a series in the chart.
	 * @param indexToToggle - The index of the dataset to toggle (0-3).
	 */
	private toggleSeries(indexToToggle: number): void {
		const legendName = this.seriesNameByDatasetIndex[indexToToggle];
		if (!legendName) return;

		this.seriesVisibility[indexToToggle] = !this.seriesVisibility[indexToToggle];
		const shouldBeVisible = this.seriesVisibility[indexToToggle];

		this.chart.dispatchAction({
			type: shouldBeVisible ? 'legendSelect' : 'legendUnSelect',
			name: legendName,
		});

		const toggleElement = document.getElementById(`toggle${indexToToggle + 1}`);
		if (toggleElement) {
			toggleElement.classList.toggle('hidden', !shouldBeVisible);
		}

		this.updateAxisLabelVisibility();
	}

	private updateAxisLabelVisibility(): void {
		if (!this.chart) return;

		const datasets = [
			this.data1 ?? [],
			this.data2 ?? [],
			this.data3 ?? [],
			this.data4 ?? [],
		];

		const axisDefinitions = this.axisDefinitions.length
			? this.axisDefinitions
			: [{ unit: this.units1, color: this.settings.color1, min: 0, max: 0, datasetIndices: [0] }];

		const mono200 = getComputedStyle(document.documentElement).getPropertyValue('--homey-color-mono-200').trim();
		const baseMargin = 45; // Space for single axis labels
		const extraMarginPerAxis = 45; // Additional space for each extra axis

		// First pass: determine which axes are visible
		const axisVisibility = axisDefinitions.map((_, axisIndex) => {
			return this.seriesNameByDatasetIndex.some((legendName, datasetIndex) => {
				if (!legendName) return false;
				if (this.axisAssignments[datasetIndex] !== axisIndex) return false;
				const dataset = datasets[datasetIndex];
				if (!dataset?.length) return false;
				return this.seriesVisibility[datasetIndex];
			});
		});

		// Count visible axes on each side
		const visibleLeftAxes = axisVisibility.filter((visible, idx) => visible && idx % 2 === 0).length;
		const visibleRightAxes = axisVisibility.filter((visible, idx) => visible && idx % 2 !== 0).length;

		// Calculate grid margins based on visible axes
		const gridLeft = visibleLeftAxes > 0 ? baseMargin + (visibleLeftAxes - 1) * extraMarginPerAxis : 10;
		const gridRight = visibleRightAxes > 0 ? baseMargin + (visibleRightAxes - 1) * extraMarginPerAxis : 10;

		// Count visible axes on each side for offset calculation
		let visibleLeftCount = 0;
		let visibleRightCount = 0;

		const updatedYAxis = axisDefinitions.map((axis, axisIndex) => {
			const axisHasVisibleSeries = axisVisibility[axisIndex];
			const isLeft = axisIndex % 2 === 0;
			const axisColor = axis.color && axis.color.trim().length > 0 ? axis.color : mono200;
			
			// Calculate offset based on visible axes on the same side
			let offset = 0;
			if (axisHasVisibleSeries) {
				if (isLeft) {
					offset = visibleLeftCount * extraMarginPerAxis;
					visibleLeftCount++;
				} else {
					offset = visibleRightCount * extraMarginPerAxis;
					visibleRightCount++;
				}
			}

			const cachedName = this.axisLabelCache[axisIndex] ?? '';

			return {
				type: 'value',
				name: axisHasVisibleSeries ? cachedName : '',
				nameLocation: 'end',
				position: isLeft ? 'left' : 'right',
				offset,
				nameTextStyle: {
					// align: 'left',
					align: isLeft ? 'right' : 'left',
					color: axisHasVisibleSeries ? axisColor : 'transparent',
					padding: isLeft ? [0, 4, 0, 0] :  [0, 0, 0, 4],
				},
				axisLine: {
					show: false,
				},
				axisTick: {
					show: false,
				},
				axisLabel: {
					show: axisHasVisibleSeries,
					margin: 4,
				},
				scale: true,
				alignTicks: true,
				splitLine: {
					show: axisIndex === 0 ? axisHasVisibleSeries : false,
					lineStyle: {
						color: mono200,
						width: 1,
						opacity: 0.5,
						type: 'dashed',
					},
				},
			};
		});

		this.chart.setOption({ 
			yAxis: updatedYAxis,
			grid: {
				left: gridLeft,
				right: gridRight,
			}
		}, { replaceMerge: ['yAxis'] });
	}

	/**
	 * Called when the Homey API is ready.
	 */
	public async onHomeyReady(): Promise<void> {
		try {
			const result = (await this.homey.api('GET', '/getTimeAndLanguage')) as { timezone: string; language: string };
			this.timezone = result.timezone;
			this.language = result.language;

			this.chart = window.echarts.init(document.getElementById('line-chart'), null, {
				renderer: 'svg',
			});
			if (this.settings.datasource1 || this.settings.datasource2 || this.settings.datasource3 || this.settings.datasource4)
				await this.getData();

			document.documentElement.style.setProperty('--tooltip-font-size', `${this.settings.tooltipFontSize}`);
			document.documentElement.style.setProperty('--legend-font-size', `${this.settings.legendFontSize}`);

			this.homey.ready();
			await this.render();

			document.getElementById('toggle1')?.addEventListener('click', () => {
				if (this.settings.datasource1) this.toggleSeries(0);
			});

			document.getElementById('toggle2')?.addEventListener('click', () => {
				if (this.settings.datasource2) this.toggleSeries(1);
			});

			document.getElementById('toggle3')?.addEventListener('click', () => {
				if (this.settings.datasource3) this.toggleSeries(2);
			});

			document.getElementById('toggle4')?.addEventListener('click', () => {
				if (this.settings.datasource4) this.toggleSeries(3);
			});
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
	await new LineChartWidgetScript(homey).onHomeyReady();
