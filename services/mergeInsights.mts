import { ExtendedLog, ExtendedInsightsLogs } from 'homey-api';

/**
 * Merge two insight responses into a single chronological dataset without trimming.
 * The first parameter is assumed to be the older period, the second the newer.
 * Duplicate timestamps prefer the newer dataset's value.
 */
export function mergeInsights(
	older: { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null,
	newer: { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null,
): { logs: ExtendedInsightsLogs; insight: ExtendedLog } | null {
	if (!older && !newer) return null;
	if (older && !newer) return older;
	if (!older && newer) return newer;

	const olderLogs = older!.logs;
	const newerLogs = newer!.logs;

	const gather = (l: ExtendedInsightsLogs): { t: string; v: number }[] => [...(l.values ?? []), l.lastValue];

	const map = new Map<string, number>();
	for (const p of gather(olderLogs)) map.set(p.t, p.v);
	for (const p of gather(newerLogs)) map.set(p.t, p.v);

	const points = Array.from(map.entries()).map(([t, v]) => ({ t, v }));
	points.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
	if (points.length === 0) return newer;

	const lastPoint = points[points.length - 1];
	const values = points.slice(0, -1);

	const start = values.length ? values[0].t : lastPoint.t;
	const end = lastPoint.t;
	const step = newerLogs.step ?? olderLogs.step;
	const updatesIn = newerLogs.updatesIn ?? olderLogs.updatesIn;

	return {
		insight: newer!.insight ?? older!.insight,
		logs: {
			updatesIn,
			values,
			start,
			end,
			step,
			uri: newerLogs.uri || olderLogs.uri,
			id: newerLogs.id || olderLogs.id,
			lastValue: lastPoint,
		},
	};
}
