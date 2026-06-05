import type HomeySettings from 'homey/lib/HomeySettings';
import { BaseSettings } from '../datavistasettings/BaseSettings.mjs';
import { PercentageData } from '../datavistasettings/PercentageSettings.mjs';
import { RangeData } from '../datavistasettings/RangeSettings.mjs';
import { AdvancedGaugeWidgetData } from '../datavistasettings/AdvancedGaugeWidgetSettings.mjs';
import { ProgressBarWidgetData } from '../datavistasettings/ProgressBarWidgetSettings.mjs';
import { BooleanData } from '../datavistasettings/BooleanSettings.mjs';
import { TextData } from '../datavistasettings/TextSettings.mjs';
import { StatusData } from '../datavistasettings/StatusSettings.mjs';
import { CountdownData } from '../datavistasettings/CountdownSettings.mjs';

type SettingsData = PercentageData | RangeData | AdvancedGaugeWidgetData | ProgressBarWidgetData | BooleanData | TextData | StatusData | CountdownData;

interface DataItem {
	key: string;
	data: BaseSettings<SettingsData>;
	element: HTMLElement;
}

class SettingsScript {
	private homey: HomeySettings;
	private timezone: string | undefined;
	private language: string | undefined;
	private allData: Map<string, DataItem> = new Map();
	private searchTerm: string = '';

	constructor(homey: HomeySettings) {
		this.homey = homey;
	}

	private createElement(templateId: string, data: BaseSettings<SettingsData>, key: string): HTMLElement {
		const template = document.getElementById(templateId) as HTMLTemplateElement;
		const fragment = template.content.cloneNode(true) as DocumentFragment;
		const element = fragment.firstElementChild as HTMLElement;
		element.setAttribute('data-id', key);
		element.setAttribute('data-identifier', data.identifier.toLowerCase());

		const identifierLabel = element.querySelector('.identifier-label') as HTMLElement;
		identifierLabel.innerText = data.identifier;

		const lastUpdatedLabel = element.querySelector('#last-updated-label') as HTMLInputElement;
		if (lastUpdatedLabel) {
			lastUpdatedLabel.value = new Date(data.lastUpdated).toLocaleString(this.language, { timeZone: this.timezone });
			lastUpdatedLabel.readOnly = true;
		}

		return element;
	}

	private createPercentageElement(data: BaseSettings<PercentageData>, key: string): HTMLElement {
		const element = this.createElement('percentage-template', data, key);
		const percentageInput = element.querySelector('#percentage-input') as HTMLInputElement;
		percentageInput.value = `${data.settings.percentage}%`;
		return element;
	}

	private createRangeElement(data: BaseSettings<RangeData>, key: string): HTMLElement {
		const element = this.createElement('range-template', data, key);
		const minInput = element.querySelector('#min-input') as HTMLInputElement;
		const maxInput = element.querySelector('#max-input') as HTMLInputElement;
		const valueInput = element.querySelector('#value-input') as HTMLInputElement;
		const unitInput = element.querySelector('#unit-input') as HTMLInputElement;
		minInput.value = `${data.settings.min}`;
		maxInput.value = `${data.settings.max}`;
		valueInput.value = `${data.settings.value}`;
		unitInput.value = data.settings.unit ?? '';
		return element;
	}

	private createBooleanElement(data: BaseSettings<BooleanData>, key: string): HTMLElement {
		const element = this.createElement('boolean-template', data, key);
		const booleanInput = element.querySelector('#boolean-input') as HTMLInputElement;
		booleanInput.checked = data.settings.value;
		return element;
	}

	private createTextElement(data: BaseSettings<TextData>, key: string): HTMLElement {
		const element = this.createElement('text-template', data, key);
		const textInput = element.querySelector('#text-input') as HTMLInputElement;
		textInput.value = data.settings.value;
		return element;
	}

	private createStatusElement(data: BaseSettings<StatusData>, key: string): HTMLElement {
		const element = this.createElement('status-template', data, key);
		const textInput = element.querySelector('#text-input') as HTMLInputElement;
		const attentionInput = element.querySelector('#attention-input') as HTMLInputElement;
		textInput.value = data.settings.text;
		attentionInput.checked = data.settings.attention;
		return element;
	}

	private createCountdownElement(data: BaseSettings<CountdownData>, key: string): HTMLElement {
		const element = this.createElement('countdown-template', data, key);
		const endDatetimeInput = element.querySelector('#end-datetime-input') as HTMLInputElement;
		const messageInput = element.querySelector('#message-input') as HTMLInputElement;
		endDatetimeInput.value = new Date(data.settings.endDatetime).toLocaleString(this.language, { timeZone: this.timezone });
		messageInput.value = data.settings.message ?? '';
		return element;
	}

	private createGaugeElement(data: BaseSettings<AdvancedGaugeWidgetData>, key: string): HTMLElement {
		const element = this.createElement('gauge-template', data, key);
		this.setupColorInputs(element, data.settings);
		this.addColorInputListeners(element);
		this.addClearButtonListeners(element);
		this.addSaveButtonListener(element, key, 'gauge');
		return element;
	}

	private createProgressBarElement(data: BaseSettings<ProgressBarWidgetData>, key: string): HTMLElement {
		const element = this.createElement('progress-bar-template', data, key);
		this.setupColorInputs(element, data.settings);
		this.addColorInputListeners(element);
		this.addClearButtonListeners(element);
		this.addSaveButtonListener(element, key, 'progressbar');
		return element;
	}

	private setupColorInputs(element: HTMLElement, settings: AdvancedGaugeWidgetData | ProgressBarWidgetData): void {
		const colorConfig = [
			{ color: 'color1', hex: 'color1-hex', offset: 'offset1', value: settings.color1, offsetValue: settings.colorOffset1 },
			{ color: 'color2', hex: 'color2-hex', offset: 'offset2', value: settings.color2, offsetValue: settings.colorOffset2 },
			{ color: 'color3', hex: 'color3-hex', offset: 'offset3', value: settings.color3, offsetValue: settings.colorOffset3 },
			{ color: 'color4', hex: 'color4-hex', offset: 'offset4', value: settings.color4, offsetValue: settings.colorOffset4 },
			{ color: 'color5', hex: 'color5-hex', offset: 'offset5', value: settings.color5, offsetValue: settings.colorOffset5 },
		];

		colorConfig.forEach(({ color, hex, offset, value, offsetValue }) => {
			const colorInput = element.querySelector(`#${color}-input`) as HTMLInputElement;
			const hexInput = element.querySelector(`#${hex}`) as HTMLInputElement;
			const offsetInput = element.querySelector(`#${offset}-input`) as HTMLInputElement;

			if (value != null && colorInput && hexInput) {
				colorInput.value = `${value}`;
				hexInput.value = `${value}`;
			}
			if (offsetValue != null && offsetInput) {
				offsetInput.value = `${offsetValue}`;
			}
		});
	}

	private addColorInputListeners(element: HTMLElement): void {
		const colorInputs = element.querySelectorAll('input[type="color"]');
		colorInputs.forEach(colorInput => {
			colorInput.addEventListener('input', event => {
				const hexInput = (colorInput.closest('.input-group') as HTMLElement).querySelector('.hex') as HTMLInputElement;
				if (hexInput) {
					hexInput.value = (event.target as HTMLInputElement).value;
				}
			});
		});
	}

	private addClearButtonListeners(element: HTMLElement): void {
		const clearButtons = element.querySelectorAll('.clear-button');
		clearButtons.forEach(button => {
			button.addEventListener('click', event => {
				const inputGroup = (event.target as HTMLElement).closest('.input-group') as HTMLElement;
				const colorInput = inputGroup.querySelector('input[type="color"]') as HTMLInputElement;
				const hexInput = inputGroup.querySelector('.hex') as HTMLInputElement;
				if (colorInput) colorInput.value = '';
				if (hexInput) hexInput.value = '';
			});
		});
	}

	private addSaveButtonListener(element: HTMLElement, key: string, type: 'gauge' | 'progressbar'): void {
		const button = element.querySelector('.save-button') as HTMLButtonElement;
		button.onclick = async (): Promise<void> => {
			const originalText = button.innerHTML;
			button.innerHTML = '<span class="spinner"></span> Saving...';
			button.disabled = true;

			try {
				await this.saveSettings(element, key, type);
				button.innerHTML = '✓ Saved';
				setTimeout(() => {
					button.innerHTML = originalText;
					button.disabled = false;
				}, 2000);
			} catch (error) {
				button.innerHTML = '✗ Failed';
				button.disabled = false;
				setTimeout(() => {
					button.innerHTML = originalText;
				}, 2000);
			}
		};
	}

	private async saveSettings(element: HTMLElement, key: string, type: 'gauge' | 'progressbar'): Promise<void> {
		const colorIds = ['color1', 'color2', 'color3', 'color4', 'color5'];
		const settings: Record<string, string | number | undefined> = {};

		colorIds.forEach((colorId, index) => {
			const colorInput = element.querySelector(`#${colorId}-hex`) as HTMLInputElement;
			const offsetInput = element.querySelector(`#offset${index + 1}-input`) as HTMLInputElement;
			
			settings[colorId] = colorInput?.value || '';
			settings[`colorOffset${index + 1}`] = this.convertToNumber(offsetInput?.value);
			
			if (offsetInput) {
				offsetInput.value = `${settings[`colorOffset${index + 1}`] ?? ''}`;
			}
		});

		return new Promise((resolve, reject) => {
			this.homey.api('PUT', `/${type}/${key}`, settings, async (err: string, result: boolean) => {
				if (err || !result) {
					await this.homey.alert('Failed to save data');
					reject(err);
				} else {
					await this.homey.alert('Data saved successfully');
					resolve();
				}
			});
		});
	}

	private convertToNumber(value: string | null | undefined): number | undefined {
		if (value == null || String(value).trim() === '') {
			return undefined;
		}

		const cleanedValue = String(value).replace(',', '.');
		const numberValue = parseFloat(cleanedValue);
		return isNaN(numberValue) ? undefined : numberValue;
	}

	private addListenerToRemoveButton(element: HTMLElement, key: string): void {
		const button = element.querySelector('.remove-button') as HTMLButtonElement;
		button.onclick = async (): Promise<void> => {
			this.homey.confirm(
				'Are you sure you want to remove this item?',
				null,
				async (_err: string, confirmed: boolean) => {
					if (confirmed) {
						button.disabled = true;
						this.homey.api('DELETE', `/data/${key}`, async (_err: string, result: boolean) => {
							if (result) {
								element.style.opacity = '0';
								element.style.transform = 'translateX(-20px)';
								element.style.transition = 'all 0.3s ease-out';
								setTimeout(() => {
									element.remove();
									this.allData.delete(key);
									this.updateCounts();
									this.filterData();
								}, 300);
							} else {
								await this.homey.alert('Failed to remove data');
								button.disabled = false;
							}
						});
					}
				},
			);
		};
	}

	private getDataTypeIds(): Promise<string[]> {
		return new Promise((resolve, reject) => {
			this.homey.api('GET', '/dataTypes', (err: string, result: string[]) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		});
	}

	private getTimeAndLanguage(): Promise<{ timezone: string; language: string }> {
		return new Promise((resolve, reject) => {
			this.homey.api('GET', '/getTimeAndLanguage', (err: string, result: { timezone: string; language: string }) => {
				if (err) {
					reject(err);
				} else {
					this.timezone = result.timezone;
					this.language = result.language;
					resolve(result);
				}
			});
		});
	}

	private getSettings(): Promise<Record<string, unknown>> {
		return new Promise((resolve, reject) => {
			this.homey.get((err: string, settings: Record<string, unknown>) => {
				if (err) {
					reject(err);
				} else {
					resolve(settings);
				}
			});
		});
	}

	private updateCounts(): void {
		const counts: Record<string, number> = {
			percentage: 0,
			range: 0,
			boolean: 0,
			text: 0,
			status: 0,
			countdown: 0,
			gauge: 0,
			'progress-bar': 0,
		};

		this.allData.forEach(({ data }) => {
			if (counts[data.type] !== undefined) {
				counts[data.type]++;
			}
		});

		Object.keys(counts).forEach(type => {
			const badge = document.getElementById(`${type}-count`);
			if (badge) {
				badge.textContent = counts[type].toString();
			}
		});
	}

	private filterData(): void {
		this.allData.forEach(({ element, data }) => {
			const matchesSearch = this.searchTerm === '' || 
				data.identifier.toLowerCase().includes(this.searchTerm);
			
			element.style.display = matchesSearch ? '' : 'none';
		});

		// Show/hide empty states
		['percentage', 'range', 'boolean', 'text', 'status', 'countdown', 'gauge', 'progress-bar'].forEach(type => {
			const container = document.getElementById(`${type}-content`);
			if (container) {
				const allItems = Array.from(container.children).filter(
					child => !child.classList.contains('empty-state')
				);
				const visibleItems = allItems.filter(
					child => (child as HTMLElement).style.display !== 'none'
				);
				
				const existingEmpty = container.querySelector('.empty-state');
				if (existingEmpty) {
					existingEmpty.remove();
				}

				if (visibleItems.length === 0) {
					// Use different template based on whether search is active and there are items
					const templateId = (this.searchTerm !== '' && allItems.length > 0) 
						? 'empty-search-template' 
						: 'empty-state-template';
					const template = document.getElementById(templateId) as HTMLTemplateElement;
					const emptyState = template.content.cloneNode(true);
					container.appendChild(emptyState);
				}
			}
		});
	}

	private async loadData(): Promise<void> {
		const dataTypeIds = await this.getDataTypeIds();
		const settings = await this.getSettings();

		// Clear containers
		['percentage', 'range', 'boolean', 'text', 'status', 'countdown', 'gauge', 'progress-bar'].forEach(type => {
			const container = document.getElementById(`${type}-content`);
			if (container) container.innerHTML = '';
		});

		this.allData.clear();

		const dataKeys = Object.keys(settings).filter(key => dataTypeIds.some(id => key.startsWith(`${id}-`)));
		const groupedData: Record<string, Array<{ key: string; item: BaseSettings<unknown> }>> = {};

		for (const key of dataKeys) {
			const item = settings[key] as BaseSettings<unknown>;
			if (!groupedData[item.type]) {
				groupedData[item.type] = [];
			}
			groupedData[item.type].push({ key, item });
		}

		Object.keys(groupedData).forEach(type => {
			groupedData[type]
				.sort((a, b) => new Date(b.item.lastUpdated).getTime() - new Date(a.item.lastUpdated).getTime())
				.forEach(({ key, item: data }) => {
					let element: HTMLElement | null = null;
					let containerId = '';

					switch (data.type) {
						case 'percentage':
							element = this.createPercentageElement(data as BaseSettings<PercentageData>, key);
							containerId = 'percentage-content';
							break;
						case 'range':
							element = this.createRangeElement(data as BaseSettings<RangeData>, key);
							containerId = 'range-content';
							break;
						case 'boolean':
							element = this.createBooleanElement(data as BaseSettings<BooleanData>, key);
							containerId = 'boolean-content';
							break;
						case 'text':
							element = this.createTextElement(data as BaseSettings<TextData>, key);
							containerId = 'text-content';
							break;
						case 'status':
							element = this.createStatusElement(data as BaseSettings<StatusData>, key);
							containerId = 'status-content';
							break;
						case 'countdown':
							element = this.createCountdownElement(data as BaseSettings<CountdownData>, key);
							containerId = 'countdown-content';
							break;
						case 'gauge':
							element = this.createGaugeElement(data as BaseSettings<AdvancedGaugeWidgetData>, key);
							containerId = 'gauge-content';
							break;
						case 'progress-bar':
							element = this.createProgressBarElement(data as BaseSettings<ProgressBarWidgetData>, key);
							containerId = 'progress-bar-content';
							break;
					}

					if (element && containerId) {
						this.addListenerToRemoveButton(element, key);
						const container = document.getElementById(containerId);
						if (container) {
							container.appendChild(element);
						}
						this.allData.set(key, { key, data: data as BaseSettings<SettingsData>, element });
					}
				});
		});

		this.updateCounts();
		this.filterData();
	}

	private setupSearch(): void {
		const searchInput = document.getElementById('search-input') as HTMLInputElement;
		searchInput.addEventListener('input', (e) => {
			this.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
			this.filterData();
		});
	}

	private setupBulkCleanup(): void {
		const bulkCleanupButton = document.getElementById('bulk-cleanup-button') as HTMLButtonElement;
		const cleanupModal = document.getElementById('cleanup-modal') as HTMLElement;
		const cleanupCancelButtons = [
			document.getElementById('cleanup-cancel-button'),
			document.getElementById('cleanup-cancel-button-2')
		];
		const cleanupStartButton = document.getElementById('cleanup-start-button') as HTMLButtonElement;
		const cleanupAgeSelect = document.getElementById('cleanup-age') as HTMLSelectElement;
		const customDaysGroup = document.getElementById('custom-days-group') as HTMLElement;
		const customDaysInput = document.getElementById('custom-days') as HTMLInputElement;
		if (customDaysInput) {
			customDaysInput.disabled = cleanupAgeSelect.value !== 'custom';
		}

		bulkCleanupButton.addEventListener('click', () => {
			this.openCleanupModal();
		});

		cleanupCancelButtons.forEach(btn => {
			btn?.addEventListener('click', () => {
				cleanupModal.style.display = 'none';
			});
		});

		cleanupAgeSelect.addEventListener('change', (e) => {
			const value = (e.target as HTMLSelectElement).value;
			customDaysGroup.style.display = value === 'custom' ? 'block' : 'none';
			if (customDaysInput) {
				customDaysInput.disabled = cleanupAgeSelect.disabled || value !== 'custom';
			}
		});

		cleanupStartButton.addEventListener('click', async () => {
			await this.startCleanup();
		});

		cleanupModal.addEventListener('click', (e) => {
			if (e.target === cleanupModal) {
				cleanupModal.style.display = 'none';
			}
		});
	}

	private openCleanupModal(): void {
		const cleanupModal = document.getElementById('cleanup-modal') as HTMLElement;
		const cleanupProgress = document.getElementById('cleanup-progress') as HTMLElement;
		const cleanupStartButton = document.getElementById('cleanup-start-button') as HTMLButtonElement;
		const cleanupCancelButton = document.getElementById('cleanup-cancel-button-2') as HTMLButtonElement;
		const progressBar = document.getElementById('cleanup-progress-bar') as HTMLElement;
		const cleanupSummary = document.getElementById('cleanup-summary') as HTMLElement;
		
		cleanupProgress.style.display = 'none';
		if (progressBar) {
			progressBar.style.width = '0%';
		}
		cleanupSummary.innerHTML = '';
		cleanupStartButton.disabled = false;
		cleanupStartButton.innerHTML = 'Start Cleanup';
		cleanupStartButton.style.display = '';
		cleanupCancelButton.textContent = 'Cancel';
		cleanupCancelButton.disabled = false;
		this.setCleanupControlsDisabled(false);

		this.updateCleanupStats();
		cleanupModal.style.display = 'block';
	}

	private updateCleanupStats(): void {
		const ageSelect = document.getElementById('cleanup-age') as HTMLSelectElement;
		const customDaysInput = document.getElementById('custom-days') as HTMLInputElement;
		
		const selectedTypes = Array.from(document.querySelectorAll('.cleanup-type:checked'))
			.map(cb => (cb as HTMLInputElement).value);

		let totalCount = 0;
		let oldCount = 0;

		// If 'all' is selected, all items match
		if (ageSelect.value === 'all') {
			this.allData.forEach(({ data }) => {
				if (selectedTypes.includes(data.type)) {
					totalCount++;
					oldCount++;
				}
			});
		} else {
			let days = parseInt(ageSelect.value);
			if (ageSelect.value === 'custom') {
				days = parseInt(customDaysInput.value) || 30;
			}

			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - days);

			this.allData.forEach(({ data }) => {
				if (selectedTypes.includes(data.type)) {
					totalCount++;
					const lastUpdated = new Date(data.lastUpdated);
					if (lastUpdated < cutoffDate) {
						oldCount++;
					}
				}
			});
		}

		const totalCountElement = document.getElementById('total-items-count');
		const oldCountElement = document.getElementById('old-items-count');
		
		if (totalCountElement) totalCountElement.textContent = totalCount.toString();
		if (oldCountElement) oldCountElement.textContent = oldCount.toString();
	}

	private async startCleanup(): Promise<void> {
		const ageSelect = document.getElementById('cleanup-age') as HTMLSelectElement;
		const customDaysInput = document.getElementById('custom-days') as HTMLInputElement;
		const cleanupProgress = document.getElementById('cleanup-progress') as HTMLElement;
		const cleanupSummary = document.getElementById('cleanup-summary') as HTMLElement;
		const cleanupStartButton = document.getElementById('cleanup-start-button') as HTMLButtonElement;
		const cleanupCancelButton = document.getElementById('cleanup-cancel-button-2') as HTMLButtonElement;
		const progressBar = document.getElementById('cleanup-progress-bar') as HTMLElement;

		const selectedTypes = Array.from(document.querySelectorAll('.cleanup-type:checked'))
			.map(cb => (cb as HTMLInputElement).value);

		if (selectedTypes.length === 0) {
			await this.homey.alert('Please select at least one data type to cleanup');
			return;
		}

		const isAllMode = ageSelect.value === 'all';
		let days = 0;
		let cutoffDate: Date | null = null;

		if (!isAllMode) {
			days = parseInt(ageSelect.value);
			if (ageSelect.value === 'custom') {
				days = parseInt(customDaysInput.value);
				if (!days || days < 1) {
					await this.homey.alert('Please enter a valid number of days');
					return;
				}
			}
			cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - days);
		}

		const itemsToDelete: Array<{ key: string; data: BaseSettings<SettingsData> }> = [];
		this.allData.forEach(({ key, data }) => {
			if (selectedTypes.includes(data.type)) {
				if (isAllMode) {
					// Delete all items of selected types
					itemsToDelete.push({ key, data });
				} else if (cutoffDate) {
					// Delete only items older than cutoff date
					const lastUpdated = new Date(data.lastUpdated);
					if (lastUpdated < cutoffDate) {
						itemsToDelete.push({ key, data });
					}
				}
			}
		});

		if (itemsToDelete.length === 0) {
			const message = isAllMode ? 'No items found' : `No items found older than ${days} days`;
			cleanupProgress.style.display = 'block';
			cleanupSummary.innerHTML = message;
			if (progressBar) {
				progressBar.style.width = '100%';
			}
			return;
		}

		const confirmMessage = isAllMode 
			? `Are you sure you want to delete ALL ${itemsToDelete.length} items of the selected types?`
			: `Are you sure you want to delete ${itemsToDelete.length} items older than ${days} days?`;

		this.homey.confirm(
			confirmMessage,
			null,
			async (_err: string, confirmed: boolean) => {
				if (!confirmed) return;

				this.setCleanupControlsDisabled(true);
				cleanupStartButton.disabled = true;
				cleanupStartButton.innerHTML = '<span class="spinner"></span> Cleaning...';
				cleanupProgress.style.display = 'block';
				cleanupSummary.innerHTML = '';

				let deleted = 0;
				let failed = 0;

				for (let i = 0; i < itemsToDelete.length; i++) {
					const { key, data } = itemsToDelete[i];
					
					try {
						const success = await this.deleteItem(key);
						if (success) {
							deleted++;
							const item = this.allData.get(key);
							if (item) {
								item.element.remove();
								this.allData.delete(key);
							}
						} else {
							failed++;
						}
					} catch (error) {
						failed++;
					}

					const progress = ((i + 1) / itemsToDelete.length) * 100;
					progressBar.style.width = `${progress}%`;
					
					// Update summary
					cleanupSummary.innerHTML = `Processing: ${deleted + failed} of ${itemsToDelete.length} | ✓ ${deleted} | ✗ ${failed}`;

					if (i % 10 === 0) {
						await new Promise(resolve => setTimeout(resolve, 50));
					}
				}

				progressBar.style.width = '100%';
				cleanupSummary.innerHTML = `Cleanup Complete! Deleted: ${deleted}, Failed: ${failed}`;
				if (failed > 0) {
					cleanupSummary.innerHTML += '<br>Some items could not be deleted. Please try again later.';
				}
				cleanupStartButton.disabled = true;
				cleanupStartButton.style.display = 'none';
				cleanupCancelButton.textContent = 'Close';
				cleanupCancelButton.focus();
				
				this.updateCounts();
				this.filterData();
			}
		);
	}

	private setCleanupControlsDisabled(isDisabled: boolean): void {
		const ageSelect = document.getElementById('cleanup-age') as HTMLSelectElement;
		const customDaysInput = document.getElementById('custom-days') as HTMLInputElement;
		const cleanupTypes = document.querySelectorAll('.cleanup-type') as NodeListOf<HTMLInputElement>;

		ageSelect.disabled = isDisabled;
		if (customDaysInput) {
			if (isDisabled) {
				customDaysInput.disabled = true;
			} else {
				customDaysInput.disabled = ageSelect.value !== 'custom';
			}
		}

		cleanupTypes.forEach(cb => {
			cb.disabled = isDisabled;
		});
	}

	private deleteItem(key: string): Promise<boolean> {
		return new Promise((resolve) => {
			this.homey.api('DELETE', `/data/${key}`, (_err: string, result: boolean) => {
				resolve(result);
			});
		});
	}

	private setupModalHandlers(): void {
		const identifierModal = document.getElementById('identifier-modal') as HTMLElement;
		const addGaugeButton = document.getElementById('add-gauge-button') as HTMLButtonElement;
		const addProgressBarButton = document.getElementById('add-progress-bar-button') as HTMLButtonElement;
		const modalCancelButtons = [
			document.getElementById('modal-cancel-button'),
			document.getElementById('modal-cancel-button-2')
		];
		const modalSubmitButton = document.getElementById('modal-submit-button') as HTMLButtonElement;
		const typeInput = document.getElementById('type-input') as HTMLInputElement;
		const identifierInput = document.getElementById('identifier-input') as HTMLInputElement;

		addGaugeButton.addEventListener('click', () => {
			typeInput.value = 'gauge';
			identifierModal.style.display = 'block';
			identifierInput.focus();
		});

		addProgressBarButton.addEventListener('click', () => {
			typeInput.value = 'progress-bar';
			identifierModal.style.display = 'block';
			identifierInput.focus();
		});

		modalCancelButtons.forEach(btn => {
			btn?.addEventListener('click', () => {
				identifierModal.style.display = 'none';
				identifierInput.value = '';
			});
		});

		modalSubmitButton.addEventListener('click', async () => {
			const identifier = identifierInput.value.trim();
			if (!identifier) {
				await this.homey.alert('Please enter an identifier');
				return;
			}

			modalSubmitButton.disabled = true;
			const originalText = modalSubmitButton.innerHTML;
			modalSubmitButton.innerHTML = '<span class="spinner"></span> Creating...';

			try {
				if (typeInput.value === 'gauge') {
					await this.addGauge(identifier);
				} else if (typeInput.value === 'progress-bar') {
					await this.addProgressBar(identifier);
				}

				identifierInput.value = '';
				identifierModal.style.display = 'none';
			} finally {
				modalSubmitButton.disabled = false;
				modalSubmitButton.innerHTML = originalText;
			}
		});

		identifierModal.addEventListener('click', (e) => {
			if (e.target === identifierModal) {
				identifierModal.style.display = 'none';
				identifierInput.value = '';
			}
		});

		identifierInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				modalSubmitButton.click();
			}
		});
	}

	public async onHomeyReady(): Promise<void> {
		await this.getTimeAndLanguage();
		
		this.setupSearch();
		this.setupBulkCleanup();
		this.setupModalHandlers();

		const ageSelect = document.getElementById('cleanup-age') as HTMLSelectElement;
		const customDaysInput = document.getElementById('custom-days') as HTMLInputElement;
		ageSelect.addEventListener('change', () => this.updateCleanupStats());
		customDaysInput.addEventListener('input', () => this.updateCleanupStats());
		
		document.querySelectorAll('.cleanup-type').forEach(cb => {
			cb.addEventListener('change', () => this.updateCleanupStats());
		});

		await this.loadData();
		this.homey.ready();
	}

	private async addGauge(identifier: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.homey.api('POST', '/gauge', { identifier }, async (err: string, result: boolean) => {
				if (result) {
					await this.loadData();
					resolve();
				} else {
					await this.homey.alert('Failed to add gauge. Identifier might already exist.');
					reject(err);
				}
			});
		});
	}

	private async addProgressBar(identifier: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.homey.api('POST', '/progressbar', { identifier }, async (err: string, result: boolean) => {
				if (result) {
					await this.loadData();
					resolve();
				} else {
					await this.homey.alert('Failed to add progress bar. Identifier might already exist.');
					reject(err);
				}
			});
		});
	}
}

interface ModuleWindow extends Window {
	onHomeyReady: (homey: HomeySettings) => void;
}

declare const window: ModuleWindow;

window.onHomeyReady = async (homey: HomeySettings): Promise<void> => await new SettingsScript(homey).onHomeyReady();
