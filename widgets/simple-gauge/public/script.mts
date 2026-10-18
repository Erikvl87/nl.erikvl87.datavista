import type HomeyWidget from 'homey/lib/HomeyWidget';
import type { SimpleGaugeWidgetPayload } from '../api.mjs';
import type * as echarts from 'echarts';
import { WidgetDataPayload } from '../../BaseWidgetApi.mjs';
import { CapabilitiesObject, ExtendedVariable } from 'homey-api';
import { BaseSettings } from '../../../datavistasettings/BaseSettings.mjs';
import { PercentageData } from '../../../datavistasettings/PercentageSettings.mjs';

type Settings = {
	transparent: boolean;
	datasource?: {
		id: string;
		deviceId: string;
		name: string;
		type: 'capability' | 'advanced' | 'variable';
	};
	segments: number;
	refreshSeconds: number;
	min?: number | '';
	max?: number | '';
	style: 'style1' | 'style2' | 'circular';
	color1?: string;
	color2?: string;
	color3?: string;
	gradualColors?: boolean;
	isMinNegative: boolean;
	isMaxNegative: boolean;
};

type ColorStop = {
	offset: number;
	color: string;
};

class SimpleGaugeWidgetScript {
	private homey: HomeyWidget;
	private settings: Settings;
	private data: SimpleGaugeWidgetPayload;
	private spinnerTimeout: NodeJS.Timeout | null | undefined;
	private refreshInterval: NodeJS.Timeout | null = null;
	private colors: ColorStop[];
	private chart!: echarts.ECharts;
	private lastColorStops: ColorStop[] | null = null;
	private cachedSplitResult: { firstHalf: ColorStop[]; secondHalf: ColorStop[] } | null = null;

	constructor(homey: HomeyWidget) {
		this.homey = homey;
		this.settings = homey.getSettings() as Settings;
		if (this.settings.datasource != null && this.settings.datasource.type == null)
			this.settings.datasource.type = 'capability'; // Fallback to prevent breaking change.

		if (this.settings.isMinNegative && this.settings.min != null) this.settings.min = -this.settings.min;
		if (this.settings.isMaxNegative && this.settings.max != null) this.settings.max = -this.settings.max;
		this.data = {
			min: 0,
			max: 100,
			value: 0,
			units: '',
		};

		if (this.settings.color1 == null && this.settings.color2 == null && this.settings.color3 == null) {
			this.colors = [
				{ offset: 0, color: '#008000' },
				{ offset: 0.5, color: '#FFFF00' },
				{ offset: 1, color: '#FF0000' },
			];
		} else {
			const contrastColor = getComputedStyle(document.documentElement)
				.getPropertyValue('--homey-color-mono-1000')
				.trim();

			if (this.settings.color1 === 'contrast') this.settings.color1 = contrastColor;
			if (this.settings.color2 === 'contrast') this.settings.color2 = contrastColor;
			if (this.settings.color3 === 'contrast') this.settings.color3 = contrastColor;

			this.colors = [];
			if (this.settings.color1 != null && this.settings.color1 != '')
				this.colors.push({ offset: 0, color: this.settings.color1 });
			if (this.settings.color2 != null && this.settings.color2 != '')
				this.colors.push({ offset: 0.5, color: this.settings.color2 });
			if (this.settings.color3 != null && this.settings.color3 != '')
				this.colors.push({ offset: 1, color: this.settings.color3 });
		}
	}

	private async updateGauge(): Promise<void> {
		const homeyTextColor = getComputedStyle(document.documentElement).getPropertyValue('--homey-text-color').trim();
		const homeyLightTextColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--homey-text-color-light')
			.trim();

		const value = parseFloat(this.data?.value?.toFixed(this.data.decimals ?? 2) ?? '0');
		let detailFormatter;
		switch (this.data.units) {
			case '€':
				detailFormatter = '€{value}';
				break;
			case '$':
				detailFormatter = '${value}';
				break;
			case '%':
				detailFormatter = '{value}%';
				break;
			default:
				detailFormatter = `{value}${this.data.units ? ` ${this.data.units}` : ''}`;
				break;
		}

		// Without gradual transitions, every selected color gets an equally sized solid band.
		const gradualColors = this.settings.gradualColors !== false;
		const colorBands: [number, string][] = this.colors.map((stop, index) => [
			(index + 1) / this.colors.length,
			stop.color,
		]);
		const axisLineColor = (): unknown[] => {
			if (!gradualColors) return colorBands;
			// @ts-expect-error This is expexted
			return [[1, new echarts.graphic.LinearGradient(0, 0, 1, 0, this.colors)]];
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
								formatter: this.spinnerTimeout == null ? detailFormatter : 'Configure me',
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
									value: value,
								},
							],
						},
					],
				});
				break;
			}

			case 'style2': {
				const normalizedValue =
					this.data.min != null && this.data.max != null
						? (value - this.data.min) / (this.data.max - this.data.min)
						: 0;
				let progressColor: string;
				if (gradualColors) {
					progressColor = this.colors.reduce((prev, curr) => {
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
								formatter: this.spinnerTimeout == null ? detailFormatter : 'Configure me',
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
									value: value,
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
						formatter: this.spinnerTimeout == null ? detailFormatter : 'Configure me',
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
							value: value,
						},
					],
				};

				if (!gradualColors) {
					this.chart.setOption({ series: [mainGauge] });
					break;
				}

				const { firstHalf, secondHalf } = await this.splitColorStops(this.colors);

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

		const result = { firstHalf, secondHalf };
		this.updateSplitCache(colorStops, result);
		return result;
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

	private async interpolateColorAt(sortedStops: ColorStop[], targetOffset: number): Promise<string> {
		const result = (await this.homey.api('POST', '/interpolateColorAt', { sortedStops, targetOffset })) as string;
		return result;
	}

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
			this.data.min = 0;
			this.data.max = 100;
			this.data.value = value;

			await this.updateGauge();
			this.spinnerTimeout = setTimeout(update, interval);
		};
		this.spinnerTimeout = setTimeout(update, interval);
	}

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

	private async syncData(): Promise<void> {
		if (this.settings.datasource == null) {
			await this.logMessage('No datasource is set', false);
			await this.startConfigurationAnimation();
			return;
		}

		const payload = (await this.homey.api('POST', `/datasource`, {
			datasource: this.settings.datasource,
		})) as WidgetDataPayload | null;

		if (payload === null) {
			await this.logMessage('The payload is null', false);
			await this.startConfigurationAnimation();
			return;
		}

		await this.stopConfigurationAnimation();
		// this.updateName(payload.name);

		switch (this.settings.datasource.type) {
			case 'capability': {
				const capability = payload.data as CapabilitiesObject;
				this.data = {
					min: this.settings.min != null && this.settings.min !== '' ? this.settings.min : capability.min ?? 0,
					max: this.settings.max != null && this.settings.max !== '' ? this.settings.max : capability.max ?? 100,
					value: capability.value as number,
					units: capability.units,
					decimals: capability.decimals,
				};
				await this.updateGauge();
				break;
			}
			case 'variable': {
				const variable = payload.data as ExtendedVariable;
				this.data = {
					min: this.settings.min != null && this.settings.min !== '' ? this.settings.min : 0,
					max: this.settings.max != null && this.settings.max !== '' ? this.settings.max : 100,
					value: variable.value as number,
				};
				await this.updateGauge();
				break;
			}
			case 'advanced': {
				if ((payload.data as BaseSettings<unknown>).type !== 'percentage') {
					await this.logMessage('The data type is not percentage', false);
					await this.startConfigurationAnimation();
					return;
				}
				const advanced = payload.data as BaseSettings<PercentageData>;
				this.data = {
					min: this.settings.min != null && this.settings.min !== '' ? this.settings.min : 0,
					max: this.settings.max != null && this.settings.max !== '' ? this.settings.max : 100,
					value: advanced.settings.percentage,
				};
				await this.updateGauge();
				break;
			}
			default:
				await this.logMessage('Unknown datasource type', this.settings.datasource.type, true);
				await this.startConfigurationAnimation();
				break;
		}
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
			this.chart.resize(); // Needs resizing after adding class for correct dimensions.
			
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

			await this.syncData();

			this.settings.refreshSeconds = this.settings.refreshSeconds ?? 5;
			this.refreshInterval = setInterval(async () => {
				await this.syncData();
			}, this.settings.refreshSeconds * 1000);
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
	await new SimpleGaugeWidgetScript(homey).onHomeyReady();
