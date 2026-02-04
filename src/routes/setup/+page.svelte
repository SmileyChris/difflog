<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { profiles, getProfile } from '$lib/stores/profiles.svelte';
	import { updateProfile } from '$lib/stores/sync.svelte';
	import { createProfile } from '$lib/stores/operations.svelte';
	import { SiteFooter, ChipSelector, InputField } from '$lib/components';
	import { LANGUAGES, FRAMEWORKS, TOOLS, TOPICS, DEPTHS } from '$lib/utils/constants';
	import { validateAnthropicKey } from '$lib/utils/api';
	import { PROVIDERS, STEPS, type ProviderStep, type ProviderConfig } from '$lib/utils/providers';

	type ValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';

	interface ProviderState {
		key: string;
		status: ValidationStatus;
		masked: boolean;
	}

	let step = $state(0);
	let saving = $state(false);
	let setupError = $state('');
	let isEditing = $state(false);
	let hasExistingProfiles = $state(false);

	let data = $state({
		name: '',
		languages: [] as string[],
		frameworks: [] as string[],
		tools: [] as string[],
		topics: [] as string[],
		depth: 'standard',
		customFocus: ''
	});

	// Custom items for each category (not in predefined options)
	let customLanguages = $state<string[]>([]);
	let customFrameworks = $state<string[]>([]);
	let customTools = $state<string[]>([]);
	let customTopics = $state<string[]>([]);

	let providers = $state<Record<string, ProviderState>>(
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

	let selections = $state<{ search: string | null; curation: string | null; synthesis: string | null }>({
		search: null,
		curation: null,
		synthesis: null
	});

	const totalSteps = 7;

	onMount(() => {
		if (!browser) return;

		hasExistingProfiles = Object.keys(profiles.value).length > 0;

		const params = new URLSearchParams(window.location.search);
		const editStep = params.get('edit');
		const currentProfile = getProfile();

		if (editStep && currentProfile) {
			isEditing = true;
			step = parseInt(editStep);
			const p = currentProfile;
			data = {
				name: p.name,
				languages: [...(p.languages || [])],
				frameworks: [...(p.frameworks || [])],
				tools: [...(p.tools || [])],
				topics: [...(p.topics || [])],
				depth: p.depth || 'standard',
				customFocus: p.customFocus || ''
			};

			// Initialize custom items (items not in predefined options)
			customLanguages = (p.languages || []).filter((i: string) => !LANGUAGES.includes(i));
			customFrameworks = (p.frameworks || []).filter((i: string) => !FRAMEWORKS.includes(i));
			customTools = (p.tools || []).filter((i: string) => !TOOLS.includes(i));
			customTopics = (p.topics || []).filter((i: string) => !TOPICS.includes(i));

			// Load existing keys
			if (p.apiKey) {
				providers.anthropic.key = p.apiKey;
				providers.anthropic.status = 'valid';
			}
			if (p.apiKeys) {
				for (const [id, key] of Object.entries(p.apiKeys)) {
					if (key && providers[id]) {
						providers[id].key = key as string;
						providers[id].status = 'valid';
					}
				}
			}
			if (p.providerSelections) {
				selections = { ...selections, ...p.providerSelections };
			}
		}
	});

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

		if (!data.name.trim()) {
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
					...data,
					...keys,
					providerSelections: selections
				});
			} else {
				createProfile({
					...data,
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
					bind:value={data.name}
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
				bind:selected={data.languages}
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
				bind:selected={data.frameworks}
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
				bind:selected={data.tools}
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
				bind:selected={data.topics}
				bind:customItems={customTopics}
				placeholder="Add custom topic..."
			/>

			<InputField
				label="Custom focus (optional)"
				placeholder="Any specific things you'd like covered..."
				bind:value={data.customFocus}
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
							class:depth-card-selected={data.depth === depth.id}
							onclick={() => (data.depth = depth.id)}
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
