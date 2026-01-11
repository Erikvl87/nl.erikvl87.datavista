import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { ExtendedError } from '../common/ExtendedError.mjs';
import DataVistaLogger from '../DataVistaLogger.mjs';

let fetch: typeof globalThis.fetch;

void (async (): Promise<void> => {
	if (typeof globalThis.fetch === 'function') {
		fetch = globalThis.fetch;
	} else {
		const { default: nodeFetch } = await import('node-fetch');
		fetch = nodeFetch as unknown as typeof fetch;
	}
})();

/**
 * Create a function to get the svg source for a given url.
 */
export function createGetSvgForUrl(logger: DataVistaLogger) {
	return async (url: string, color: string | null): Promise<string> => {
		try {
			const response = await fetch(url);
			if (!response.ok) throw new ExtendedError('Invalid response while fetching icon. Status: ', { response });

			if (!response.headers.get('content-type')?.includes('image/svg+xml'))
				throw new ExtendedError('Invalid content type while fetching icon.', { response });

			let iconSvgSource = await response.text();
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
