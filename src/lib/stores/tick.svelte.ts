let now = $state(Date.now());
let started = false;

export function getNow(): number {
	return now;
}

export function startClock(): void {
	if (started) return;
	started = true;
	setInterval(() => { now = Date.now(); }, 60_000);
}
