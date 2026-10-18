import type HomeyWidget from 'homey/lib/HomeyWidget';
import type { AdvancedGaugeWidgetPayload } from '../api.mjs';
import type * as echarts from 'echarts';
import type { AdvancedGaugeWidgetData } from '../../../datavistasettings/AdvancedGaugeWidgetSettings.mjs';
import type { PercentageData } from '../../../datavistasettings/PercentageSettings.mjs';
import type { RangeData } from '../../../datavistasettings/RangeSettings.mjs';
import type { BaseSettings } from '../../../datavistasettings/BaseSettings.mjs';

type Settings = {
	transparent: boolean;
	datasource?: {
		id: string;
		name: string;
		type: 'advanced';
	};
	configsource?: {
		id: string;
		name: string;
	};
	segments: number;
	style: 'style1' | 'style2' | 'circular';
	gradualColors?: boolean;
};

type ColorStop = {
	offset?: number;
	color: string;
};

/** ECharts axisLine color entry: the color is drawn up to the given (normalized) end offset. */
type ColorBand = [number, string];

type ColorStopConfig = {
	color1?: string;
	color2?: string;
	color3?: string;
	color4?: string;
	color5?: string;
	colorOffset1?: number;
	colorOffset2?: number;
	colorOffset3?: number;
	colorOffset4?: number;
	colorOffset5?: number;
};

type WidgetDataDto = {
	min: number;
	max: number;
	value: number;
	unit?: string;
	unitPosition?: 'prefix' | 'suffix';
	label?: string;
};

class ColorStopsManager {
	private lastConfig: ColorStopConfig | null = null;
	private lastData: WidgetDataDto | null = null;
	private cachedResult: ColorStop[] | null = null;

	public getColorStops(config: ColorStopConfig, data: WidgetDataDto): ColorStop[] {
		if (this.shouldUseCache(config, data)) {
			return this.cachedResult!;
		}

		const stops = [
			{ offset: config.colorOffset1, color: config.color1 },
			{ offset: config.colorOffset2, color: config.color2 },
			{ offset: config.colorOffset3, color: config.color3 },
			{ offset: config.colorOffset4, color: config.color4 },
			{ offset: config.colorOffset5, color: config.color5 },
		].filter(stop => stop.color) as ColorStop[];

		if (stops.length === 0) return [];
		if (stops.length === 1) {
			stops[0].offset = 0;
			return this.cacheAndReturn(config, data, stops);
		}

		this.normalizeStops(stops, data);
		this.sortStops(stops);
		this.adjustStartOffset(stops);
		this.adjustEndOffset(stops);
		this.removeTightlyClusteredStops(stops);

		const result = stops.filter(stop => stop.offset !== undefined);
		return this.cacheAndReturn(config, data, result);
	}

	/**
	 * Gets solid color bands. Each color starts at its configured value and runs up to the value of the next color.
	 * Without configured values, the axis is divided into equally sized bands.
	 */
	public getColorBands(config: ColorStopConfig, data: WidgetDataDto): ColorBand[] {
		const stops = [
			{ offset: config.colorOffset1, color: config.color1 },
			{ offset: config.colorOffset2, color: config.color2 },
			{ offset: config.colorOffset3, color: config.color3 },
			{ offset: config.colorOffset4, color: config.color4 },
			{ offset: config.colorOffset5, color: config.color5 },
		].filter(stop => stop.color) as ColorStop[];

		if (stops.length === 0) return [];

		const hasDefinedOffsets = stops.some(stop => stop.offset != null);
		if (!hasDefinedOffsets) {
			return stops.map((stop, index) => [(index + 1) / stops.length, stop.color]);
		}

		const rangeSize = data.max - data.min;
		const sorted = stops
			.filter(stop => stop.offset != null)
			.map(stop => ({ offset: (stop.offset! - data.min) / rangeSize, color: stop.color }))
			.sort((a, b) => a.offset - b.offset);

		// The first color also covers the part of the axis below its own value.
		return sorted.map((stop, index): ColorBand => {
			const end = index < sorted.length - 1 ? sorted[index + 1].offset : 1;
			return [Math.min(Math.max(end, 0), 1), stop.color];
		});
	}

	private shouldUseCache(config: ColorStopConfig, data: WidgetDataDto): boolean {
		if (!this.cachedResult || !this.lastConfig || !this.lastData) return false;

		const configMatch = JSON.stringify(config) === JSON.stringify(this.lastConfig);
		const rangeMatch = data.min === this.lastData.min && data.max === this.lastData.max;

		return configMatch && rangeMatch;
	}

	private cacheAndReturn(config: ColorStopConfig, data: WidgetDataDto, result: ColorStop[]): ColorStop[] {
		this.lastConfig = { ...config };
		this.lastData = { ...data };
		this.cachedResult = [...result];
		return result;
	}

	private sortStops(stops: ColorStop[]): void {
		stops.sort((a, b) => (a.offset === undefined || b.offset === undefined ? 0 : a.offset - b.offset));
	}

	private normalizeStops(stops: ColorStop[], data: WidgetDataDto): void {
		const rangeSize = data.max - data.min;
		const hasDefinedOffsets = stops.some(stop => stop.offset !== undefined);

		if (!hasDefinedOffsets) {
			stops.forEach((stop, index) => {
				stop.offset = index / (stops.length - 1);
			});
		} else {
			stops.forEach(stop => {
				if (stop.offset !== undefined) {
					stop.offset = (stop.offset - data.min) / rangeSize;
				}
			});
		}
	}

	private adjustStartOffset(stops: ColorStop[]): void {
		const zeroOffset = stops.findLastIndex(stop => stop.offset === 0);
		if (zeroOffset > 0) {
			stops.splice(0, zeroOffset);
			return;
		}

		const lastBelow = stops.findLastIndex(stop => (stop.offset ?? 0) < 0);
		if (lastBelow > -1) {
			const firstPositive = stops.findIndex(stop => (stop.offset ?? 0) > 0);
			if (firstPositive > -1 && Math.abs(stops[lastBelow].offset ?? 0) > Math.abs(stops[firstPositive].offset ?? 0)) {
				stops[firstPositive].offset = 0;
				stops.splice(0, firstPositive);
			} else {
				stops[lastBelow].offset = 0;
				if (lastBelow > 0) stops.splice(0, lastBelow);
			}
		}
	}

	private adjustEndOffset(stops: ColorStop[]): void {
		const oneOffset = stops.findIndex(stop => stop.offset === 1);
		if (oneOffset > -1) {
			stops.splice(oneOffset + 1);
			return;
		}

		const firstAbove = stops.findIndex(stop => (stop.offset ?? 0) > 1);
		if (firstAbove > -1) {
			const lastBelow = stops.findLastIndex(stop => (stop.offset ?? 0) < 1);
			if (
				lastBelow > -1 &&
				Math.abs((stops[firstAbove].offset ?? 0) - 1) > Math.abs((stops[lastBelow].offset ?? 0) - 1)
			) {
				stops[lastBelow].offset = 1;
				stops.splice(lastBelow + 1);
			} else {
				stops[firstAbove].offset = 1;
				if (firstAbove < stops.length - 1) stops.splice(firstAbove + 1);
			}
		}
	}

	private removeTightlyClusteredStops(stops: ColorStop[]): void {
		const minDiff = 0.2;
		for (let i = 0; i < stops.length - 1; i++) {
			if ((stops[i + 1].offset ?? 0) - (stops[i].offset ?? 0) < minDiff) {
				stops.splice(i === stops.length - 2 ? i : i + 1, 1);
			}
		}
	}
}

class AdvancedGaugeWidgetScript {
	private homey: HomeyWidget;
	private settings: Settings;
	private data: WidgetDataDto;
	private config: AdvancedGaugeWidgetData;
	private colorStopsManager: ColorStopsManager;
	private spinnerTimeout: NodeJS.Timeout | null | undefined;
	private chart!: echarts.ECharts;
	private lastColorStops: ColorStop[] | null = null;
	private cachedSplitResult: { firstHalf: ColorStop[]; secondHalf: ColorStop[] } | null = null;

	/**
	 * Creates a new instance of the AdvancedGaugeWidgetScript class.
	 * @param homey The Homey widget.
	 */
	constructor(homey: HomeyWidget) {
		this.homey = homey;
		this.settings = homey.getSettings() as Settings;
		if (this.settings.datasource != null && this.settings.datasource.type == null)
			this.settings.datasource.type = 'advanced'; // Fallback to prevent breaking change.

		this.colorStopsManager = new ColorStopsManager();

		this.data = {
			min: 0,
			max: 100,
			value: 0,
		};

		this.config = {
			color1: '#008000', // Green
			color2: '#FFFF00', // Yellow
			color4: '#FF0000', // Red
		};
	}
	
	/**
	 * Updates the gauge with the current data.
	 */
	private async updateGauge(): Promise<void> {
		const homeyTextColor = getComputedStyle(document.documentElement).getPropertyValue('--homey-text-color').trim();
		const homeyLightTextColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--homey-text-color-light')
			.trim();
		const colorStops = this.colorStopsManager.getColorStops(this.config, this.data);
		const gradualColors = this.settings.gradualColors !== false;
		const colorBands = gradualColors ? [] : this.colorStopsManager.getColorBands(this.config, this.data);
		const axisLineColor = (): unknown[] => {
			if (!gradualColors) return colorBands;
			// @ts-expect-error This is expexted
			return [[1, new echarts.graphic.LinearGradient(0, 0, 1, 0, colorStops)]];
		};

		switch (this.settings.style) {
			case 'style1': {
				this.chart.setOption({
					series: [
						{
							type: 'gauge',
							startAngle: -180,
							endAngle: 0,
							splitNumber: this.settings.segments,
							radius: '100%',
							center: ['50%', '75%'],
							detail: {
								valueAnimation: true,
								formatter: (value: number): string => {
									if (this.data.label != null && this.data.label != '') return this.data.label;
									if (this.data.unit == null) return `${value}`;

									return this.data.unitPosition === 'prefix'
										? `${this.data.unit} ${value}`
										: `${value} ${this.data.unit}`;
								},
								fontSize: 20,
								offsetCenter: [0, '20%'],
								color: homeyTextColor,
							},

							pointer: {
								itemStyle: {
									color: homeyTextColor,
								},
							},
							splitLine: {
								distance: 7,
								length: 10,
							},
							axisTick: {
								distance: 7,
							},
							axisLabel: {
								formatter: (value: number): string => {
									const precision = value % 1 === 0 ? 0 : 2;
									return value.toFixed(precision);
								},
								color: homeyLightTextColor,
							},
							axisLine: {
								lineStyle: {
									color: axisLineColor(),
									width: 10,
								},
							},
							min: this.data.min,
							max: this.data.max,
							data: [
								{
									value: parseFloat(this.data.value.toFixed(2)),
								},
							],
						},
					],
				});
				break;
			}

			case 'style2': {
				const normalizedValue = (this.data.value - this.data.min) / (this.data.max - this.data.min);
				let progressColor: string;
				if (gradualColors) {
					// get the color for this.data.value that is closest to one of the color steps
					progressColor = colorStops.reduce((prev, curr) => {
						const prevDiff = Math.abs((prev.offset ?? 0) - normalizedValue);
						const currDiff = Math.abs((curr.offset ?? 0) - normalizedValue);
						return prevDiff < currDiff ? prev : curr;
					}).color;
				} else {
					// get the color of the band the value falls in
					progressColor = (colorBands.find(([end]) => normalizedValue <= end) ?? colorBands[colorBands.length - 1])[1];
				}

				this.chart.setOption({
					series: [
						{
							type: 'gauge',
							startAngle: -180,
							endAngle: 0,
							splitNumber: this.settings.segments,
							radius: '100%',
							center: ['50%', '75%'],
							detail: {
								valueAnimation: true,
								formatter: (value: number): string => {
									if (this.data.label != null && this.data.label != '') return this.data.label;
									if (this.data.unit == null) return `${value}`;

									return this.data.unitPosition === 'prefix'
										? `${this.data.unit} ${value}`
										: `${value} ${this.data.unit}`;
								},
								fontSize: 20,
								offsetCenter: [0, '-10%'],
								color: homeyTextColor,
							},

							pointer: {
								show: false,
							},
							splitLine: {
								distance: 15,
								length: 10,
							},
							axisTick: {
								distance: 15,
							},
							axisLabel: {
								distance: 15,
								formatter: (value: number): string => {
									const precision = value % 1 === 0 ? 0 : 2;
									return value.toFixed(precision);
								},
								color: homeyLightTextColor,
							},
							axisLine: {
								lineStyle: {
									color: axisLineColor(),
									width: 10,
								},
							},
							min: this.data.min,
							max: this.data.max,
							data: [
								{
									value: parseFloat(this.data.value.toFixed(2)),
								},
							],
						},
						{
							type: 'gauge',
							startAngle: -180,
							endAngle: 0,
							radius: '90%',
							center: ['50%', '75%'],
							min: this.data.min,
							max: this.data.max,
							itemStyle: {
								color: progressColor,
							},
							progress: {
								show: true,
								width: 6,
							},
							pointer: {
								show: false,
							},
							axisLine: {
								show: false,
							},
							axisTick: {
								show: false,
							},
							splitLine: {
								show: false,
							},
							axisLabel: {
								show: false,
							},
							detail: {
								show: false,
							},
							data: [
								{
									value: this.data.value,
								},
							],
						},
					],
				});
				break;
			}
			case 'circular': {
				const mainGauge = {
					type: 'gauge',
					startAngle: 90,
					endAngle: -270,
					splitNumber: this.settings.segments,
					radius: '100%',
					detail: {
						valueAnimation: true,
						formatter: (value: number): string => {
							if (this.data.label != null && this.data.label != '') return this.data.label;
							if (this.data.unit == null) return `${value}`;

							return this.data.unitPosition === 'prefix'
								? `${this.data.unit} ${value}`
								: `${value} ${this.data.unit}`;
						},
						fontSize: 20,
						offsetCenter: [0, 0],
						color: homeyTextColor,
					},
					pointer: {
						icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
						length: '12%',
						width: 10,
						offsetCenter: [0, '-80%'],
						itemStyle: {
							color: homeyTextColor,
						},
					},
					splitLine: {
						distance: 7,
						length: 10,
					},
					axisTick: {
						distance: 7,
					},
					axisLabel: {
						formatter: (value: number): string => {
							if (value === this.data.max) return '';
							const precision = value % 1 === 0 ? 0 : 2;
							return value.toFixed(precision);
						},
						color: homeyLightTextColor,
					},
					axisLine: {
						lineStyle: gradualColors
							? { color: [[1, 'rgba(0,0,0,0)']] } // transparent, only pointer visible
							: { color: colorBands, width: 10 }, // solid bands follow the arc natively
					},
					min: this.data.min,
					max: this.data.max,
					data: [
						{
							value: parseFloat(this.data.value.toFixed(2)),
						},
					],
				};

				if (!gradualColors) {
					this.chart.setOption({ series: [mainGauge] });
					break;
				}

				const { firstHalf, secondHalf } = await this.splitColorStops(colorStops);
				this.chart.setOption({
					series: [
						mainGauge,

						// Right part of the gauge
						{
							type: 'gauge',
							startAngle: 90,
							endAngle: -90,
							splitNumber: this.settings.segments,
							radius: '100%',
							pointer: { show: false },
							progress: { show: false },
							axisTick: { show: false },
							splitLine: { show: false },
							axisLabel: { show: false },
							detail: { show: false },
							axisLine: {
								lineStyle: {
									color: [
										[
											1,
											// @ts-expect-error This is expexted
											new echarts.graphic.LinearGradient(0, 0, 0, 1, firstHalf, false),
										]
									],
									width: 10,
								},
							}
						},

						// Left part of the gauge
						{
							type: 'gauge',
							startAngle: -90,
							endAngle: -270,
							splitNumber: this.settings.segments,
							radius: '100%',
							pointer: { show: false },
							progress: { show: false },
							axisTick: { show: false },
							splitLine: { show: false },
							axisLabel: { show: false },
							detail: { show: false },
							axisLine: {
								lineStyle: {
									color: [
										[
											1,
											// @ts-expect-error This is expexted
											new echarts.graphic.LinearGradient(0, 1, 0, 0, secondHalf, false),
										]
									],
									width: 10,
								},
							}
						},
					],
				});
				break;
			}
		}
	}

	/**
	 * Starts the spinning animation.
	 */
	private async startConfigurationAnimation(): Promise<void> {
		if (this.spinnerTimeout != null) return;

		const interval = 1000;
		let value = 0;
		const step = 25;
		let direction = 1;
		const update = async (): Promise<void> => {
			value += step * direction;
			if (value >= 100 || value <= 0) {
				direction *= -1;
			}
			this.data = {
				min: 0,
				max: 100,
				value: value,
				unit: '%',
				unitPosition: 'suffix',
				label: `Configure me`,
			};
			await this.updateGauge();
			this.spinnerTimeout = setTimeout(update, interval);
		};
		this.spinnerTimeout = setTimeout(update, interval);
	}

	/**
	 * Stops the spinning animation.
	 */
	async stopConfigurationAnimation(): Promise<void> {
		if (this.spinnerTimeout !== null) clearTimeout(this.spinnerTimeout);
		this.spinnerTimeout = null;
		await this.updateGauge();
	}

	private async logMessage(message: string, logToSentry: boolean, ...optionalParams: any[]): Promise<void> {
		await this.homey.api('POST', '/logMessage', { message, logToSentry, optionalParams });
	}

	private async logError(message: string, error: Error): Promise<void> {
		const serializedError = JSON.stringify(error, Object.getOwnPropertyNames(error));
		await this.homey.api('POST', '/logError', { message, error: serializedError });
	}

	/**
	 * Splits a ColorStop array at the 0.5 midpoint into two arrays, each normalized from 0 to 1.
	 * Calculates the interpolated color at 0.5 to use as the junction point.
	 * Uses caching to avoid recalculating when the same colorStops array is passed.
	 * @param colorStops - The input color stops array to split
	 * @returns An object containing the first half (0-0.5) and second half (0.5-1) as separate arrays
	 */
	private async splitColorStops(colorStops: ColorStop[]): Promise<{ firstHalf: ColorStop[]; secondHalf: ColorStop[] }> {
		if (this.cachedSplitResult && this.lastColorStops && this.areColorStopsEqual(this.lastColorStops, colorStops)) {
			return this.cachedSplitResult;
		}

		if (colorStops.length === 0) {
			const result = { firstHalf: [], secondHalf: [] };
			this.updateSplitCache(colorStops, result);
			return result;
		}

		// Sort stops by offset
		const sortedStops = [...colorStops].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
		
		// Find the interpolated color at 0.5 and the color at 0
		const midpointColor = await this.interpolateColorAt(sortedStops, 0.5);
		const startColor = await this.interpolateColorAt(sortedStops, 0);

		// Create first half (0 to 0.5 rescaled to 0 to 1)
		const firstHalf: ColorStop[] = [];
		for (const stop of sortedStops) {
			const offset = stop.offset ?? 0;
			if (offset <= 0.5) {
				firstHalf.push({
					offset: offset * 2, // Scale 0-0.5 to 0-1
					color: stop.color
				});
			}
		}
		// Add the midpoint color as the end of first half
		if (firstHalf.length === 0 || firstHalf[firstHalf.length - 1].offset !== 1) {
			firstHalf.push({ offset: 1, color: midpointColor });
		}

		// Create second half (0.5 to 1 rescaled to 0 to 1)
		const secondHalf: ColorStop[] = [{ offset: 0, color: midpointColor }];
		for (const stop of sortedStops) {
			const offset = stop.offset ?? 0;
			if (offset > 0.5) {
				secondHalf.push({
					offset: (offset - 0.5) * 2, // Scale 0.5-1 to 0-1
					color: stop.color
				});
			}
		}
		// Add the start color (from offset 0 of input) as the end of second half
		if (secondHalf.length === 0 || secondHalf[secondHalf.length - 1].offset !== 1) {
			secondHalf.push({ offset: 1, color: startColor });
		}

		void this.logMessage(`Splitting color stops: ${JSON.stringify(colorStops)}`, false);
		void this.logMessage(`Midpoint color at 0.5: ${midpointColor}, Start color at 0: ${startColor}`, false);
		void this.logMessage(`First half color stops: ${JSON.stringify(firstHalf)}`, false);
		void this.logMessage(`Second half color stops: ${JSON.stringify(secondHalf)}`, false);

		const result = { firstHalf, secondHalf };
		this.updateSplitCache(colorStops, result);
		return result;
	}

	/**
	 * Compares two ColorStop arrays for equality.
	 */
	private areColorStopsEqual(stops1: ColorStop[], stops2: ColorStop[]): boolean {
		if (stops1.length !== stops2.length) return false;
		
		return stops1.every((stop1, index) => {
			const stop2 = stops2[index];
			return stop1.offset === stop2.offset && stop1.color === stop2.color;
		});
	}

	/**
	 * Updates the split cache with new input and result.
	 */
	private updateSplitCache(colorStops: ColorStop[], result: { firstHalf: ColorStop[]; secondHalf: ColorStop[] }): void {
		this.lastColorStops = colorStops.map(stop => ({ ...stop })); // Deep copy
		this.cachedSplitResult = {
			firstHalf: result.firstHalf.map(stop => ({ ...stop })),
			secondHalf: result.secondHalf.map(stop => ({ ...stop }))
		};
	}

	private async interpolateColorAt(sortedStops: ColorStop[], targetOffset: number): Promise<string> {
		const result = (await this.homey.api('POST', '/interpolateColorAt', { sortedStops, targetOffset })) as string;
		return result;
	}

	/**
	 * Called when the Homey API is ready.
	 */
	public async onHomeyReady(): Promise<void> {
		try {
			if (!this.settings.transparent) {
				const widgetBackgroundColor = getComputedStyle(document.documentElement)
					.getPropertyValue('--homey-background-color')
					.trim();
				document.querySelector('.homey-widget')!.setAttribute('style', `background-color: ${widgetBackgroundColor};`);
			}

			this.chart = window.echarts.init(document.getElementById('gauge'), null, {
				renderer: 'svg'
			});

			let height: number;
			document.body.classList.add(this.settings.style);
			this.chart.resize();

			switch (this.settings.style) {
				case 'style1':
					height = 200;
					break;
				case 'style2':
					height = 165;
					break;
				case 'circular':
					height = 300;
					break;
			}
			this.homey.ready({ height });

			if (this.settings.datasource?.id == null) {
				await this.logMessage('No datasource selected', false);
				await this.startConfigurationAnimation();
				return;
			}

			const datasourceId = this.settings.datasource?.id;
			const configsourceId = this.settings.configsource?.id;

			const payload = (await this.homey.api('POST', `/datasource`, {
				datasource: this.settings.datasource,
				configsource: this.settings.configsource?.id,
			})) as AdvancedGaugeWidgetPayload;

			if (payload.data != null) {
				if (payload.data.type === 'advanced') {
					const advancedData = payload.data.data as BaseSettings<unknown>;
					switch (advancedData.type) {
						case 'percentage': {
							const percentageData = payload.data.data as BaseSettings<PercentageData>;
							this.data = {
								min: 0,
								max: 100,
								value: percentageData.settings.percentage ?? 0,
								unit: '%',
								unitPosition: 'suffix',
							};
							break;
						}
						case 'range': {
							const rangeData = advancedData as BaseSettings<RangeData>;
							this.data = {
								min: rangeData.settings.min,
								max: rangeData.settings.max,
								value: rangeData.settings.value,
								unit: rangeData.settings.unit,
								unitPosition: rangeData.settings.unitPosition,
								label: rangeData.settings.label,
							};
							break;
						}
						default: {
							await this.logMessage(`Type '${advancedData.type}' is not implemented.`, true);
							await this.startConfigurationAnimation();
						}
					}
				} else {
					await this.startConfigurationAnimation();
				}
			} else {
				await this.startConfigurationAnimation();
			}

			if (payload.config != null) this.config = payload.config;
			await this.updateGauge();

			if (datasourceId !== null) {
				this.homey.on(`settings/${datasourceId}`, async (data: BaseSettings<unknown> | null) => {
					if (data === null) {
						await this.startConfigurationAnimation();
						return;
					} else if (this.spinnerTimeout !== null) {
						await this.stopConfigurationAnimation();
					}

					switch (data.type) {
						case 'percentage': {
							const settings = data.settings as PercentageData;
							this.data = {
								min: 0,
								max: 100,
								value: settings.percentage ?? 0,
								unit: '%',
								unitPosition: 'suffix',
							};
							break;
						}
						case 'range': {
							const rangeData = data.settings as RangeData;
							this.data = {
								min: rangeData.min,
								max: rangeData.max,
								value: rangeData.value,
								label: rangeData.label,
								unit: rangeData.unit,
								unitPosition: rangeData.unitPosition,
							};
							break;
						}
						default: {
							await this.logMessage(`Type '${data.type}' is not implemented.`, true);
							await this.startConfigurationAnimation();
							return;
						}
					}

					await this.updateGauge();
				});

				if (configsourceId !== null) {
					this.homey.on(`settings/${configsourceId}`, async (config: BaseSettings<AdvancedGaugeWidgetData> | null) => {
						if (config === null) return;

						this.config = config.settings;
						await this.updateGauge();
					});
				}
			}
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
	await new AdvancedGaugeWidgetScript(homey).onHomeyReady();
