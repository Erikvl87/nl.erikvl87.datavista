import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { get } from 'https';
import { ExtendedError } from '../common/ExtendedError.mjs';
import DataVistaLogger from '../DataVistaLogger.mjs';

const ALLOWED_ORIGIN = 'https://icons-cdn.athom.com';
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

type IconResponse = { status: number; contentType: string | null; body: string };

/**
 * Fetch an icon with native fetch, or with the https module on runtimes without it (Node 16). Redirects are not followed.
 */
async function fetchIcon(url: URL): Promise<IconResponse> {
	if (typeof globalThis.fetch === 'function') {
		const response = await globalThis.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
		const contentLength = Number(response.headers.get('content-length'));
		if (contentLength > MAX_BYTES) throw new ExtendedError('Icon is too large.', { url: url.href, contentLength });
		const body = await response.text();
		if (body.length > MAX_BYTES) throw new ExtendedError('Icon is too large.', { url: url.href });
		return { status: response.status, contentType: response.headers.get('content-type'), body };
	}

	return new Promise((resolve, reject) => {
		const request = get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': 'DataVista' } }, response => {
			const chunks: Buffer[] = [];
			let size = 0;
			response.on('data', (chunk: Buffer) => {
				size += chunk.length;
				if (size > MAX_BYTES) {
					request.destroy(new ExtendedError('Icon is too large.', { url: url.href }));
					return;
				}
				chunks.push(chunk);
			});
			response.on('end', () =>
				resolve({
					status: response.statusCode ?? 0,
					contentType: response.headers['content-type'] ?? null,
					body: Buffer.concat(chunks).toString('utf8'),
				}),
			);
			response.on('error', reject);
		});
		request.on('timeout', () => request.destroy(new ExtendedError('Timeout while fetching icon.', { url: url.href })));
		request.on('error', reject);
	});
}

/**
 * Create a function to get the svg source for a given url.
 */
export function createGetSvgForUrl(logger: DataVistaLogger) {
	return async (url: string, color: string | null): Promise<string> => {
		try {
			const iconUrl = new URL(url);
			if (iconUrl.origin !== ALLOWED_ORIGIN) throw new ExtendedError('Icon url is not allowed.', { url });

			const response = await fetchIcon(iconUrl);
			if (response.status !== 200)
				throw new ExtendedError('Invalid response while fetching icon.', { url, status: response.status });

			if (!response.contentType?.includes('image/svg+xml'))
				throw new ExtendedError('Invalid content type while fetching icon.', { url, contentType: response.contentType });

			let iconSvgSource = response.body;
			if (color == null) return iconSvgSource;

			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(iconSvgSource, 'image/svg+xml');

			const elementsToUpdate = [
				...Array.from(svgDoc.getElementsByTagName('rect')),
				...Array.from(svgDoc.getElementsByTagName('text')),
				...Array.from(svgDoc.getElementsByTagName('path')),
				...Array.from(svgDoc.getElementsByTagName('*')).filter(
					el =>
						(el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') ||
						(el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none'),
				),
			];

			elementsToUpdate.forEach(el => {
				if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') {
					el.setAttribute('fill', color);
				}
				if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
					el.setAttribute('stroke', color);
				}
				if (el.tagName === 'rect' || el.tagName === 'text') {
					const style = el.getAttribute('style');
					if (style && style.includes('fill:')) {
						el.setAttribute('style', style.replace(/fill:[^;"]*;?/, `fill:${color};`));
					}
				}
			});

			const paths = svgDoc.getElementsByTagName('path');
			for (let i = 0; i < paths.length; i++) {
				const path = paths[i];
				if (!path.hasAttribute('fill')) {
					path.setAttribute('fill', color);
				}
			}

			const styles = svgDoc.getElementsByTagName('style');
			for (let i = 0; i < styles.length; i++) {
				const style = styles[i];
				if (style.textContent) {
					style.textContent = style.textContent.replace(/fill:[^;]+;/g, `fill:${color};`);
				}
			}

			iconSvgSource = new XMLSerializer().serializeToString(svgDoc);

			return iconSvgSource;
		} catch (error) {
			void logger.logException(error);
			throw error;
		}
	};
}
