import type HomeyWidget from 'homey/lib/HomeyWidget';
import type { BaseSettings } from '../../../datavistasettings/baseSettings.mjs';
import type { PercentageData } from '../../../datavistasettings/percentageSettings.mjs';
import type { WidgetDataPayload } from '../../baseWidgetApi.mjs';
import type { CapabilitiesObject, ExtendedVariable } from 'homey-api';
import type { RangeData } from '../../../datavistasettings/rangeSettings.mjs';

type Settings = {
	datasource?: {
		deviceId: string;
		deviceName: string;
		id: string;
		name: string;
		type: 'capability' | 'advanced' | 'variable';
	};
	transparent: boolean;
	refreshSeconds: number;
	color1: string;
	color2: string;
	showIcon: boolean;
	showName: boolean;
	overwriteName: string;
};

class ProgressBarWidgetScript {
	private homey: HomeyWidget;
	private settings: Settings;
	progressBarEl!: HTMLProgressElement;
	private refreshInterval: NodeJS.Timeout | null = null;
	private configurationAnimationTimeout: NodeJS.Timeout | null | undefined;
	private data: number = 0;
	private iconUrl: string | null = null;

	/**
	 * Creates a new instance of the AdvancedGaugeWidgetScript class.
	 * @param homey The Homey widget.
	 */
	constructor(homey: HomeyWidget) {
		this.homey = homey;
		this.settings = homey.getSettings() as Settings;
	}

	/*
	 * Logs a message to the Homey API.
	 * @param args The arguments to log.
	 * @returns A promise that resolves when the message is logged.
	 */
	private async log(...args: any[]): Promise<void> {
		const message = args[0];
		const optionalParams = args.slice(1);
		console.log(message, optionalParams);
		await this.homey.api('POST', '/log', { message, optionalParams });
	}

	private async updateProgress(value: number, label?: string): Promise<void> {
		if (value === this.data) return;

		await this.stopConfigurationAnimation();
		const previousValue = this.data;
		this.data = value;

		const progressBar = document.getElementById('metricBar')!;
		const progressPercentage = document.getElementById('progressPercentage')!;

		const startColor = ProgressBarWidgetScript.hexToRgb(this.settings.color1);
		const endColor = ProgressBarWidgetScript.hexToRgb(this.settings.color2);

		// Animate percentage display
		const duration = 500; // Duration of the animation in milliseconds
		const startTime = performance.now();

		const animate = async (currentTime: number): Promise<void> => {
			const elapsedTime = currentTime - startTime;
			const progress = Math.min(elapsedTime / duration, 1);
			const currentPercentage = Math.round(previousValue + (value - previousValue) * progress);
			progressPercentage.textContent = label == null ? `${currentPercentage}%` : label;

			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};

		requestAnimationFrame(animate);

		// Set width of progress bar
		progressBar.style.width = `${this.data}%`;

		// Calculate intermediate color
		const intermediateColor = ProgressBarWidgetScript.interpolateColor(startColor, endColor, this.data / 100);
		progressBar.style.backgroundColor = intermediateColor;
	}

	private async syncData(): Promise<void> {
		if (this.settings.datasource == null) {
			await this.log('No datasource is set');
			await this.startConfigurationAnimation();
			return;
		}

		const payload = (await this.homey.api('POST', `/datasource`, {
			datasource: this.settings.datasource,
		})) as WidgetDataPayload | null;

		if (payload === null) {
			await this.log('The payload is null');
			await this.startConfigurationAnimation();
			return;
		}

		switch (this.settings.datasource.type) {
			case 'capability': {
				const capability = payload.data as CapabilitiesObject;
				this.updateName(payload.name);
				if (capability.iconObj?.id != null) {
					await this.updateIcon(`https://icons-cdn.athom.com/${capability.iconObj?.id}.svg?ver=1`);
				} else if (payload.fallbackIcon != null) {
					await this.updateIcon(payload.fallbackIcon);
				} else {
					await this.updateIcon(null);
				}
				
				let value = capability.value as number;
				if (capability.min !== undefined && capability.min == 0 && capability.max !== undefined && capability.max == 1) {
					value = Math.round(((value - capability.min) / (capability.max - capability.min)) * 100);
				}
				await this.updateProgress(value);
				break;
			}
			case 'variable': {
				const variable = payload.data as ExtendedVariable;
				this.updateName(payload.name);
				await this.updateProgress(variable.value as number);
				break;
			}
			case 'advanced': {
				switch ((payload.data as BaseSettings<unknown>).type) {
					case 'percentage': {
						const advanced = payload.data as BaseSettings<PercentageData>;
						this.updateName(payload.name);
						await this.updateProgress(advanced.settings.percentage);
						break;
					}
					case 'range': {
						const advanced = payload.data as BaseSettings<RangeData>;
						this.updateName(payload.name);

						await this.log('Range data', advanced.settings);
						const value = Math.round(((advanced.settings.value - advanced.settings.min) / (advanced.settings.max - advanced.settings.min)) * 100);
						const label = advanced.settings.label != null && advanced.settings.label.length > 0 ? advanced.settings.label : advanced.settings.value.toString();
						await this.updateProgress(value, label);
						break;
					}
					default:
						await this.log('Unknown datasource type', this.settings.datasource.type);
						await this.startConfigurationAnimation();
						break;
				}
				break;
			}
			default:
				await this.log('Unknown datasource type', this.settings.datasource.type);
				await this.startConfigurationAnimation();
				break;
		}
	}

	async updateIcon(iconUrl: string | null): Promise<void> {
		if (this.settings.showIcon === false) return;
		if (this.iconUrl === iconUrl) return;
		this.iconUrl = iconUrl;
		
		const iconEl = document.getElementById('icon')!;
		if (iconUrl == null) {
			iconEl.style.display = 'none';
			return;
		}

		const widgetDiv = document.querySelector('.homey-widget')!;
		const bgColor = window.getComputedStyle(widgetDiv).backgroundColor;
		const rgbMatch = bgColor.match(/\d+/g)!;
		const [r, g, b, a = 1] = rgbMatch.map(Number);
		const isTransparent = a === 0;
		const isWhitish = r > 240 && g > 240 && b > 240;
		const color =
			isTransparent || !isWhitish
				? getComputedStyle(document.documentElement).getPropertyValue('--homey-text-color').trim()
				: null;

		let url = `/icon?url=${iconUrl}`;
		if (color != null) url += `&color=${encodeURIComponent(color)}`;

		const result = (await this.homey.api('GET', url)) as string;
		iconEl.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(result)}")`;
		iconEl.style.display = 'block';
	}

	updateName(name: string, overwritable: boolean = true): void {
		const titleEl = document.querySelector('.title')! as HTMLElement;
		name = overwritable && this.settings.overwriteName ? this.settings.overwriteName : name;

		if (this.settings.showName === true) {
			titleEl.textContent = name;
			titleEl.style.display = 'block';
		} else {
			titleEl.style.display = 'none';
		}
	}

	private async startConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout != null) return;
		const interval = 1500;
		let value = 0;
		const step = 25;
		let direction = 1;
		const update = async (): Promise<void> => {
			value += step * direction;
			if (value >= 100 || value <= 0) {
				direction *= -1;
			}

			await this.updateProgress(value);
			this.configurationAnimationTimeout = setTimeout(update, interval);
		};
		this.updateName('Configure me');
		this.configurationAnimationTimeout = setTimeout(update, interval);
	}

	private static hexToRgb(hex: string): number[] {
		// Convert hex to RGB
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return [r, g, b];
	}

	private async stopConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout !== null) clearTimeout(this.configurationAnimationTimeout);
		this.configurationAnimationTimeout = null;
	}

	private static interpolateColor(
		color1: number[] | [any, any, any],
		color2: number[] | [any, any, any],
		factor: number,
	): string {
		const [r1, g1, b1] = color1;
		const [r2, g2, b2] = color2;

		const r = Math.round(r1 + factor * (r2 - r1));
		const g = Math.round(g1 + factor * (g2 - g1));
		const b = Math.round(b1 + factor * (b2 - b1));

		return `rgb(${r},${g},${b})`;
	}

	/**
	 * Called when the Homey API is ready.
	 */
	public async onHomeyReady(): Promise<void> {
		if (!this.settings.transparent) {
			const widgetBackgroundColor = getComputedStyle(document.documentElement)
				.getPropertyValue('--homey-background-color')
				.trim();
			document.querySelector('.homey-widget')!.setAttribute('style', `background-color: ${widgetBackgroundColor};`);
		}

		this.progressBarEl = document.getElementById('progress')! as HTMLProgressElement;

		if (this.settings.datasource != null) await this.syncData();

		this.homey.ready({ height: this.settings.showName ? 80 : 65 });

		if (this.settings.datasource == null) {
			await this.startConfigurationAnimation();
			return;
		}

		if (this.settings.datasource.type === 'capability') {
			this.settings.refreshSeconds = this.settings.refreshSeconds ?? 5;
			this.refreshInterval = setInterval(async () => {
				await this.syncData();
			}, this.settings.refreshSeconds * 1000);
		} else if (this.settings.datasource.type === 'advanced') {
			this.homey.on(`settings/${this.settings.datasource.id}`, async (_data: BaseSettings<PercentageData> | null) => {
				// TODO: we already have the data, so we can use it here maybe (not everything's in sync yet though)
				await this.syncData();
			});
		}
	}
}

interface ModuleWindow extends Window {
	onHomeyReady: (homey: HomeyWidget) => Promise<void>;
}

declare const window: ModuleWindow;

window.onHomeyReady = async (homey: HomeyWidget): Promise<void> =>
	await new ProgressBarWidgetScript(homey).onHomeyReady();
