<script lang="ts">
	import { goto } from '$app/navigation';
	import { updateProfile } from '$lib/stores/sync.svelte';
	import { createProfile } from '$lib/stores/operations.svelte';
	import { SiteFooter, ChipSelector, InputField } from '$lib/components';
	import { DEPTHS } from '$lib/utils/constants';
	import { validateAnthropicKey } from '$lib/utils/api';
	import { PROVIDERS, type ProviderStep } from '$lib/utils/providers';

	let { data: pageData } = $props();

	const totalSteps = 7;

	type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

	interface ProviderState {
		key: string;
		status: ValidationStatus;
		masked: boolean;
	}

	// Initialize state from load function data
	let step = $state(pageData.initialStep ?? 0);
	let saving = $state(false);
	let setupError = $state('');
	const isEditing = pageData.isEditing ?? false;
	const hasExistingProfiles = pageData.hasExistingProfiles ?? false;

	let formData = $state(
		pageData.initialData ?? {
			name: '',
			languages: [] as string[],
			frameworks: [] as string[],
			tools: [] as string[],
			topics: [] as string[],
			depth: 'standard',
			customFocus: ''
		}
	);

	// Custom items for each category (not in predefined options)
	let customLanguages = $state<string[]>(pageData.customItems?.languages ?? []);
	let customFrameworks = $state<string[]>(pageData.customItems?.frameworks ?? []);
	let customTools = $state<string[]>(pageData.customItems?.tools ?? []);
	let customTopics = $state<string[]>(pageData.customItems?.topics ?? []);

	let providers = $state<Record<string, ProviderState>>(
		pageData.providerStates ??
			Object.fromEntries(
				Object.keys(PROVIDERS).map((id) => [
					id,
					{
						key: '',
						status: 'idle' as ValidationStatus,
						masked: true
					}
				])
			)
	);

	let selections = $state<{ search: string | null; curation: string | null; synthesis: string | null }>(
		pageData.selections ?? {
			search: null,
			curation: null,
			synthesis: null
		}
	);

	function hasCapability(providerId: string, capStep: ProviderStep): boolean {
		return PROVIDERS[providerId]?.capabilities.includes(capStep) ?? false;
	}

	function toInputStatus(status: ValidationStatus): 'valid' | 'invalid' | 'checking' | null {
		if (status === 'valid') return 'valid';
		if (status === 'invalid') return 'invalid';
		if (status === 'validating') return 'checking';
		return null;
	}

	const isProviderConfigComplete = $derived(
		selections.synthesis !== null && providers[selections.synthesis!]?.status === 'valid'
	);

	async function validateProviderKey(providerId: string) {
		const state = providers[providerId];
		if (!state.key.trim()) {
			state.status = 'idle';
			return;
		}

		state.status = 'validating';

		try {
			const valid = await validateAnthropicKey(state.key);
			state.status = valid ? 'valid' : 'invalid';

			if (valid) {
				// Auto-select for steps
				for (const s of ['search', 'curation', 'synthesis'] as ProviderStep[]) {
					if (!selections[s] && hasCapability(providerId, s)) {
						selections[s] = providerId;
					}
				}
			}
		} catch {
			state.status = 'invalid';
		}
	}

	function nextStep() {
		if (step === 1 && !isProviderConfigComplete) {
			setupError = 'Enter a valid API key to continue';
			return;
		}
		setupError = '';
		step++;
	}

	function prevStep() {
		if (step > 0) step--;
	}

	function cancelWizard() {
		goto(hasExistingProfiles ? '/profiles' : '/about');
	}

	async function saveProfile() {
		setupError = '';

		if (!formData.name.trim()) {
			setupError = 'Name is required';
			return;
		}

		if (!isProviderConfigComplete) {
			setupError = 'Configure at least one provider';
			return;
		}

		saving = true;
		try {
			const keys: { apiKey?: string; apiKeys?: Record<string, string> } = {};
			const otherKeys: Record<string, string> = {};

			for (const [id, state] of Object.entries(providers)) {
				if (state.status === 'valid' && state.key) {
					if (id === 'anthropic') {
						keys.apiKey = state.key;
					} else {
						otherKeys[id] = state.key;
					}
				}
			}

			if (Object.keys(otherKeys).length > 0) {
				keys.apiKeys = otherKeys;
			}

			if (isEditing) {
				updateProfile({
					...formData,
					...keys,
					providerSelections: selections
				});
			} else {
				createProfile({
					...formData,
					...keys,
					providerSelections: selections
				});
			}
			goto('/');
		} catch (e: unknown) {
			setupError = e instanceof Error ? e.message : 'Failed to save profile';
			saving = false;
		}
	}

	function createDemoProfile() {
		saving = true;
		try {
			createProfile({
				name: 'Demo',
				apiKey: 'demo-key-placeholder',
				languages: ['TypeScript', 'Python', 'Rust'],
				frameworks: ['React', 'Node.js'],
				tools: ['Docker', 'PostgreSQL'],
				topics: ['AI/ML & LLMs', 'DevOps & Platform'],
				depth: 'standard',
				customFocus: ''
			});
			goto('/');
		} catch (e: unknown) {
			setupError = e instanceof Error ? e.message : 'Failed to create demo profile';
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>diff·log - Setup</title>
</svelte:head>

<main class="narrow">
	<header>
		<div class="logo-mark">&#9670;</div>
		<h1 class="setup-title">diff<span class="setup-diamond">&#9670;</span>log</h1>
		<p class="setup-subtitle">{isEditing ? 'EDIT PROFILE' : 'NEW PROFILE'}</p>
		<div class="step-indicator">
			{#each Array(totalSteps) as _, i}
				<div
					class="step-dot"
					class:step-dot-active={i === step}
					class:step-dot-complete={i < step}
				></div>
			{/each}
		</div>
	</header>

	<div class="setup-content">
		<!-- Step 0: Name -->
		{#if step === 0}
			<div>
				<h2 class="step-title">What should we call you?</h2>
				<p class="step-desc">This name appears in your diffs and helps personalize the experience.</p>

				<InputField
					label="Your name"
					placeholder="e.g., Alex"
					bind:value={formData.name}
					onkeydown={(e) => e.key === 'Enter' && nextStep()}
				/>

				{#if !hasExistingProfiles}
					<div class="demo-option">
						<p class="demo-text">Just want to explore?</p>
						<button class="btn-link" onclick={createDemoProfile}>Try demo mode</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Step 1: API Key -->
		{#if step === 1}
			<div>
				<h2 class="step-title">Connect your API</h2>
				<p class="step-desc">diff·log needs an Anthropic API key to generate personalized diffs.</p>

				<InputField
					label="Anthropic API Key"
					type={providers.anthropic.masked ? 'password' : 'text'}
					placeholder="sk-ant-..."
					bind:value={providers.anthropic.key}
					status={toInputStatus(providers.anthropic.status)}
					onblur={() => validateProviderKey('anthropic')}
					onkeydown={(e) => e.key === 'Enter' && validateProviderKey('anthropic')}
				/>

				<p class="step-hint">
					Get your key at <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>
				</p>

				{#if setupError}
					<div class="setup-error">{setupError}</div>
				{/if}
			</div>
		{/if}

		<!-- Step 2: Languages -->
		{#if step === 2}
			<ChipSelector
				title="Languages you work with"
				description="Select programming languages to track updates, releases, and discussions."
				options={LANGUAGES}
				bind:selected={formData.languages}
				bind:customItems={customLanguages}
				placeholder="Add custom language..."
			/>
		{/if}

		<!-- Step 3: Frameworks -->
		{#if step === 3}
			<ChipSelector
				title="Frameworks & runtimes"
				description="Track framework releases, breaking changes, and ecosystem news."
				options={FRAMEWORKS}
				bind:selected={formData.frameworks}
				bind:customItems={customFrameworks}
				placeholder="Add custom framework..."
			/>
		{/if}

		<!-- Step 4: Tools -->
		{#if step === 4}
			<ChipSelector
				title="Tools & platforms"
				description="Stay updated on infrastructure and development tools."
				options={TOOLS}
				bind:selected={formData.tools}
				bind:customItems={customTools}
				placeholder="Add custom tool..."
			/>
		{/if}

		<!-- Step 5: Topics -->
		{#if step === 5}
			<ChipSelector
				title="Topics of interest"
				description="Choose broader topics to include in your diff coverage."
				options={TOPICS}
				bind:selected={formData.topics}
				bind:customItems={customTopics}
				placeholder="Add custom topic..."
			/>

			<InputField
				label="Custom focus (optional)"
				placeholder="Any specific things you'd like covered..."
				bind:value={formData.customFocus}
				rows={2}
			/>
		{/if}

		<!-- Step 6: Depth -->
		{#if step === 6}
			<div>
				<h2 class="step-title">Diff depth</h2>
				<p class="step-desc">How detailed should your diffs be?</p>

				<div class="depth-options">
					{#each DEPTHS as depth}
						<button
							class="depth-card"
							class:depth-card-selected={formData.depth === depth.id}
							onclick={() => (formData.depth = depth.id)}
						>
							<span class="depth-icon">{depth.icon}</span>
							<span class="depth-label">{depth.label}</span>
							<span class="depth-desc">{depth.desc}</span>
						</button>
					{/each}
				</div>

				{#if setupError}
					<div class="setup-error">{setupError}</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="setup-footer">
		<button class="btn-secondary" onclick={cancelWizard}>
			{isEditing ? 'Cancel' : 'Cancel'}
		</button>

		<div class="setup-footer-spacer"></div>

		<div class="step-nav-btns">
			<button class="btn-step-nav" onclick={prevStep} disabled={step === 0}>&larr;</button>
			{#if step < totalSteps - 1}
				<button class="btn-step-nav" onclick={nextStep}>&rarr;</button>
			{/if}
		</div>

		{#if step === totalSteps - 1}
			<button class="btn-primary" onclick={saveProfile} disabled={saving}>
				{saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Profile'}
			</button>
		{/if}
	</div>
</main>

<SiteFooter version="2.0.4" />

<style>
	.demo-option {
		margin-top: 2rem;
		text-align: center;
	}

	.demo-text {
		color: var(--text-hint);
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.step-hint {
		font-size: 0.85rem;
		color: var(--text-hint);
		margin-top: 0.5rem;
	}

	.step-hint a {
		color: var(--accent);
	}

	.setup-error {
		color: var(--danger);
		font-size: 0.85rem;
		margin-top: 1rem;
	}
</style>
