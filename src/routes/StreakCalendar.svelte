<script lang="ts">
	import { getStreak, getStreakCalendarData } from '$lib/stores/history.svelte';
	import type { CalendarDay } from '$lib/utils/streak';

	interface Props {
		onDayClick?: (isoDate: string) => void;
	}

	let { onDayClick }: Props = $props();

	const streak = $derived(getStreak());
	const calendar = $derived(getStreakCalendarData());

	function getFireIconClass(count: number): string {
		if (count >= 20) return 'streak-fire-full';
		if (count >= 10) return 'streak-fire-med';
		if (count >= 5) return 'streak-fire-sm';
		return 'streak-fire-tiny';
	}

	function getDayClass(day: CalendarDay): string {
		const classes = ['streak-day'];
		if (day.isActive) classes.push('streak-day-active');
		if (day.isGap) classes.push('streak-day-gap');
		if (day.isToday) classes.push('streak-day-today');
		if (day.isOutside) classes.push('streak-day-outside');
		return classes.join(' ');
	}

	function handleDayClick(day: CalendarDay) {
		if (day.isActive && onDayClick) {
			onDayClick(day.iso);
		}
	}
</script>

{#if streak.streak > 0}
	<div class="streak-wrapper">
		<button class="streak-badge" title="View streak calendar">
			<span class="streak-fire {getFireIconClass(streak.streak)}">&#128293;</span>
			<span class="streak-count">{streak.streak}</span>
			{#if streak.expiresInDays <= 2}
				<span class="streak-warning" title="Streak expires soon!">!</span>
			{/if}
		</button>

		<div class="streak-dropdown">
			<div class="streak-header">
				<span class="streak-fire-large">&#128293;</span>
				<div class="streak-info">
					<span class="streak-count-large">{streak.streak} diff streak</span>
					{#if streak.expiresInDays <= 2}
						<span class="streak-expires streak-expires-warning">
							{streak.expiresInDays === 0 ? 'Expires today' : streak.expiresInDays === 1 ? 'Expires tomorrow' : `Expires in ${streak.expiresInDays} days`}
						</span>
					{:else if streak.startDate}
						<span class="streak-expires">
							Since {new Date(streak.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
						</span>
					{/if}
				</div>
			</div>

			<div class="streak-calendar">
				{#each calendar as month (month.monthLabel)}
					<div class="streak-month">
						<div class="streak-month-label">{month.monthLabel}</div>
						<div class="streak-grid">
							<div class="streak-day-names">
								<span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
							</div>
							{#each month.weeks as week}
								<div class="streak-week">
									{#each week as day (day.iso)}
										<button
											class={getDayClass(day)}
											title={day.diffCount > 0 ? `${day.diffCount} diff${day.diffCount > 1 ? 's' : ''}` : ''}
											onclick={() => handleDayClick(day)}
											disabled={!day.isActive}
										>
											{#if day.isActive}
												<span class="day-diamond" class:has-multi={day.diffCount > 1}>&#9670;</span>
											{:else}
												<span class="day-number">{day.label}</span>
											{/if}
										</button>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.streak-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		z-index: 10;
		outline: none;
	}

	.streak-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		color: var(--streak, #ff6b35);
		font-weight: 600;
		font-size: 0.9em;
		cursor: pointer;
		transition: opacity 0.2s;
		background: none;
		border: none;
		padding: 0;
	}

	.streak-badge:hover {
		opacity: 0.8;
	}

	.streak-fire {
		font-size: 0.9em;
	}

	.streak-fire-tiny {
		font-size: 0.7em;
	}

	.streak-fire-sm {
		font-size: 0.9em;
	}

	.streak-fire-med {
		font-size: 1.1em;
	}

	.streak-fire-full {
		font-size: 1.3em;
	}

	.streak-count {
		font-variant-numeric: tabular-nums;
	}

	.streak-warning {
		color: var(--danger);
		font-size: 0.75em;
		margin-left: 0.25rem;
	}

	.streak-dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		background: var(--bg-card);
		border: 1px solid var(--border-light);
		border-radius: 12px;
		padding: 1rem;
		min-width: 280px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
		z-index: 100;
		cursor: default;

		/* Hidden state */
		opacity: 0;
		visibility: hidden;
		transform: translateY(-0.5rem) scale(0.98);
		transition: opacity 0.2s, transform 0.2s, visibility 0s 0.2s;
		pointer-events: none;
	}

	/* Spacer to bridge gap between badge and dropdown */
	.streak-dropdown::before {
		content: '';
		position: absolute;
		top: -0.5rem;
		left: 0;
		width: 100%;
		height: 0.5rem;
	}

	.streak-wrapper:hover .streak-dropdown,
	.streak-wrapper:focus-within .streak-dropdown {
		opacity: 1;
		visibility: visible;
		transform: translateY(0) scale(1);
		transition: opacity 0.2s, transform 0.2s, visibility 0s;
		pointer-events: auto;
	}

	.streak-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.streak-fire-large {
		font-size: 1.75rem;
	}

	.streak-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.streak-count-large {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-heading);
	}

	.streak-expires {
		font-size: 0.8rem;
		color: var(--text-subtle);
	}

	.streak-expires-warning {
		color: var(--danger);
	}

	.streak-calendar {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.streak-month {
		margin-bottom: 1rem;
	}

	.streak-month-label {
		font-size: 0.75em;
		font-weight: 600;
		color: var(--text-dim);
		margin-bottom: 0.5rem;
	}

	.streak-grid {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.streak-day-names {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		text-align: center;
		font-size: 0.65rem;
		color: var(--text-dimmest);
		margin-bottom: 4px;
	}

	.streak-week {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}

	.streak-day {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.85rem;
		color: var(--text-dimmest);
		border-radius: 4px;
		cursor: default;
		background: none;
		border: none;
		padding: 0;
	}

	.streak-day:disabled {
		cursor: default;
	}

	.streak-day-outside {
		opacity: 0.3;
	}

	.streak-day-active {
		color: var(--success);
		cursor: pointer;
	}

	.streak-day-active:hover {
		background: var(--bg-hover);
	}

	.streak-day-gap {
		color: var(--text-dim);
	}

	.streak-day-today {
		border: 1px solid var(--accent);
		box-shadow: 0 0 4px var(--accent-border);
	}

	.day-diamond {
		position: relative;
		filter: drop-shadow(0 0 2px rgba(16, 185, 129, 0.3));
	}

	.day-diamond.has-multi {
		transform: translateX(-0.3em);
	}

	.day-diamond.has-multi::before,
	.day-diamond.has-multi::after {
		content: '◆';
		position: absolute;
		left: 0;
	}

	.day-diamond.has-multi::before {
		opacity: 0.7;
		transform: translateX(0.3em);
	}

	.day-diamond.has-multi::after {
		opacity: 0.4;
		transform: translateX(0.6em);
	}

	.day-number {
		font-size: 0.7em;
	}

	@media (max-width: 600px) {
		.streak-wrapper {
			position: static;
		}

		.streak-dropdown {
			position: absolute;
			top: calc(100% + 0.5rem);
			left: 0;
			right: 0;
			min-width: auto;
			width: auto;
		}

		.streak-dropdown::before {
			top: -1rem;
			height: 1rem;
		}
	}
</style>
