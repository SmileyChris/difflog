<script lang="ts">
	import { getStreak, getStreakCalendarData } from '$lib/stores/history.svelte';
	import type { CalendarMonth, CalendarDay } from '$lib/utils/streak';

	let isOpen = $state(false);
	let wrapperEl: HTMLElement;

	const streak = $derived(getStreak());
	const calendar = $derived(getStreakCalendarData());

	function toggle() {
		isOpen = !isOpen;
	}

	function close() {
		isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (wrapperEl && !wrapperEl.contains(target)) {
			close();
		}
	}

	function getDayClass(day: CalendarDay): string {
		const classes = ['streak-day'];
		if (day.isActive) classes.push('streak-day-active');
		if (day.isGap) classes.push('streak-day-gap');
		if (day.isToday) classes.push('streak-day-today');
		if (day.isOutside) classes.push('streak-day-outside');
		return classes.join(' ');
	}
</script>

<svelte:window onclick={handleClickOutside} />

{#if streak.streak > 0}
	<div class="streak-wrapper" bind:this={wrapperEl}>
		<button class="streak-badge" onclick={toggle} title="View streak calendar">
			<span class="streak-fire">&#128293;</span>
			<span class="streak-count">{streak.streak}</span>
			{#if streak.expiresInDays <= 2}
				<span class="streak-warning" title="Streak expires soon!">!</span>
			{/if}
		</button>

		{#if isOpen}
			<div class="streak-dropdown">
				<div class="streak-header">
					<span class="streak-fire-large">&#128293;</span>
					<div class="streak-info">
						<span class="streak-count-large">{streak.streak} diff streak</span>
						{#if streak.expiresInDays > 0}
							<span class="streak-expires">
								{streak.expiresInDays === 1 ? 'Expires tomorrow' : `Expires in ${streak.expiresInDays} days`}
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
											<span
												class={getDayClass(day)}
												title={day.diffCount > 0 ? `${day.diffCount} diff${day.diffCount > 1 ? 's' : ''}` : ''}
											>
												{day.label}
											</span>
										{/each}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
