import type HomeyWidget from 'homey/lib/HomeyWidget';
import type { CountdownPayload } from '../api.mjs';
import type { BaseSettings } from '../../../datavistasettings/BaseSettings.mjs';

type Settings = {
	datasource?: {
		id: string;
		type: 'advanced';
		name: string;
		deviceName: string;
	};
	style: 'minimal' | 'blocks' | 'flip' | 'particles' | 'hourglass' | 'rings' | 'racecar' | 'racehorse' | 'boat';
	color: string;
	completionMessage: string;
	showName: boolean;
	overwriteName: string;
	showSeconds: boolean;
};

// ── Particle System ────────────────────────────────────────────────────────────

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	opacity: number;
	hue: number; // 0–360
	sat: number; // 0–100
	lit: number; // 0–100
	life: number; // 0–1, resets on death
};

type BaseHsl = { h: number; s: number; l: number };

class ParticleSystem {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private particles: Particle[] = [];
	private animationId: number | null = null;
	private completed = false;
	private urgency = 0; // 0 (calm) → 1 (urgent), drives speed + hue
	private baseHsl: BaseHsl;

	constructor(canvas: HTMLCanvasElement, baseHsl: BaseHsl = { h: 195, s: 80, l: 65 }) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
		this.baseHsl = baseHsl;
		this.resize();
		this.init();
	}

	private resize(): void {
		this.canvas.width = this.canvas.offsetWidth;
		this.canvas.height = this.canvas.offsetHeight;
	}

	private init(): void {
		const count = 55;
		for (let i = 0; i < count; i++) {
			this.particles.push(this.createParticle(true));
		}
	}

	private createParticle(randomPos = false): Particle {
		const w = this.canvas.width;
		const h = this.canvas.height;
		const speed = 0.08 + Math.random() * 0.12;
		const angle = Math.random() * Math.PI * 2;
		const { h: bh, s: bs, l: bl } = this.baseHsl;
		return {
			x: randomPos ? Math.random() * w : Math.random() * w,
			y: randomPos ? Math.random() * h : Math.random() * h,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			size: 0.8 + Math.random() * 1.6,
			opacity: 0.3 + Math.random() * 0.55,
			hue: bh + (Math.random() * 2 - 1) * 15,
			sat: bs,
			lit: bl,
			life: Math.random(),
		};
	}

	setUrgency(value: number): void {
		this.urgency = Math.max(0, Math.min(1, value));
	}

	setCompleted(): void {
		this.completed = true;
	}

	reset(): void {
		this.completed = false;
		this.urgency = 0;
		for (const p of this.particles) {
			p.sat = this.baseHsl.s;
			p.lit = this.baseHsl.l;
		}
	}

	start(): void {
		const loop = (): void => {
			this.draw();
			this.animationId = requestAnimationFrame(loop);
		};
		this.animationId = requestAnimationFrame(loop);
	}

	stop(): void {
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
	}

	private draw(): void {
		const { ctx, canvas, particles, urgency, completed } = this;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const speedMultiplier = completed ? 0.3 : 1 + urgency * 4;

		for (const p of particles) {
			// Update position
			p.x += p.vx * speedMultiplier;
			p.y += p.vy * speedMultiplier;

			// Wrap around edges
			if (p.x < -4) p.x = canvas.width + 4;
			if (p.x > canvas.width + 4) p.x = -4;
			if (p.y < -4) p.y = canvas.height + 4;
			if (p.y > canvas.height + 4) p.y = -4;

			// Keep the user's chosen hue; express urgency/completion through saturation and lightness only
			if (completed) {
				p.lit += (Math.min(85, this.baseHsl.l + 15) - p.lit) * 0.01;
				p.sat += (this.baseHsl.s - p.sat) * 0.01;
			} else if (urgency > 0) {
				p.sat += (Math.min(100, this.baseHsl.s + urgency * 35) - p.sat) * 0.015;
			}

			// Draw
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
			ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.lit}%, ${p.opacity})`;
			ctx.fill();
		}

	}
}

// ── Main widget ────────────────────────────────────────────────────────────────

class CountdownWidgetScript {
	private homey: HomeyWidget;
	private settings: Settings;
	private tickInterval: ReturnType<typeof setInterval> | null = null;
	private configAnimationTimeout: ReturnType<typeof setTimeout> | null = null;
	private rcTickerTimeout: ReturnType<typeof setTimeout> | null = null;
	private particles: ParticleSystem | null = null;
	private currentData: CountdownPayload | null = null;
	private totalSeconds = 0; // set on first valid data load
	private language: string = 'en';
	private wasContrastDefault = false;

	private static getUnitLabel(language: string, unit: 'day' | 'hour' | 'minute' | 'second'): string {
		try {
			const parts = new Intl.NumberFormat(language, {
				style: 'unit',
				unit,
				unitDisplay: 'narrow',
			}).formatToParts(1);
			return parts.find(p => p.type === 'unit')?.value ?? unit.charAt(0);
		} catch {
			return unit.charAt(0);
		}
	}

	private applyUnitLabels(): void {
		const labels = document.querySelectorAll<HTMLElement>('.unit .label');
		const units: Array<'day' | 'hour' | 'minute' | 'second'> = ['day', 'hour', 'minute', 'second'];
		labels.forEach((el, i) => {
			if (units[i]) el.textContent = CountdownWidgetScript.getUnitLabel(this.language, units[i]);
		});
	}

	constructor(homey: HomeyWidget) {
		this.homey = homey;
		this.settings = homey.getSettings() as Settings;
		this.wasContrastDefault = !this.settings.color || this.settings.color === 'contrast';
		const contrastColor = getComputedStyle(document.documentElement)
			.getPropertyValue('--homey-color-mono-1000')
			.trim();
		if (this.wasContrastDefault) {
			this.settings.color = contrastColor;
		}
	}

	private static hexToRgba(hex: string, opacity: number): string {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return `rgba(0,0,0,${opacity})`;
		return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${opacity})`;
	}

	private static hexToHsl(hex: string): BaseHsl {
		const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		if (!result) return { h: 195, s: 80, l: 65 };
		const r = parseInt(result[1], 16) / 255;
		const g = parseInt(result[2], 16) / 255;
		const b = parseInt(result[3], 16) / 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const delta = max - min;
		const lNorm = (max + min) / 2;
		if (delta < 0.001) {
			// achromatic — render as gray; floor lightness so particles are visible on dark bg
			return { h: 0, s: 0, l: Math.max(55, Math.round(lNorm * 100)) };
		}
		const s = delta / (1 - Math.abs(2 * lNorm - 1));
		let h: number;
		switch (max) {
			case r: h = ((g - b) / delta + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / delta + 2) / 6; break;
			default: h = ((r - g) / delta + 4) / 6; break;
		}
		// Clamp saturation to [60, 100] and boost lightness so particles glow on the dark bg
		const sPct = Math.round(Math.max(60, Math.min(100, s * 100)));
		const lPct = Math.round(Math.max(55, Math.min(80, lNorm * 100 + 20)));
		return { h: Math.round(h * 360), s: sPct, l: lPct };
	}

	private applyAccentColor(): void {
		const color = this.settings.color;
		const root = document.documentElement;
		root.style.setProperty('--countdown-accent', color);
		root.style.setProperty('--countdown-accent-20', CountdownWidgetScript.hexToRgba(color, 0.20));
		root.style.setProperty('--countdown-accent-30', CountdownWidgetScript.hexToRgba(color, 0.30));
		root.style.setProperty('--countdown-accent-50', CountdownWidgetScript.hexToRgba(color, 0.50));
		root.style.setProperty('--countdown-accent-55', CountdownWidgetScript.hexToRgba(color, 0.55));
		root.style.setProperty('--countdown-accent-90', CountdownWidgetScript.hexToRgba(color, 0.90));

		// Race clock keeps amber when the user hasn't picked an explicit color,
		// because the default "Contrast" resolves to white/black — black digits
		// on the dark panel would be unreadable on light themes.
		const clockColor = this.wasContrastDefault ? '#ffb300' : color;
		root.style.setProperty('--countdown-clock', clockColor);
		root.style.setProperty('--countdown-clock-40', CountdownWidgetScript.hexToRgba(clockColor, 0.40));
		root.style.setProperty('--countdown-clock-70', CountdownWidgetScript.hexToRgba(clockColor, 0.70));
		root.style.setProperty('--countdown-clock-85', CountdownWidgetScript.hexToRgba(clockColor, 0.85));
	}

	// ── Logging helpers ──────────────────────────────────────────────────────

	private async logMessage(message: string, logToSentry: boolean, ...optionalParams: unknown[]): Promise<void> {
		await this.homey.api('POST', '/logMessage', { message, logToSentry, optionalParams });
	}

	private async logError(message: string, error: Error): Promise<void> {
		const serializedError = JSON.stringify(error, Object.getOwnPropertyNames(error));
		await this.homey.api('POST', '/logError', { message, error: serializedError });
	}

	// ── Fetch ────────────────────────────────────────────────────────────────

	private async fetchData(): Promise<CountdownPayload | null> {
		return (await this.homey.api('POST', '/datasource', {
			datasource: this.settings.datasource,
		})) as CountdownPayload | null;
	}

	// ── Countdown logic ──────────────────────────────────────────────────────

	private startCountdown(data: CountdownPayload): void {
		this.stopCountdown();
		this.stopRacecarTicker();
		this.currentData = data;

		this.restoreElement(document.getElementById('hourglass-wrap'));
		this.restoreElement(document.getElementById('hg-scene'));
		this.restoreElement(document.getElementById('racecar-wrap'));
		this.restoreElement(document.getElementById('racehorse-wrap'));
		this.restoreElement(document.getElementById('boat-wrap'));
		document.querySelector('.homey-widget')?.classList.remove('racecar-completed');
		document.querySelector('.homey-widget')?.classList.remove('racehorse-completed');
		document.querySelector('.homey-widget')?.classList.remove('boat-completed');
		document.querySelector('.homey-widget')?.classList.remove('hourglass-completed');

		const target = new Date(data.endDatetime).getTime();
		const initialRemaining = Math.max(0, target - Date.now());
		this.totalSeconds = Math.floor(initialRemaining / 1000);

		this.tick(data, target);
		this.tickInterval = setInterval(() => this.tick(data, target), 1000);
	}

	private stopCountdown(): void {
		if (this.tickInterval !== null) {
			clearInterval(this.tickInterval);
			this.tickInterval = null;
		}
	}

	private setUnitValue(id: string, value: string): void {
		const el = document.getElementById(id)!;
		const isFlip = this.settings.style === 'flip';

		// Grow/shrink the digit slot count so values of any magnitude fit.
		// Hours/minutes/seconds always pad to 2 chars, but a months-long countdown
		// can yield 3+ day digits — without resizing, leftover characters get dropped.
		while (el.querySelectorAll('.digit').length < value.length) {
			const span = document.createElement('span');
			span.className = 'digit';
			if (isFlip) {
				span.innerHTML = '<span class="d-back">-</span><span class="d-bot">-</span><span class="d-top">-</span>';
				span.dataset.val = '-';
			} else {
				span.textContent = '-';
			}
			el.appendChild(span);
		}
		while (el.querySelectorAll('.digit').length > value.length) {
			el.querySelector('.digit:last-child')?.remove();
		}

		const digits = el.querySelectorAll<HTMLElement>('.digit');
		for (let i = 0; i < digits.length; i++) {
			const digit = digits[i];
			const ch = value[i] ?? '';
			const current = isFlip
				? (digit.dataset.val ?? '-')
				: (digit.textContent ?? '');
			if (current === ch) continue;
			if (!isFlip) {
				digit.textContent = ch;
				continue;
			}
			this.flipDigit(digit, ch);
		}
	}

	private updateRings(d: number, h: number, m: number, s: number): void {
		const circumference = 2 * Math.PI * 15.5;
		const initialDays = Math.max(1, Math.floor(this.totalSeconds / 86400));

		const setRing = (id: string, ratio: number): void => {
			const ring = document.querySelector(`#${id} .ring-fg`) as SVGCircleElement | null;
			if (!ring) return;
			const clamped = Math.max(0, Math.min(1, ratio));
			ring.style.strokeDashoffset = String(circumference * (1 - clamped));
		};

		setRing('unit-days', d / initialDays);
		setRing('unit-hours', h / 24);
		setRing('unit-minutes', m / 60);
		setRing('unit-seconds', s / 60);
	}

	private updateHourglass(remainingSecs: number): void {
		const total = Math.max(this.totalSeconds, 1);
		const progress = Math.min(1, Math.max(0, 1 - remainingSecs / total));

		const topSand = document.getElementById('hg-top-sand') as unknown as SVGPathElement | null;
		const botSand = document.getElementById('hg-bottom-sand') as unknown as SVGPathElement | null;
		const grains = document.getElementById('hg-grains');
		if (!topSand || !botSand || !grains) return;

		// Top bulb: surface lowers from y=10 (full) to y=50 (empty).
		// Cone depression: deepest mid-drain, vanishes at the extremes.
		// The bulb's bottom curve (L 38 50 Q 35 lens 32 50) is included so the sand fills the small
		// lens at the apex where the grains drain through. The lens drains during the final
		// stretch of the countdown so the apex is fully empty at progress=1.
		const topSurfaceY = 10 + 40 * progress;
		const topDipDepth = 5 * Math.sin(Math.PI * progress);
		const topDipY = Math.min(50, topSurfaceY + topDipDepth);
		const lensDepth = 4 * Math.max(0, Math.min(1, (1 - progress) * 10));
		const lensApex = 50 + lensDepth;
		topSand.setAttribute(
			'd',
			`M 8 ${topSurfaceY.toFixed(2)} Q 35 ${topDipY.toFixed(2)} 62 ${topSurfaceY.toFixed(2)} L 38 50 Q 35 ${lensApex.toFixed(2)} 32 50 Z`,
		);

		// Bottom bulb: surface rises from y=102 (empty) toward y=62 (full).
		// Mound: peak in the middle, tallest mid-drain.
		const botSurfaceY = 102 - 40 * progress;
		const moundHeight = 5 * Math.sin(Math.PI * progress);
		const botPeakY = Math.max(62, botSurfaceY - moundHeight);
		botSand.setAttribute(
			'd',
			`M 8 102 L 8 ${botSurfaceY.toFixed(2)} Q 35 ${botPeakY.toFixed(2)} 62 ${botSurfaceY.toFixed(2)} L 62 102 Z`,
		);

		// Hide grain stream entirely when nothing is falling (avoids SMIL animation continuing visually).
		grains.style.display = progress > 0 && progress < 1 ? '' : 'none';
	}

	private updateHourglassTime(d: number, h: number, m: number, s: number): void {
		const text = document.getElementById('hg-time-text') as unknown as SVGTextElement | null;
		if (!text) return;
		const pad = (n: number): string => String(n).padStart(2, '0');
		const showSecs = this.settings.showSeconds !== false;
		let timeStr: string;
		if (d > 0) {
			timeStr = showSecs ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${d}d ${pad(h)}:${pad(m)}`;
		} else if (h > 0) {
			timeStr = showSecs ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
		} else {
			timeStr = showSecs ? `${pad(m)}:${pad(s)}` : `${pad(m)}m`;
		}
		text.textContent = timeStr;
		// Squish glyphs to fit inside the LED display recess (≈80 viewBox units wide)
		// when a very long duration like "365d 12:34:56" would otherwise overflow.
		text.removeAttribute('textLength');
		text.removeAttribute('lengthAdjust');
		const natural = text.getComputedTextLength();
		const maxLength = 78;
		if (natural > maxLength) {
			text.setAttribute('textLength', String(maxLength));
			text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
		}
	}

	private updateRacecar(remainingSecs: number): void {
		const total = Math.max(this.totalSeconds, 1);
		const progress = Math.min(1, Math.max(0, 1 - remainingSecs / total));

		const car = document.getElementById('rc-car');
		if (!car) return;

		// Car travels from x=0 to x=185. At 1.2× scale the nose sits at local x≈29,
		// reaching world x≈185+34.8=219.8 — the front just clears the skewed finish line
		// (left edge ≈x=218 at car midpoint y) exactly when the countdown hits 0.
		const startX = 0;
		const endX = 185;
		const x = startX + (endX - startX) * progress;
		car.setAttribute('transform', `translate(${x.toFixed(2)},21) scale(1.2)`);
	}

	private updateRacehorse(remainingSecs: number): void {
		const total = Math.max(this.totalSeconds, 1);
		const progress = Math.min(1, Math.max(0, 1 - remainingSecs / total));

		const horse = document.getElementById('rh-horse');
		if (!horse) return;

		// Horse travels from x=2 (essentially flush with the left edge — the tail tip at
		// local x=-3 is clipped by 1px) to x=193. At end the horse's head (local x≈32)
		// reaches x≈225 — just past the white winning post at x=220–222, with the trophy
		// and runoff dirt track filling the remaining width to the viewBox edge.
		const startX = 2;
		const endX = 193;
		const x = startX + (endX - startX) * progress;
		horse.setAttribute('transform', `translate(${x.toFixed(2)},18)`);
	}

	private updateBoat(remainingSecs: number): void {
		const total = Math.max(this.totalSeconds, 1);
		const progress = Math.min(1, Math.max(0, 1 - remainingSecs / total));

		const boat = document.getElementById('bt-boat');
		if (!boat) return;

		// Boat travels from x=2 to x=193, matching the racehorse range. At end the bow
		// (local x≈29) reaches world x≈222 — just past the finish buoy center at x=224.
		const x = 2 + 191 * progress;
		boat.setAttribute('transform', `translate(${x.toFixed(2)},20)`);
	}

	private initFlipDigits(): void {
		document.querySelectorAll<HTMLElement>('.digit').forEach(digit => {
			const ch = digit.textContent?.trim() ?? '-';
			digit.innerHTML = `<span class="d-back">${ch}</span><span class="d-bot">${ch}</span><span class="d-top">${ch}</span>`;
			digit.dataset.val = ch;
		});
	}

	private flipDigit(digit: HTMLElement, value: string): void {
		const back = digit.querySelector<HTMLElement>('.d-back')!;
		const bot = digit.querySelector<HTMLElement>('.d-bot')!;
		const top = digit.querySelector<HTMLElement>('.d-top')!;
		if (top.classList.contains('flipping')) return;
		back.textContent = value;
		top.classList.add('flipping');
		const onEnd = (): void => {
			top.removeEventListener('animationend', onEnd);
			top.classList.remove('flipping');
			bot.textContent = value;
			top.textContent = value;
			digit.dataset.val = value;
		};
		top.addEventListener('animationend', onEnd);
	}

	private tick(data: CountdownPayload, target: number): void {
		const remaining = target - Date.now();

		if (remaining <= 0) {
			const completionMsg = this.settings.completionMessage?.trim() || data.message || "Time's up!";
			this.stopCountdown();
			this.dissolveElement(document.getElementById('units-row'));
			const style = this.settings.style;
			const isRaceStyle = style === 'racecar' || style === 'racehorse' || style === 'boat';
			// Race styles show the message in their board; hourglass shows it in the brass plaque.
			// Other styles (minimal, blocks, flip, particles, rings) keep the centered message.
			if (!isRaceStyle && style !== 'hourglass') {
				this.showCompletionMessage(completionMsg);
			}
			if (this.particles) this.particles.setCompleted();
			if (style === 'hourglass') {
				this.updateHourglass(0);
				this.updateHourglassTime(0, 0, 0, 0);
				// Keep the bookshelf scene visible on completion — the parchment sign
				// shows the message and golden embers drift up from the hourglass;
				// the brass time plate fades out (handled by .hourglass-completed CSS).
				document.querySelector('.homey-widget')?.classList.add('hourglass-completed');
				this.setHourglassCompleted(completionMsg);
			}
			if (style === 'racecar') {
				this.updateRacecar(0);
				document.querySelector('.homey-widget')?.classList.add('racecar-completed');
				this.setRaceboardCompleted(completionMsg);
			}
			if (style === 'racehorse') {
				this.updateRacehorse(0);
				document.querySelector('.homey-widget')?.classList.add('racehorse-completed');
				this.setRaceboardCompleted(completionMsg);
			}
			if (style === 'boat') {
				this.updateBoat(0);
				document.querySelector('.homey-widget')?.classList.add('boat-completed');
				this.setRaceboardCompleted(completionMsg);
			}
			return;
		}

		const totalSecs = Math.floor(remaining / 1000);
		const d = Math.floor(totalSecs / 86400);
		const h = Math.floor((totalSecs % 86400) / 3600);
		const m = Math.floor((totalSecs % 3600) / 60);
		const s = totalSecs % 60;

		const isRaceStyle = this.settings.style === 'racecar' || this.settings.style === 'racehorse' || this.settings.style === 'boat';
		if (isRaceStyle) {
			this.updateRaceboardTime(d, h, m, s);
		} else {
			this.setUnitValue('days', String(d).padStart(2, '0'));
			this.setUnitValue('hours', String(h).padStart(2, '0'));
			this.setUnitValue('minutes', String(m).padStart(2, '0'));
			this.setUnitValue('seconds', String(s).padStart(2, '0'));

			const setVisible = (id: string, visible: boolean): void => {
				(document.getElementById(id)! as HTMLElement).style.display = visible ? '' : 'none';
			};
			const showDays = d > 0;
			const showHours = h > 0 || d > 0;
			setVisible('unit-days', showDays);
			setVisible('sep-hours', showDays);
			setVisible('unit-hours', showHours);
			setVisible('sep-minutes', showHours);
		}

		if (this.settings.style === 'hourglass') {
			this.updateHourglass(totalSecs);
			this.updateHourglassTime(d, h, m, s);
		}

		if (this.settings.style === 'rings') {
			this.updateRings(d, h, m, s);
		}

		if (this.settings.style === 'racecar') {
			this.updateRacecar(totalSecs);
		}

		if (this.settings.style === 'racehorse') {
			this.updateRacehorse(totalSecs);
		}

		if (this.settings.style === 'boat') {
			this.updateBoat(totalSecs);
		}

		if (this.particles) {
			let urgency: number;
			if (data.startDatetime != null) {
				// Both datetimes are the same "YYYY-MM-DDTHH:MM:SS" local format, so the
				// browser parses them identically — no timezone mismatch.
				const start = new Date(data.startDatetime).getTime();
				const totalMs = Math.max(1, target - start);
				urgency = Math.max(0, Math.min(1, (Date.now() - start) / totalMs));
			} else {
				// Fallback for countdowns stored before startDatetime was introduced:
				// ramp up over the last 5 minutes of remaining time.
				urgency = Math.max(0, Math.min(1, 1 - totalSecs / 300));
			}
			this.particles.setUrgency(urgency);
		}
	}

	private updateTitle(name: string | null): void {
		const el = document.getElementById('title')!;
		const isRaceStyle = this.settings.style === 'racecar' || this.settings.style === 'racehorse' || this.settings.style === 'boat';
		const isHourglass = this.settings.style === 'hourglass';
		const label = this.settings.overwriteName?.trim() || name?.trim() || null;
		if (!label || this.settings.showName === false) {
			if (isRaceStyle) {
				this.setupRaceBoard(el, null);
				el.style.display = 'block';
			} else if (isHourglass) {
				this.setPlaqueVisible(false);
			} else {
				el.style.display = 'none';
			}
			return;
		}
		if (isRaceStyle) {
			this.setupRaceBoard(el, label);
		} else if (isHourglass) {
			this.setPlaqueVisible(true);
			this.setPlaqueText(label.toUpperCase());
			return;
		} else {
			el.innerHTML = '';
			const span = document.createElement('span');
			span.className = 'title-text';
			span.textContent = label;
			el.appendChild(span);
			this.scheduleMarqueeCheck(span, el);
		}
		el.style.display = 'block';
	}

	private setPlaqueVisible(visible: boolean): void {
		const plaque = document.getElementById('hg-plaque-frame');
		if (plaque) plaque.style.display = visible ? '' : 'none';
	}

	private setPlaqueText(text: string): void {
		const plaqueText = document.getElementById('hg-plaque-text') as unknown as SVGTextElement | null;
		if (!plaqueText) return;

		// Reset any previous ticker state before measuring / setting new text
		plaqueText.classList.remove('hg-marquee');
		plaqueText.style.removeProperty('--hg-marquee-shift');
		plaqueText.style.removeProperty('--hg-marquee-dur');
		if (plaqueText.dataset.marqueeOriginal) {
			plaqueText.textContent = plaqueText.dataset.marqueeOriginal;
			delete plaqueText.dataset.marqueeOriginal;
		}
		plaqueText.setAttribute('x', '125');
		plaqueText.setAttribute('text-anchor', 'middle');
		plaqueText.removeAttribute('textLength');
		plaqueText.removeAttribute('lengthAdjust');

		plaqueText.textContent = text;
		const naturalLength = plaqueText.getComputedTextLength();

		if (naturalLength <= 125) return; // fits — centred, nothing more to do

		// Text too long for the parchment: scroll it as a ticker instead of squishing
		plaqueText.setAttribute('x', '60'); // left edge of clip region (x=60 to x=190)
		plaqueText.setAttribute('text-anchor', 'start');
		plaqueText.dataset.marqueeOriginal = text;
		plaqueText.textContent = `${text} • ${text}`; // double copy; • marks the loop boundary

		const shiftVBU = plaqueText.getComputedTextLength() - naturalLength; // one copy + gap

		// Convert viewBox units → CSS px using the SVG's rendered scale factor
		const svgEl = plaqueText.ownerSVGElement;
		const scaleX = svgEl ? svgEl.getBoundingClientRect().width / 250 : 1.4;
		const shiftPx = Math.ceil(shiftVBU * scaleX);

		plaqueText.style.setProperty('--hg-marquee-shift', `${shiftPx}px`);
		plaqueText.style.setProperty('--hg-marquee-dur', `${Math.max(8, Math.round(shiftVBU / 25))}s`);
		plaqueText.classList.add('hg-marquee');
	}

	private setupRaceBoard(titleEl: HTMLElement, label: string | null): void {
		let clip = titleEl.querySelector<HTMLElement>('.rc-board-clip');
		if (!clip) {
			clip = document.createElement('div');
			clip.className = 'rc-board-clip';
			titleEl.innerHTML = '';
			titleEl.appendChild(clip);
		}
		if (label) {
			clip.innerHTML = `<span class="rc-label-wrap"><span class="rc-label">${label}</span></span><span class="rc-sep"> | </span><span class="rc-time">-</span>`;
			const labelEl = clip.querySelector<HTMLElement>('.rc-label')!;
			const wrapEl = clip.querySelector<HTMLElement>('.rc-label-wrap')!;
			this.scheduleMarqueeCheck(labelEl, wrapEl);
		} else {
			clip.innerHTML = `<span class="rc-time rc-time--solo">-</span>`;
		}
	}

	private scheduleMarqueeCheck(el: HTMLElement, container: HTMLElement): void {
		el.classList.remove('marquee');
		el.style.removeProperty('--rc-marquee-shift');
		el.style.removeProperty('--rc-marquee-dur');
		const prev = el.dataset.marqueeOriginal;
		if (prev != null) {
			el.textContent = prev;
			delete el.dataset.marqueeOriginal;
		}
		setTimeout(() => {
			const overflow = el.scrollWidth - container.clientWidth;
			if (overflow <= 8) return;
			const originalText = el.textContent ?? '';
			const originalWidth = el.scrollWidth;
			el.dataset.marqueeOriginal = originalText;
			// Double the content with a gap so the loop boundary is seamless:
			// at translateX(-shift) copy 2 is exactly where copy 1 started.
			el.textContent = `${originalText} • ${originalText}`;
			const shift = el.scrollWidth - originalWidth;
			el.style.setProperty('--rc-marquee-shift', `${shift}px`);
			el.style.setProperty('--rc-marquee-dur', `${Math.max(5, Math.round(shift / 50))}s`);
			el.classList.add('marquee');
		}, 100);
	}

	private updateRaceboardTime(d: number, h: number, m: number, s: number): void {
		const titleEl = document.getElementById('title');
		if (!titleEl) return;
		const timeEl = titleEl.querySelector<HTMLElement>('.rc-time');
		if (!timeEl) return;
		const pad = (n: number): string => String(n).padStart(2, '0');
		const showSecs = this.settings.showSeconds !== false;
		let timeStr: string;
		if (d > 0) {
			timeStr = showSecs ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${d}d ${pad(h)}:${pad(m)}`;
		} else if (h > 0) {
			timeStr = showSecs ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`;
		} else {
			timeStr = showSecs ? `${pad(m)}:${pad(s)}` : `${pad(m)}m`;
		}
		timeEl.textContent = timeStr;
	}

	private setRaceboardCompleted(message: string): void {
		const titleEl = document.getElementById('title');
		if (!titleEl) return;
		const clip = titleEl.querySelector<HTMLElement>('.rc-board-clip');
		if (!clip) return;
		clip.innerHTML = `<span class="rc-msg-wrap"><span class="rc-msg">${message}</span></span>`;
		const msgEl = clip.querySelector<HTMLElement>('.rc-msg')!;
		const wrapEl = clip.querySelector<HTMLElement>('.rc-msg-wrap')!;
		this.scheduleMarqueeCheck(msgEl, wrapEl);
	}

	private setHourglassCompleted(message: string): void {
		// Force the plaque visible even if showName was off — it hosts the
		// completion message while the scene remains as a backdrop.
		this.setPlaqueVisible(true);
		this.setPlaqueText(message.toUpperCase());
	}

	private showUnits(visible: boolean): void {
		if (this.settings.style === 'racecar' || this.settings.style === 'racehorse' || this.settings.style === 'boat') return;
		const row = document.getElementById('units-row')!;
		if (visible) {
			this.restoreElement(row, 'flex');
		} else {
			row.style.display = 'none';
		}
	}

	private dissolveElement(el: HTMLElement | null): void {
		if (!el) return;
		// During initial setup (body not yet revealed), skip the fade and hide instantly —
		// otherwise the user sees a flash of the old content before it dissolves.
		if (document.body.style.visibility === 'hidden') {
			el.style.display = 'none';
			return;
		}
		// Skip if already hidden by CSS (e.g. display:none !important for race styles).
		// Otherwise the transitionend listener would never fire → memory leak.
		if (window.getComputedStyle(el).display === 'none') return;
		el.classList.add('dissolving');
		const onEnd = (): void => {
			el.removeEventListener('transitionend', onEnd);
			// Guard: if restoreElement was called while the transition was still in
			// progress, the dissolving class will have been removed and the reverse
			// transition fires transitionend here too — don't hide in that case.
			if (el.classList.contains('dissolving')) {
				el.style.display = 'none';
			}
		};
		el.addEventListener('transitionend', onEnd);
	}

	private restoreElement(el: HTMLElement | null, displayValue = ''): void {
		if (!el) return;
		el.classList.remove('dissolving');
		el.style.display = displayValue;
	}

	private rcBoardSlide(span: HTMLElement, text: string, hold: number, after: () => void): void {
		span.textContent = text;
		span.style.animation = 'none';
		void span.offsetWidth;
		span.style.animation = 'rc-board-in 0.5s forwards';
		this.rcTickerTimeout = setTimeout(after, 500 + hold);
	}

	private rcBoardSlideOut(span: HTMLElement, after: () => void): void {
		span.style.animation = 'rc-board-out 0.35s ease-in forwards';
		this.rcTickerTimeout = setTimeout(after, 350);
	}

	private startRacecarTicker(): void {
		const titleEl = document.getElementById('title');
		const msgEl = document.getElementById('completion-message');
		if (!titleEl || !msgEl) return;

		// The separate completion-message element is no longer needed — the board handles it
		msgEl.classList.remove('completion-visible');
		msgEl.style.display = 'none';

		const span = titleEl.querySelector<HTMLElement>('.rc-board-clip span');
		if (!span) return;

		const labelText = span.textContent ?? '';
		const msgText = msgEl.textContent ?? "Time's up!";

		const showLabel = (): void => this.rcBoardSlide(span, labelText, 3500, () => this.rcBoardSlideOut(span, showMsg));
		const showMsg   = (): void => this.rcBoardSlide(span, msgText,   7000, () => this.rcBoardSlideOut(span, showLabel));

		showLabel();
	}

	private stopRacecarTicker(): void {
		if (this.rcTickerTimeout !== null) {
			clearTimeout(this.rcTickerTimeout);
			this.rcTickerTimeout = null;
		}
	}

	private triggerRacecarTitleEntrance(): void {
		// Board content updates in place — no entrance animation
	}

	private showCompletionMessage(text: string): void {
		if (this.settings.style === 'racecar' || this.settings.style === 'racehorse' || this.settings.style === 'boat') return;
		const el = document.getElementById('completion-message')!;
		el.textContent = text;
		el.style.display = 'block';
		el.classList.add('completion-visible');
	}

	// ── Configure-me animation ───────────────────────────────────────────────

	private async startConfigurationAnimation(): Promise<void> {
		if (this.configAnimationTimeout !== null) return;

		this.updateTitle('Configure me');
		this.showUnits(false);

		const messages = [
			{ message: '-- d -- h -- m --', interval: 2500 },
			{ message: 'Counting down to something?', interval: 3500 },
			{ message: 'Set a date in a flow first', interval: 3500 },
			{ message: "I'm ready when you are!", interval: 3000 },
		];
		let i = 0;

		const step = (): void => {
			const { message, interval } = messages[i % messages.length];
			const el = document.getElementById('completion-message')!;
			el.textContent = message;
			el.style.display = 'block';
			el.classList.remove('completion-visible');
			i++;
			this.configAnimationTimeout = setTimeout(step, interval);
		};
		step();
	}

	private stopConfigurationAnimation(): void {
		if (this.configAnimationTimeout !== null) {
			clearTimeout(this.configAnimationTimeout);
			this.configAnimationTimeout = null;
		}
		const el = document.getElementById('completion-message')!;
		el.style.display = 'none';
		el.classList.remove('completion-visible');
	}

	// ── Entry point ──────────────────────────────────────────────────────────

	public async onHomeyReady(): Promise<void> {
		try {
			const body = document.querySelector('.homey-widget')!;

			// Apply style class
			body.classList.add(this.settings.style ?? 'minimal');

			// Restructure digit elements for the layered split-flap animation
			if (this.settings.style === 'flip') {
				this.initFlipDigits();
			}

			// Apply accent color CSS variables
			this.applyAccentColor();

			// Hide seconds if disabled
			if (!this.settings.showSeconds) {
				(document.getElementById('unit-seconds')! as HTMLElement).style.display = 'none';
				(document.getElementById('sep-seconds')! as HTMLElement).style.display = 'none';
			}

			// Fetch language for localized unit labels
			try {
				const tl = await this.homey.api('GET', '/getTimeAndLanguage') as { timezone: string; language: string };
				this.language = tl.language ?? 'en';
			} catch {
				// fall back to 'en'
			}
			this.applyUnitLabels();

			// Start particle system for 'particles' style
			if (this.settings.style === 'particles') {
				const canvas = document.getElementById('particle-canvas') as HTMLCanvasElement;
				const baseHsl = CountdownWidgetScript.hexToHsl(this.settings.color);
				this.particles = new ParticleSystem(canvas, baseHsl);
				this.particles.start();
			}

			// Calculate widget height based on style. Scenic SVG styles use the actual rendered
			// width so the height matches the SVG's aspect ratio, preventing empty gaps.
			const widgetWidth = document.body.offsetWidth || 350;
			let widgetHeight: number;
			if (this.settings.style === 'hourglass') {
				// viewBox 250:134 — scale to actual width; background: #2a1a0a covers any remainder
				widgetHeight = Math.ceil(widgetWidth * (134 / 250));
			} else if (this.settings.style === 'racehorse') {
				// sign board (≈25px) + SVG strip (viewBox 250:50) — no transparent gap between them
				widgetHeight = 25 + Math.ceil(widgetWidth * (50 / 250));
			} else if (this.settings.style === 'racecar') {
				// 15px intentional sky strip + sign board (~25px) + SVG track (viewBox 250:50)
				widgetHeight = 15 + 25 + Math.ceil(widgetWidth * (50 / 250));
			} else {
				// boat + text styles: 130px — extra space above shows as blue water / widget padding
				widgetHeight = 130;
			}
			this.homey.ready({ height: widgetHeight });

			if (!this.settings.datasource) {
				await this.logMessage('No datasource configured', false);
				await this.startConfigurationAnimation();
				return;
			}

			const data = await this.fetchData();
			if (!data) {
				await this.logMessage('Datasource returned null', false);
				await this.startConfigurationAnimation();
				return;
			}

			this.stopConfigurationAnimation();
			this.showUnits(true);
			this.updateTitle(data.name);
			this.triggerRacecarTitleEntrance();
			this.startCountdown(data);

			// Realtime updates when the flow card updates the countdown
			this.homey.on(`settings/${this.settings.datasource.id}`, (updated: BaseSettings<unknown> | null) => {
				if (!updated) return;
				const newData: CountdownPayload = {
					endDatetime: (updated.settings as { endDatetime: string }).endDatetime,
					startDatetime: (updated.settings as { startDatetime?: string }).startDatetime ?? null,
					message: (updated.settings as { message?: string }).message ?? null,
					identifier: updated.identifier,
					name: (updated.settings as { name?: string }).name ?? null,
				};
				this.stopConfigurationAnimation();
				// Hide completion message before restoring units to avoid any flash
				const completionEl = document.getElementById('completion-message')!;
				completionEl.style.display = 'none';
				completionEl.classList.remove('completion-visible');
				this.showUnits(true);
				this.updateTitle(newData.name);
				this.triggerRacecarTitleEntrance();
				if (this.particles) this.particles.reset();
				this.startCountdown(newData);
			});
		} catch (error) {
			if (error instanceof Error) {
				await this.logError('An error occurred while initializing the countdown widget', error);
			} else {
				await this.logMessage('An error occurred while initializing the countdown widget', true, error);
			}
			await this.startConfigurationAnimation();
		} finally {
			document.body.style.visibility = 'visible';
		}
	}
}

interface ModuleWindow extends Window {
	onHomeyReady: (homey: HomeyWidget) => Promise<void>;
}

declare const window: ModuleWindow;

window.onHomeyReady = async (homey: HomeyWidget): Promise<void> =>
	new CountdownWidgetScript(homey).onHomeyReady();
