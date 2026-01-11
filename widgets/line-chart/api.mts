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

class LineChartWidgetApi extends BaseWidgetApi {
	// Rolling resolutions map for quick checks
	private static readonly rollingResolutionsSet = new Set([
		'thisHour','lastHour','last60Minutes','this60Minutes','this6Hours','last6Hours','this12Hours','last12Hours','last24Hours','this24Hours','last7Days','this7Days','last31Days','this31Days','last365Days','this365Days'
	]);
	private static readonly minuteMs = 60 * 1000;
	private static readonly hourMs = 60 * 60 * 1000;
	private static readonly dayMs = 24 * LineChartWidgetApi.hourMs;

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
	 * Aggregates up to four datasources, aligning their periods for chart rendering.
	 */
	public async datasource({ homey, body }: ApiRequest): Promise<{
		data1: NormalizedPoint[];
		data2: NormalizedPoint[];
		data3: NormalizedPoint[];
		data4: NormalizedPoint[];
		updatesIn: number;
		name1?: string;
		name2?: string;
		name3?: string;
		name4?: string;
		units1: string;
		units2: string;
		units3: string;
		units4: string;
		windowStart: Date | null;
		windowEnd: Date | null;
		shiftOffsetMs1: number;
		shiftOffsetMs2: number;
		shiftOffsetMs3: number;
		shiftOffsetMs4: number;
	} | null> {
		const settings = body.settings as {
			timeframe: Timeframe;
			period1: Period;
			period2: Period;
			period3: Period;
			period4: Period;
		};

		const datasourceConfigs: Array<{
			datasource: DataSource | null | undefined;
			period: Period;
		}> = [
			{ datasource: body.datasource1, period: settings.period1 ?? 'this' },
			{ datasource: body.datasource2, period: settings.period2 },
			{ datasource: body.datasource3, period: settings.period3 },
			{ datasource: body.datasource4, period: settings.period4 },
		];

		const activePeriods = datasourceConfigs
			.filter(config => config.datasource != null)
			.map(config => config.period);
		const differentTimeframes = new Set(activePeriods).size > 1;
		const timeframeToAdjust: Period = LineChartWidgetApi.getTimeframeToAdjust(
			settings.timeframe,
			activePeriods,
		);

		const shiftFlags = datasourceConfigs.map(config =>
			differentTimeframes && config.period === timeframeToAdjust,
		);

		// Compute shift offsets in milliseconds for each series
		const shiftOffsets = datasourceConfigs.map((config, index) => {
			if (!shiftFlags[index]) return 0;
			return LineChartWidgetApi.computeShiftOffsetMs(settings.timeframe, config.period);
		});

		const datasetResults = await Promise.all(
			datasourceConfigs.map((config, index) =>
				this.getDataForDatasource(
					homey.app,
					settings.timeframe,
					config.period,
					config.datasource,
					shiftFlags[index],
				),
			),
		);

		void homey.app.logger.logMessage(
			`[${this.constructor.name}]: Dataset windows summary:`,
			false,
			datasetResults.map((r, i) => ({
				index: i + 1,
				window: r?.window,
				firstEntry: r?.data[0]?.[0] ?? null,
				lastEntry: r?.data[r.data.length - 1]?.[0] ?? null,
			})),
		);

		if (datasetResults.every(result => result == null)) return null;

		const updatesIn = datasetResults.reduce(
			(min, result) => Math.min(min, result?.updatesIn ?? Number.MAX_SAFE_INTEGER),
			Number.MAX_SAFE_INTEGER,
		);

		const mergedWindow = LineChartWidgetApi.mergeWindowBounds(
			...datasetResults.map(result => result?.window ?? null),
		);

		return {
			data1: datasetResults[0]?.data ?? [],
			data2: datasetResults[1]?.data ?? [],
			data3: datasetResults[2]?.data ?? [],
			data4: datasetResults[3]?.data ?? [],
			updatesIn,
			name1: datasetResults[0]?.name ?? '',
			name2: datasetResults[1]?.name ?? '',
			name3: datasetResults[2]?.name ?? '',
			name4: datasetResults[3]?.name ?? '',
			units1: datasetResults[0]?.units ?? '',
			units2: datasetResults[1]?.units ?? '',
			units3: datasetResults[2]?.units ?? '',
			units4: datasetResults[3]?.units ?? '',
			windowStart: mergedWindow.start,
			windowEnd: mergedWindow.end,
			shiftOffsetMs1: shiftOffsets[0],
			shiftOffsetMs2: shiftOffsets[1],
			shiftOffsetMs3: shiftOffsets[2],
			shiftOffsetMs4: shiftOffsets[3],
		};
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
	): Promise<{
		updatesIn: number;
		data: NormalizedPoint[];
		units: string;
		name: string;
		insightResolution: string | undefined;
		window: { start: Date | null; end: Date | null };
	} | null> {
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
		const insightResolution = datasource?.insightResolution;

		const trimmingWindows: Record<string, { start: Date; end: Date }> = {};
		const applyTrimming = (
			insights: ExtendedInsightsLogs | null,
			resolution: string | undefined,
		): ExtendedInsightsLogs | null => {
			if (!insights || !resolution) return insights;
			const def = LineChartWidgetApi.buildRollingWindow(Date.now(), resolution);
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
				.map(point => LineChartWidgetApi.normalizeDataPoint(point, timeframe, period, applyNormalizationShift))
				.sort((a, b) => a[0].getTime() - b[0].getTime())
			: [];

		const window = LineChartWidgetApi.resolveNormalizedWindow(
			insightResolution,
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
			insightResolution: insightResolution,
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

	/**
	 * Returns the canonical rolling window boundaries for a given live timeframe.
	 * Keeps the logic centralised so trimming and diagnostics rely on identical values.
	 */
	private static buildRollingWindow(
		now: number,
		timeframe: string,
	): { start: Date; end: Date } | null {
		const minuteMs = LineChartWidgetApi.minuteMs;
		const hourMs = LineChartWidgetApi.hourMs;
		const dayMs = LineChartWidgetApi.dayMs;
		
		switch (timeframe) {
			case 'thisHour': {
				const hourStart = new Date(now);
				hourStart.setMinutes(0, 0, 0);
				const hourEnd = new Date(hourStart.getTime() + hourMs);
				return { start: hourStart, end: hourEnd };
			}
			case 'lastHour': {
				const thisHourStart = new Date(now);
				thisHourStart.setMinutes(0, 0, 0);
				const lastHourStart = new Date(thisHourStart.getTime() - hourMs);
				return { start: lastHourStart, end: thisHourStart };
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
	 * Computes the shift offset in milliseconds for a given timeframe and period.
	 * Returns positive offset for 'last' periods (shifted forward), negative for 'this' periods (shifted back).
	 * The frontend can subtract this offset to get the original timestamp.
	 */
	private static computeShiftOffsetMs(timeframe: Timeframe, period: Period): number {
		const cfg = LineChartWidgetApi.periodShiftMap[LineChartWidgetApi.mapTimeframeKey(timeframe)];
		const dir = period === 'this' ? -1 : 1;
		const hourMs = LineChartWidgetApi.hourMs;
		const dayMs = LineChartWidgetApi.dayMs;

		switch (cfg.unit) {
			case 'hours':
				return dir * cfg.value * hourMs;
			case 'days':
				return dir * cfg.value * dayMs;
			case 'months':
				// Approximate: 30 days per month
				return dir * cfg.value * 30 * dayMs;
			case 'years':
				// Approximate: 365 days per year
				return dir * cfg.value * 365 * dayMs;
			default:
				return 0;
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
		const cfg = LineChartWidgetApi.periodShiftMap[LineChartWidgetApi.mapTimeframeKey(timeframe)];
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
			timestamp = LineChartWidgetApi.applyNormalizationShift(timestamp, timeframe, period === 'this');
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
		if (resolution && LineChartWidgetApi.rollingResolutionsSet.has(resolution)) {
			const tw = trimmingWindows[resolution];
			let start = tw?.start ? new Date(tw.start.getTime()) : null;
			let end = tw?.end ? new Date(tw.end.getTime()) : null;
			if (applyShift) {
				if (start) start = LineChartWidgetApi.applyNormalizationShift(start, timeframe, period === 'this');
				if (end) end = LineChartWidgetApi.applyNormalizationShift(end, timeframe, period === 'this');
			}
			return { start, end };
		}

		if (!entries.length) return { start: null, end: null };
		const start = entries[0][0];
		const end = entries[entries.length - 1][0];
		return { start, end };
	}

	/**
	 * Merges one or more windows into a single covering range, ignoring missing values.
	 */
	private static mergeWindowBounds(
		...windows: Array<{ start: Date | null; end: Date | null } | null>
	): { start: Date | null; end: Date | null } {
		const starts = windows
			.map(window => window?.start ?? null)
			.filter((value): value is Date => value instanceof Date);
		const ends = windows
			.map(window => window?.end ?? null)
			.filter((value): value is Date => value instanceof Date);

		const start = starts.length
			? new Date(Math.min(...starts.map(date => date.getTime())))
			: null;
		const end = ends.length
			? new Date(Math.max(...ends.map(date => date.getTime())))
			: null;

		return { start, end };
	}

	/**
	 * Calculates the nominal length of a period for a given timeframe.
	 */
	private static getPeriodDurationMs(
		timeframe: Timeframe,
		period: Period,
		reference: Date = new Date(),
	): number {
		const cfg = LineChartWidgetApi.periodShiftMap[LineChartWidgetApi.mapTimeframeKey(timeframe)];
		if (!cfg) return 0;

		switch (cfg.unit) {
			case 'hours':
				return cfg.value * 60 * 60 * 1000;
			case 'days':
				return cfg.value * 24 * 60 * 60 * 1000;
			case 'months': {
				const anchor = new Date(reference.getFullYear(), reference.getMonth(), 1);
				const offset = period === 'this' ? 0 : -cfg.value;
				anchor.setMonth(anchor.getMonth() + offset);
				const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
				const end = new Date(start.getFullYear(), start.getMonth() + cfg.value, 1);
				return end.getTime() - start.getTime();
			}
			case 'years': {
				const anchor = new Date(reference.getFullYear(), 0, 1);
				const offset = period === 'this' ? 0 : -cfg.value;
				anchor.setFullYear(anchor.getFullYear() + offset);
				const start = new Date(anchor.getFullYear(), 0, 1);
				const end = new Date(start.getFullYear() + cfg.value, 0, 1);
				return end.getTime() - start.getTime();
			}
			default:
				return 0;
		}
	}

	/**
	 * Determines which period should be shifted to align with the other.
	 * For rolling timeframes (equal durations), always shift 'last' to show current dates.
	 * For calendar timeframes (variable durations), shift the shorter period to show more data.
	 */
	private static getTimeframeToAdjust(
		timeframe: Timeframe,
		periods: Period[],
	): Period {
		if (!periods.length) return 'last';
		const uniquePeriods = new Set(periods);
		if (uniquePeriods.size <= 1) return 'last';
		if (!uniquePeriods.has('this')) return 'last';
		if (!uniquePeriods.has('last')) return 'this';

		// Rolling timeframes have fixed durations - prefer showing current dates
		const rollingTimeframes = ['60minutes', '6hours', '12hours', '24hours', '7days', '31days', '365days'];
		if (rollingTimeframes.includes(timeframe)) {
			return 'last';
		}

		// Calendar timeframes - shift the shorter period to show the longer one's date range
		const reference = new Date();
		const thisDuration = LineChartWidgetApi.getPeriodDurationMs(timeframe, 'this', reference);
		const lastDuration = LineChartWidgetApi.getPeriodDurationMs(timeframe, 'last', reference);

		if (thisDuration === 0 && lastDuration === 0) return 'last';
		if (thisDuration < lastDuration) return 'this';
		if (lastDuration < thisDuration) return 'last';

		return 'last';
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

export default new LineChartWidgetApi();
