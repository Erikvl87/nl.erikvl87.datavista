import type HomeyWidget from 'homey/lib/HomeyWidget';
import type { BaseSettings } from '../../../datavistasettings/BaseSettings.mjs';
import type { BooleanData } from '../../../datavistasettings/BooleanSettings.mjs';
import type { CapabilitiesObject, ExtendedVariable } from 'homey-api';
import type { WidgetDataPayload } from '../../BaseWidgetApi.mjs';

type Settings = {
	datasource?: {
		deviceId: string;
		deviceName: string;
		id: string;
		name: string;
		type: 'capability' | 'advanced' | 'variable';
	};
	refreshSeconds: number;
	showIcon: boolean;
	overwriteName: string;
	faTrueValue: string;
	trueColor: string;
	faFalseValue: string;
	falseColor: string;
};

class ToggleSwitchWidgetScript {
	private homey: HomeyWidget;
	private settings: Settings;
	switchEl!: HTMLInputElement;
	private refreshInterval: NodeJS.Timeout | null = null;
	private configurationAnimationTimeout: NodeJS.Timeout | null | undefined;
	private data: boolean = false;
	private iconUrl: string | null = null;

	/**
	 * Creates a new instance of the AdvancedGaugeWidgetScript class.
	 * @param homey The Homey widget.
	 */
	constructor(homey: HomeyWidget) {
		this.homey = homey;
		this.settings = homey.getSettings() as Settings;
	}

	private async logMessage(message: string, logToSentry: boolean, ...optionalParams: any[]): Promise<void> {
		await this.homey.api('POST', '/logMessage', { message, logToSentry, optionalParams });
	}

	private async logError(message: string, error: Error): Promise<void> {
		const serializedError = JSON.stringify(error, Object.getOwnPropertyNames(error));
		await this.homey.api('POST', '/logError', { message, error: serializedError });
	}

	private updateState(value: boolean): void {
		if (value === this.data) return;

		// const previousValue = this.data;
		this.data = value;
		this.switchEl.checked = value;
		this.switchEl.dispatchEvent(new Event('change')); // todo check if needed
	}

	updateName(name: string, overwritable: boolean = true): void {
		const titleEl = document.querySelector('.title')! as HTMLElement;
		name = overwritable && this.settings.overwriteName ? this.settings.overwriteName : name;
		titleEl.textContent = name;
	}

	async updateIcon(iconUrl: string | null): Promise<void> {
		try {
			if (this.settings.showIcon === false) return;
			if (this.iconUrl === iconUrl) return;

			const iconEl = document.getElementById('icon')!;
			if (iconUrl == null) {
				iconEl.style.display = 'none';
				return;
			}

			this.iconUrl = iconUrl;
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
		} catch (error) {
			if (error instanceof Error) {
				await this.logError('An error occured while updating the icon', error);
			} else {
				await this.logMessage('An error occured while updating the icon', true, error);
			}
		}
	}

	private async getData(): Promise<void> {
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
		this.updateName(payload.name);

		switch (this.settings.datasource.type) {
			case 'capability': {
				const capability = payload.data as CapabilitiesObject;
				if (capability.iconObj?.id != null) {
					await this.updateIcon(`https://icons-cdn.athom.com/${capability.iconObj?.id}.svg?ver=1`);
				} else if (payload.fallbackIcon != null) {
					await this.updateIcon(payload.fallbackIcon);
				} else {
					await this.updateIcon(null);
				}

				this.updateState(capability.value as boolean);
				break;
			}
			case 'variable': {
				const variable = payload.data as ExtendedVariable;
				this.updateState(variable.value as boolean);
				break;
			}
			case 'advanced': {
				if ((payload.data as BaseSettings<unknown>).type !== 'boolean') {
					await this.logMessage('The data type is not boolean', false);
					await this.startConfigurationAnimation();
					return;
				}
				const advanced = payload.data as BaseSettings<BooleanData>;
				this.updateState(advanced.settings.value as boolean);
				break;
			}
			default:
				await this.logMessage('Unknown datasource type', true, this.settings.datasource.type);
				await this.startConfigurationAnimation();
				break;
		}
	}

	private async startConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout != null) return;
		const interval = 1500;
		let value = false;
		const update = async (): Promise<void> => {
			value = !value;
			this.updateState(value);
			this.configurationAnimationTimeout = setTimeout(update, interval);
		};
		this.updateName('Configure me', false);
		this.configurationAnimationTimeout = setTimeout(update, interval);
	}

	private async stopConfigurationAnimation(): Promise<void> {
		if (this.configurationAnimationTimeout !== null) clearTimeout(this.configurationAnimationTimeout);
		this.configurationAnimationTimeout = null;
	}

	/**
	 * Called when the Homey API is ready.
	 */
	public async onHomeyReady(): Promise<void> {
		try {
			this.switchEl = document.getElementById('switch')! as HTMLInputElement;
			const label = document.querySelector('label[for="switch"]') as HTMLLabelElement;
			label.style.setProperty('--icon-true-value', `'\\${this.settings.faTrueValue}'`);
			label.style.setProperty('--icon-false-value', `'\\${this.settings.faFalseValue}'`);

			document.documentElement.style.setProperty('--true-color', this.settings.trueColor);
			document.documentElement.style.setProperty('--false-color', this.settings.falseColor);

			if (this.settings.datasource != null) await this.getData();
			this.homey.ready();

			if (this.settings.datasource == null) {
				await this.startConfigurationAnimation();
				return;
			}

			if (this.settings.datasource.type === 'capability' || this.settings.datasource.type === 'variable') {
				this.settings.refreshSeconds = this.settings.refreshSeconds ?? 5;
				this.refreshInterval = setInterval(async () => {
					await this.getData();
				}, this.settings.refreshSeconds * 1000);
			} else if (this.settings.datasource.type === 'advanced') {
				this.homey.on(`settings/${this.settings.datasource.id}`, async (data: BaseSettings<BooleanData> | null) => {
					if (data === null) {
						await this.startConfigurationAnimation();
						return;
					}

					await this.stopConfigurationAnimation();
					this.updateState(data.settings.value);
				});
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
}

declare const window: ModuleWindow;

window.onHomeyReady = async (homey: HomeyWidget): Promise<void> =>
	await new ToggleSwitchWidgetScript(homey).onHomeyReady();
