/**
 * Swipe-to-reveal action for mobile list items.
 * Tracks horizontal swipe state on a container element,
 * revealing a background action zone (e.g. delete/unstar).
 */

const DEAD_ZONE = 10;
const THRESHOLD = -56;
const MAX_OFFSET = -56;

export type SwipeState = {
	id: string;
	startX: number;
	startY: number;
	offsetX: number;
	direction: 'horizontal' | 'vertical' | null;
	animating: boolean;
};

export function createSwipeState() {
	let swipe = $state<SwipeState | null>(null);
	let swipeOccurred = false;

	function start(e: TouchEvent, id: string) {
		if (swipe?.animating) return;
		const touch = e.touches[0];
		swipe = {
			id,
			startX: touch.clientX,
			startY: touch.clientY,
			offsetX: 0,
			direction: null,
			animating: false,
		};
	}

	function move(e: TouchEvent) {
		if (!swipe || swipe.animating) return;
		const touch = e.touches[0];
		const dx = touch.clientX - swipe.startX;
		const dy = touch.clientY - swipe.startY;

		if (swipe.direction === null) {
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < DEAD_ZONE) return;
			swipe.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
		}

		if (swipe.direction === 'vertical') return;

		e.preventDefault();
		swipe.offsetX = Math.max(MAX_OFFSET, Math.min(0, dx));
	}

	function end(onAction: (id: string) => void) {
		if (!swipe || swipe.animating) return;

		if (swipe.direction === 'horizontal') {
			swipeOccurred = true;
			setTimeout(() => swipeOccurred = false, 0);
		}

		const pastThreshold = swipe.offsetX <= THRESHOLD;
		const id = swipe.id;

		swipe.animating = true;
		swipe.offsetX = 0;

		if (pastThreshold) {
			requestAnimationFrame(() => {
				swipe = null;
				onAction(id);
			});
		} else {
			setTimeout(() => swipe = null, 200);
		}
	}

	return {
		get current() { return swipe; },
		get didSwipe() { return swipeOccurred; },
		start,
		move,
		end,
		offset(id: string) { return swipe?.id === id ? swipe.offsetX : 0; },
		isAnimating(id: string) { return swipe?.id === id && swipe.animating; },
		isPastThreshold(id: string) { return swipe?.id === id && swipe.offsetX <= THRESHOLD; },
	};
}
