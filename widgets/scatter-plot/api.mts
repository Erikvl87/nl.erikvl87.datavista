import { ExtendedInsightsLogs, ExtendedLog } from 'homey-api';
import type { ApiRequest } from '../../@types/api-types.js';
import { BaseWidgetApi } from '../BaseWidgetApi.mjs';
import type { DataSource } from '../BaseWidget.mjs';
import DataVista from '../../app.mjs';

interface InsightWidgetDataPayload {
	data: {
		insight: { units?: string };
		logs: ExtendedInsightsLogs;
	};
	name: string;
}

type Timeframe = 'hour' | 'day' | 'week' | 'month' | 'year' | '60minutes' | '6hours' | '12hours' | '24hours' | '7days' | '31days' | '365days';
type Period = 'this' | 'last';
type NormalizedPoint = [Date, number | '-'];

class ScatterPlotWidgetApi extends BaseWidgetApi {
	// Rolling resolutions map for quick checks
	private static readonly rollingResolutionsSet = new Set([
		'thisHour','lastHour','last60Minutes','this60Minutes','this6Hours','last6Hours','this12Hours','last12Hours','last24Hours','this24Hours','last7Days','this7Days','last31Days','this31Days','last365Days','this365Days'
	]);
	private static readonly minuteMs = 60 * 1000;
	private static readonly hourMs = 60 * 60 * 1000;
	private static readonly dayMs = 24 * ScatterPlotWidgetApi.hourMs;

	// Internal mapping using camelCase keys for lint compliance; exposed timeframe strings map to these.
	private static readonly periodShiftMap: Record<string, { unit: 'hours' | 'days' | 'months' | 'years'; value: number }> = {
		'hour': { unit: 'hours', value: 1 },
		'day': { unit: 'hours', value: 24 },
		'week': { unit: 'days', value: 7 },
		'month': { unit: 'months', value: 1 },
		'year': { unit: 'years', value: 1 },
		'sixtyMinutes': { unit: 'hours', value: 1 },
		'sixHours': { unit: 'hours', value: 6 },
		'twelveHours': { unit: 'hours', value: 12 },
		'twentyFourHours': { unit: 'days', value: 1 },
		'sevenDays': { unit: 'days', value: 7 },
		'thirtyOneDays': { unit: 'days', value: 31 },
		'threeHundredSixtyFiveDays': { unit: 'days', value: 365 },
	};

	/**
	 * Fetches two datasources and pairs them by timestamp to create correlation scatter data.
	 */
	public async datasource({ homey, body }: ApiRequest): Promise<{
		pairedData: [number, number][]; // [xValue, yValue] pairs
		updatesIn: number;
		nameX?: string;
		nameY?: string;
		unitsX: string;
		unitsY: string;
		pairedCount: number;
		totalPointsX: number;
		totalPointsY: number;
		windowStart: Date | null;
		windowEnd: Date | null;
	} | null> {
		const settings = body.settings as {
			timeframe: Timeframe;
			period: Period;
			insightResolution: DataSource['insightResolution'];
		};

		const { timezone } = await homey.app.getTimeAndLanguage();

		// Fetch both datasources independently with the same resolution
		const [dataX, dataY] = await Promise.all([
			this.getDataForDatasource(
				homey.app,
				settings.timeframe,
				settings.period,
				body.datasourceX,
				false, // No normalization shift for correlation
				settings.insightResolution,
				timezone,
			),
			this.getDataForDatasource(
				homey.app,
				settings.timeframe,
				settings.period,
				body.datasourceY,
				false, // No normalization shift for correlation
				settings.insightResolution,
				timezone,
			),
		]);

		// log settings
		void homey.app.logger.logMessage(
			`[${this.constructor.name}]: Fetched datasources for timeframe '${settings.timeframe}' and period '${settings.period}' with resolutions X='${dataX?.insightResolution ?? 'n/a'}' Y='${dataY?.insightResolution ?? 'n/a'}'`,
			false,
		);

		if (!dataX || !dataY) return null;

		// Log timestamp boundaries for debugging
		const logBoundaries = (label: string, data: NormalizedPoint[]): void => {
			if (data.length === 0) {
				void homey.app.logger.logMessage(`[${this.constructor.name}]: ${label} has NO data`, false);
			} else {
				const first = data[0][0];
				const last = data[data.length - 1][0];
				void homey.app.logger.logMessage(
					`[${this.constructor.name}]: ${label} boundaries: ${data.length} points from ${first.toISOString()} to ${last.toISOString()}`,
					false,
				);
			}
		};
		logBoundaries('DataX', dataX.data);
		logBoundaries('DataY', dataY.data);

		// Pair the data by timestamp alignment
		const pairedData = this.pairDataByTimestamp(dataX.data, dataY.data);

		void homey.app.logger.logMessage(
			`[${this.constructor.name}]: Paired ${pairedData.length} points from ${dataX.data.length} X and ${dataY.data.length} Y datapoints`,
			false,
		);

		const updatesIn = Math.min(dataX.updatesIn, dataY.updatesIn);

		// Determine the window boundaries from the earliest start and latest end
		let windowStart: Date | null = null;
		let windowEnd: Date | null = null;

		if (dataX.window.start && dataY.window.start) {
			windowStart = new Date(Math.min(dataX.window.start.getTime(), dataY.window.start.getTime()));
		} else {
			windowStart = dataX.window.start || dataY.window.start;
		}

		if (dataX.window.end && dataY.window.end) {
			windowEnd = new Date(Math.max(dataX.window.end.getTime(), dataY.window.end.getTime()));
		} else {
			windowEnd = dataX.window.end || dataY.window.end;
		}

		return {
			pairedData,
			updatesIn,
			nameX: dataX.name,
			nameY: dataY.name,
			unitsX: dataX.units,
			unitsY: dataY.units,
			pairedCount: pairedData.length,
			totalPointsX: dataX.data.length,
			totalPointsY: dataY.data.length,
			windowStart,
			windowEnd,
		};
	}

	/**
	 * Pairs two datasets by matching timestamps using nearest neighbor within tolerance.
	 * Returns array of [xValue, yValue] pairs for correlation scatter plot.
	 */
	private pairDataByTimestamp(
		dataX: NormalizedPoint[],
		dataY: NormalizedPoint[],
	): [number, number][] {
		if (dataX.length === 0 || dataY.length === 0) return [];

		// Calculate tolerance based on data step (5x the typical interval)
		const calculateAverageStep = (data: NormalizedPoint[]): number => {
			if (data.length < 2) return 5 * 60 * 1000; // Default 5 minutes
			let totalDiff = 0;
			for (let i = 1; i < Math.min(10, data.length); i++) {
				totalDiff += data[i][0].getTime() - data[i - 1][0].getTime();
			}
			return totalDiff / Math.min(9, data.length - 1);
		};

		const avgStepX = calculateAverageStep(dataX);
		const avgStepY = calculateAverageStep(dataY);
		const toleranceMs = Math.max(avgStepX, avgStepY) * 2.5; // 2.5x max step as tolerance

		const paired: [number, number][] = [];
		let jStart = 0; // Optimization: track position in dataY

		// Iterate over X dataset (typically smaller or equal)
		for (let i = 0; i < dataX.length; i++) {
			const [timeX, valueX] = dataX[i];
			if (valueX === '-') continue; // Skip missing values

			const timeXMs = timeX.getTime();
			let bestMatch: { value: number; timeDiff: number } | null = null;

			// Search in Y dataset starting from last matched position
			const searchStart = Math.max(0, jStart - 2); // Look back 2 positions
			const searchEnd = Math.min(dataY.length, jStart + 20); // Look ahead 20 positions

			for (let j = searchStart; j < searchEnd; j++) {
				const [timeY, valueY] = dataY[j];
				if (valueY === '-') continue;

				const timeYMs = timeY.getTime();
				const timeDiff = Math.abs(timeXMs - timeYMs);

				// Only consider if within tolerance
				if (timeDiff <= toleranceMs) {
					if (!bestMatch || timeDiff < bestMatch.timeDiff) {
						bestMatch = { value: valueY as number, timeDiff };
						jStart = j; // Update search position
					}
				}

				// Stop searching if we've gone too far past
				if (timeYMs > timeXMs + toleranceMs) break;
			}

			if (bestMatch) {
				paired.push([valueX as number, bestMatch.value]);
			}
		}

		return paired;
	}

	/**
	 * Resolves and normalises dataset values for a single datasource/period pair.
	 */
	private async getDataForDatasource(
		app: DataVista,
		timeframe: Timeframe,
		period: Period,
		datasource: DataSource | null | undefined,
		applyNormalizationShift: boolean,
		insightResolution?: DataSource['insightResolution'],
		timezone: string = 'UTC',
	): Promise<{
		updatesIn: number;
		data: NormalizedPoint[];
		units: string;
		name: string;
		insightResolution: string | undefined;
		window: { start: Date | null; end: Date | null };
	} | null> {
		// Update datasource with the resolved insight resolution before fetching
		if (datasource && insightResolution) {
			datasource = { ...datasource, insightResolution };
		}
		
		void app.logger.logMessage(
			`[${this.constructor.name}]: Fetching datasource with insightResolution='${datasource?.insightResolution ?? 'n/a'}'`,
			false,
		);
		
		const results = datasource ? await this.getDatasource(app, datasource) : null;

		if (results !== null && !BaseWidgetApi.isDataType(app, results, { datapoint: true })) {
			void app.logger.logMessage(
				`[${this.constructor.name}]: Unsupported data type for widget: ${results.type}`,
				true,
				results,
			);
			return null;
		}

		const insights = (results as InsightWidgetDataPayload | null)?.data.logs ?? null;
		const resolvedInsightResolution = insightResolution ?? datasource?.insightResolution;

		const trimmingWindows: Record<string, { start: Date; end: Date }> = {};
		const applyTrimming = (
			insights: ExtendedInsightsLogs | null,
			resolution: string | undefined,
		): ExtendedInsightsLogs | null => {
			if (!insights || !resolution) return insights;
			const def = ScatterPlotWidgetApi.buildRollingWindow(Date.now(), resolution, timezone);
			if (!def) return insights; // not a rolling resolution
			trimmingWindows[resolution] = { start: def.start, end: def.end };
			return (
				this.trimInsightToWindow(
					{ logs: insights, insight: { title: '' } as ExtendedLog },
					def.start,
					def.end,
				)?.logs ?? null
			);
		};
		const trimmed = applyTrimming(insights, insightResolution);
		const effectiveInsights = trimmed ?? insights;
		const step = effectiveInsights?.step ?? Number.MAX_SAFE_INTEGER;
		const updatesIn = effectiveInsights?.updatesIn ?? 0;
		const updatesInOldCalc = step - updatesIn; // TODO old implementation, need to verify!

		const entries = effectiveInsights ? [...(effectiveInsights.values ?? []), effectiveInsights.lastValue] : [];

		const units =
			results && (results as InsightWidgetDataPayload).data?.insight?.units
				? (results as InsightWidgetDataPayload).data.insight.units!
				: '';

		const data: NormalizedPoint[] = entries.length
			? entries
				.map(point => ScatterPlotWidgetApi.normalizeDataPoint(point, timeframe, period, applyNormalizationShift))
				.sort((a, b) => a[0].getTime() - b[0].getTime())
			: [];

		const window = ScatterPlotWidgetApi.resolveNormalizedWindow(
			resolvedInsightResolution,
			data,
			trimmingWindows,
			timeframe,
			period,
			applyNormalizationShift,
		);

		return {
			updatesIn: updatesInOldCalc,
			data,
			units,
			name: results?.name ?? '',
			insightResolution: resolvedInsightResolution,
			window,
		};
	}

	/**
	 * Normalises timeframe variants to the internal map keys.
	 */
	private static mapTimeframeKey(tf: Timeframe): string {
		switch (tf) {
			case '60minutes': return 'sixtyMinutes';
			case '6hours': return 'sixHours';
			case '12hours': return 'twelveHours';
			case '24hours': return 'twentyFourHours';
			case '7days': return 'sevenDays';
			case '31days': return 'thirtyOneDays';
			case '365days': return 'threeHundredSixtyFiveDays';
			default: return tf;
		}
	}

	/** Returns local date parts (year, month 1-12, day, hour 0-23, dayOfWeek 0=Sun) in the given timezone. */
	private static getLocalParts(now: number, timezone: string): { year: number; month: number; day: number; hour: number; dayOfWeek: number } {
		const d = new Date(now);
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false,
		}).formatToParts(d);
		const get = (type: string): number => parseInt(parts.find(p => p.type === type)!.value);
		const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d); // "YYYY-MM-DD"
		const dayOfWeek = new Date(`${localDateStr}T12:00:00Z`).getUTCDay();
		return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), dayOfWeek };
	}

	/** Returns the UTC Date that represents 00:00:00 local time on the given calendar date in the given timezone. */
	private static localMidnight(year: number, month: number, day: number, timezone: string): Date {
		const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
		const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
		const localHour = parseInt(new Intl.DateTimeFormat('en-US', {
			timeZone: timezone, hour: 'numeric', hour12: false,
		}).format(utcMidnight));
		// For UTC+2: utcMidnight is 02:00 local → subtract 2 h to reach 00:00 local
		// For UTC-5: utcMidnight is 19:00 local (prev day) → localHour=19 > 12 → adj=-5 → add 5 h
		const adj = localHour > 12 ? localHour - 24 : localHour;
		return new Date(utcMidnight.getTime() - adj * 3_600_000);
	}

	/**
	 * Returns the canonical rolling window boundaries for a given live timeframe.
	 * Keeps the logic centralised so trimming and diagnostics rely on identical values.
	 */
	private static buildRollingWindow(
		now: number,
		timeframe: string,
		timezone: string,
	): { start: Date; end: Date } | null {
		const minuteMs = ScatterPlotWidgetApi.minuteMs;
		const hourMs = ScatterPlotWidgetApi.hourMs;
		const dayMs = ScatterPlotWidgetApi.dayMs;
		
		const lp = ScatterPlotWidgetApi.getLocalParts(now, timezone);
		const lm = (y: number, mo: number, d: number): Date => ScatterPlotWidgetApi.localMidnight(y, mo, d, timezone);

		switch (timeframe) {
			case 'today': {
				const dayStart = lm(lp.year, lp.month, lp.day);
				return { start: dayStart, end: new Date(dayStart.getTime() + dayMs) };
			}
			case 'yesterday': {
				const todayStart = lm(lp.year, lp.month, lp.day);
				return { start: new Date(todayStart.getTime() - dayMs), end: todayStart };
			}
			case 'thisWeek': {
				const todayStart = lm(lp.year, lp.month, lp.day);
				const daysFromMonday = lp.dayOfWeek === 0 ? 6 : lp.dayOfWeek - 1;
				const weekStart = new Date(todayStart.getTime() - daysFromMonday * dayMs);
				return { start: weekStart, end: new Date(weekStart.getTime() + 7 * dayMs) };
			}
			case 'lastWeek': {
				const todayStart = lm(lp.year, lp.month, lp.day);
				const daysFromMonday = lp.dayOfWeek === 0 ? 6 : lp.dayOfWeek - 1;
				const thisWeekStart = new Date(todayStart.getTime() - daysFromMonday * dayMs);
				return { start: new Date(thisWeekStart.getTime() - 7 * dayMs), end: thisWeekStart };
			}
			case 'thisMonth': {
				const monthStart = lm(lp.year, lp.month, 1);
				const nextMo = lp.month === 12 ? 1 : lp.month + 1;
				const nextYr = lp.month === 12 ? lp.year + 1 : lp.year;
				return { start: monthStart, end: lm(nextYr, nextMo, 1) };
			}
			case 'lastMonth': {
				const thisMonthStart = lm(lp.year, lp.month, 1);
				const prevMo = lp.month === 1 ? 12 : lp.month - 1;
				const prevYr = lp.month === 1 ? lp.year - 1 : lp.year;
				return { start: lm(prevYr, prevMo, 1), end: thisMonthStart };
			}
			case 'thisYear': {
				return { start: lm(lp.year, 1, 1), end: lm(lp.year + 1, 1, 1) };
			}
			case 'lastYear': {
				return { start: lm(lp.year - 1, 1, 1), end: lm(lp.year, 1, 1) };
			}
			case 'thisHour': {
				const dayStart = lm(lp.year, lp.month, lp.day);
				const hourStart = new Date(dayStart.getTime() + lp.hour * hourMs);
				return { start: hourStart, end: new Date(hourStart.getTime() + hourMs) };
			}
			case 'lastHour': {
				const dayStart = lm(lp.year, lp.month, lp.day);
				const thisHourStart = new Date(dayStart.getTime() + lp.hour * hourMs);
				return { start: new Date(thisHourStart.getTime() - hourMs), end: thisHourStart };
			}
			case 'this60Minutes': return { start: new Date(now - 60 * minuteMs), end: new Date(now) };
			case 'last60Minutes': return { start: new Date(now - 120 * minuteMs), end: new Date(now - 60 * minuteMs) };
			case 'this6Hours': return { start: new Date(now - 6 * hourMs), end: new Date(now) };
			case 'last6Hours': return { start: new Date(now - 12 * hourMs), end: new Date(now - 6 * hourMs) };
			case 'this12Hours': return { start: new Date(now - 12 * hourMs), end: new Date(now) };
			case 'last12Hours': return { start: new Date(now - 24 * hourMs), end: new Date(now - 12 * hourMs) };
			case 'this24Hours': return { start: new Date(now - 24 * hourMs), end: new Date(now) };
			case 'last24Hours': return { start: new Date(now - 48 * hourMs), end: new Date(now - 24 * hourMs) };
			case 'this7Days': return { start: new Date(now - 7 * dayMs), end: new Date(now) };
			case 'last7Days': return { start: new Date(now - 14 * dayMs), end: new Date(now - 7 * dayMs) };
			case 'this31Days': return { start: new Date(now - 31 * dayMs), end: new Date(now) };
			case 'last31Days': return { start: new Date(now - 62 * dayMs), end: new Date(now - 31 * dayMs) };
			case 'this365Days': return { start: new Date(now - 365 * dayMs), end: new Date(now) };
			case 'last365Days': return { start: new Date(now - 730 * dayMs), end: new Date(now - 365 * dayMs) };
			default: return null;
		}
	}

	/**
	 * Shifts a timestamp forward or backward so periods line up for comparison.
	 */
	private static applyNormalizationShift(
		date: Date,
		timeframe: Timeframe,
		isThisPeriod: boolean,
	): Date {
		const cfg = ScatterPlotWidgetApi.periodShiftMap[ScatterPlotWidgetApi.mapTimeframeKey(timeframe)];
		const d = new Date(date.getTime());
		const dir = isThisPeriod ? -1 : 1;
		switch (cfg.unit) {
			case 'hours':
				d.setHours(d.getHours() + dir * cfg.value);
				break;
			case 'days':
				d.setDate(d.getDate() + dir * cfg.value);
				break;
			case 'months':
				d.setMonth(d.getMonth() + dir * cfg.value);
				break;
			case 'years':
				d.setFullYear(d.getFullYear() + dir * cfg.value);
				break;
		}
		return d;
	}

	/**
	 * Converts a datapoint to the widget format while optionally applying period alignment.
	 */
	private static normalizeDataPoint(
		point: { t: string; v: number },
		timeframe: Timeframe,
		period: Period,
		applyShift: boolean,
	): NormalizedPoint {
		let timestamp = new Date(point.t);
		if (applyShift) {
			timestamp = ScatterPlotWidgetApi.applyNormalizationShift(timestamp, timeframe, period === 'this');
		}
		if (point.v == null || Number.isNaN(point.v)) return [timestamp, '-'];
		return [timestamp, parseFloat(point.v.toFixed(2))];
	}

	/**
	 * Derives the effective window for a datasource based on trimmed input and applied shifts.
	 */
	private static resolveNormalizedWindow(
		resolution: string | undefined,
		entries: NormalizedPoint[],
		trimmingWindows: Record<string, { start: Date; end: Date }>,
		timeframe: Timeframe,
		period: Period,
		applyShift: boolean,
	): { start: Date | null; end: Date | null } {
		if (resolution && ScatterPlotWidgetApi.rollingResolutionsSet.has(resolution)) {
			const tw = trimmingWindows[resolution];
			let start = tw?.start ? new Date(tw.start.getTime()) : null;
			let end = tw?.end ? new Date(tw.end.getTime()) : null;
			if (applyShift) {
				if (start) start = ScatterPlotWidgetApi.applyNormalizationShift(start, timeframe, period === 'this');
				if (end) end = ScatterPlotWidgetApi.applyNormalizationShift(end, timeframe, period === 'this');
			}
			return { start, end };
		}

		if (!entries.length) return { start: null, end: null };
		// Use the canonical (timezone-aware) window start when available; fall back to first data point.
		// Always use the last data point as end so "today" shows 00:00 → current time, not 00:00 → 00:00.
		const start = trimmingWindows[resolution ?? '']?.start ?? entries[0][0];
		const end = entries[entries.length - 1][0];
		return { start, end };
	}

	/**
	 * Trim an insight response to a specific time window. Returns null if no data remains within the window.
	 */
	private trimInsightToWindow(
		result: { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null,
		windowStart: Date,
		windowEnd: Date,
	): { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null {
		if (!result) return null;
		const startMs = windowStart.getTime();
		const endMs = windowEnd.getTime();
		if (Number.isNaN(startMs) || Number.isNaN(endMs)) return result;
		if (endMs <= startMs) return result;

		const allPoints = [...(result.logs.values ?? []), result.logs.lastValue].filter(
			(point): point is { t: string; v: number } => point != null,
		);

		const filtered = allPoints.filter(point => {
			const timestamp = new Date(point.t).getTime();
			return timestamp >= startMs && timestamp <= endMs;
		});

		if (filtered.length === 0) return null;

		filtered.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
		const lastPoint = filtered[filtered.length - 1];
		const values = filtered.slice(0, -1);
		const start = values.length > 0 ? values[0].t : lastPoint.t;
		const end = lastPoint.t;

		return {
			insight: result.insight,
			logs: {
				...result.logs,
				values,
				start,
				end,
				lastValue: lastPoint,
			},
		};
	}
}

export default new ScatterPlotWidgetApi();
