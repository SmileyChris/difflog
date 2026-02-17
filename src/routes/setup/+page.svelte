<script lang="ts">
	import { goto } from "$app/navigation";
	import { updateProfile, getSyncState } from "$lib/stores/sync.svelte";
	import RemoveFromServerModal from "./RemoveFromServerModal.svelte";
	import { ShareProfileModal } from "../profiles/modals";
	import { createProfile } from "$lib/stores/operations.svelte";
	import { profiles, activeProfileId, getProfile } from "$lib/stores/profiles.svelte";
	import { getAnthropicKey } from "$lib/utils/sync";
	import { SiteFooter, ChipSelector, InputField } from "$lib/components";
	import {
		DEPTHS,
		LANGUAGES,
		FRAMEWORKS,
		TOOLS,
		TOPICS,
	} from "$lib/utils/constants";
	import {
		validateAnthropicKey,
		validateSerperKey,
		validatePerplexityKey,
		validateDeepSeekKey,
		validateGeminiKey,
	} from "$lib/utils/api";
	import {
		PROVIDERS,
		PROVIDER_LIST,
		STEPS,
		type ProviderStep,
	} from "$lib/utils/providers";
	import { estimateDiffCost } from "$lib/utils/pricing";

	let { data: pageData } = $props();

	const totalSteps = 7;

	type ValidationStatus = "idle" | "validating" | "valid" | "invalid";

	interface ProviderState {
		key: string;
		status: ValidationStatus;
		masked: boolean;
	}

	// Snapshot pageData for form initialization (intentional one-time read)
	const _init = (() => ({
		step: pageData.initialStep ?? 0,
		isEditing: pageData.isEditing ?? false,
		hasExistingProfiles: pageData.hasExistingProfiles ?? false,
		formData: pageData.initialData ?? {
			name: "",
			languages: [] as string[],
			frameworks: [] as string[],
			tools: [] as string[],
			topics: [] as string[],
			depth: "standard",
			customFocus: "",
		},
		customItems: pageData.customItems ?? {},
		providerStates:
			pageData.providerStates ??
			Object.fromEntries(
				Object.keys(PROVIDERS).map((id) => [
					id,
					{
						key: "",
						status: "idle" as ValidationStatus,
						masked: true,
					},
				]),
			),
		selections: pageData.selections ?? {
			search: null as string | null,
			curation: null as string | null,
			synthesis: null as string | null,
		},
	}))();

	const isEditing = _init.isEditing;
	const hasExistingProfiles = _init.hasExistingProfiles;

	let step = $state(_init.step);
	let saving = $state(false);
	let setupError = $state("");
	let removeModalOpen = $state(false);
	let shareModalOpen = $state(false);

	let formData = $state(_init.formData);

	// Custom items for each category (not in predefined options)
	let customLanguages = $state<string[]>(_init.customItems.languages ?? []);
	let customFrameworks = $state<string[]>(_init.customItems.frameworks ?? []);
	let customTools = $state<string[]>(_init.customItems.tools ?? []);
	let customTopics = $state<string[]>(_init.customItems.topics ?? []);

	let providers = $state<Record<string, ProviderState>>(_init.providerStates);

	let selections = $state<{
		search: string | null;
		curation: string | null;
		synthesis: string | null;
	}>(_init.selections);

	// Get existing keys from other profiles (excluding current profile if editing)
	function getExistingKeys(): Record<string, string> {
		const keys: Record<string, string> = {};
		const excludeId = isEditing ? activeProfileId.value : null;
		for (const [id, p] of Object.entries(profiles.value)) {
			if (excludeId && id === excludeId) continue;
			const anthKey = getAnthropicKey(p);
			if (anthKey && !keys.anthropic) keys.anthropic = anthKey;
			if (p.apiKeys) {
				for (const [providerId, key] of Object.entries(p.apiKeys)) {
					if (key && !keys[providerId]) keys[providerId] = key;
				}
			}
		}
		return keys;
	}

	const existingKeys = getExistingKeys();

	// Keys from other profiles not yet entered in this profile
	const missingKeys = $derived(
		Object.keys(existingKeys).filter(
			(id) => !providers[id]?.key || providers[id]?.status !== "valid",
		),
	);

	// Display names for missing keys
	const existingKeyNames = $derived(
		missingKeys.map((id) => PROVIDERS[id]?.name ?? id).join(", "),
	);

	// Whether to show the import prompt
	const hasExistingKeys = $derived(missingKeys.length > 0);

	// Import keys from other profiles (already validated, trust them)
	function importExistingKeys() {
		for (const [id, key] of Object.entries(existingKeys)) {
			if (!providers[id]?.key || providers[id]?.status !== "valid") {
				providers[id].key = key;
				providers[id].status = "valid";
			}
		}
		// Auto-select providers for steps
		for (const s of ["search", "curation", "synthesis"] as ProviderStep[]) {
			if (!selections[s]) {
				for (const [id, state] of Object.entries(providers)) {
					if (state.status === "valid" && hasCapability(id, s)) {
						selections[s] = id;
						break;
					}
				}
			}
		}
	}

	function hasCapability(providerId: string, capStep: ProviderStep): boolean {
		return PROVIDERS[providerId]?.capabilities.includes(capStep) ?? false;
	}

	const isProviderConfigComplete = $derived(
		selections.synthesis !== null &&
			providers[selections.synthesis!]?.status === "valid" &&
			selections.curation !== null &&
			providers[selections.curation!]?.status === "valid",
	);

	// Provider table state
	let showOtherProviders = $state(
		// Auto-expand if any non-anthropic provider has a valid key
		Object.entries(providers).some(
			([id, state]) => id !== "anthropic" && state.status === "valid",
		),
	);
	let editingProvider = $state<string | null>(null);
	let originalEditingKey = $state("");

	// Check if any other provider is validated (to keep table expanded)
	const hasValidOtherProvider = $derived(
		Object.entries(providers).some(
			([id, state]) => id !== "anthropic" && state.status === "valid",
		),
	);

	// Cost estimate
	const costEstimate = $derived(
		estimateDiffCost({
			search: selections.search as any,
			curation: selections.curation as any,
			synthesis: selections.synthesis as any,
		}),
	);

	function formatCost(cost: number): string {
		if (cost < 0.01) return `$${cost.toFixed(4)}`;
		return `$${cost.toFixed(2)}`;
	}

	function getCellState(
		providerId: string,
		capStep: ProviderStep,
	): "selected" | "available" | "unavailable" | "unsupported" {
		if (!hasCapability(providerId, capStep)) return "unsupported";
		if (selections[capStep] === providerId) return "selected";
		if (providers[providerId].status === "valid") return "available";
		return "unavailable";
	}

	function toggleSelection(providerId: string, capStep: ProviderStep) {
		if (!hasCapability(providerId, capStep)) return;
		if (providers[providerId].status !== "valid") return;

		if (selections[capStep] === providerId) {
			// Don't allow deselecting required steps
			if (capStep !== "synthesis" && capStep !== "curation") {
				selections[capStep] = null;
			}
		} else {
			selections[capStep] = providerId;
		}
	}

	function openKeyModal(providerId: string) {
		editingProvider = providerId;
		originalEditingKey = providers[providerId].key;
	}

	function closeKeyModal() {
		editingProvider = null;
		originalEditingKey = "";
	}

	function cancelKeyModal() {
		if (editingProvider) {
			providers[editingProvider].key = originalEditingKey;
			providers[editingProvider].status = originalEditingKey
				? "valid"
				: "idle";
		}
		closeKeyModal();
	}

	function toggleMask(providerId: string) {
		providers[providerId].masked = !providers[providerId].masked;
	}

	function clearProviderKey(providerId: string) {
		providers[providerId].key = "";
		providers[providerId].status = "idle";
		// Clear selections using this provider
		for (const s of ["search", "curation", "synthesis"] as ProviderStep[]) {
			if (selections[s] === providerId) {
				selections[s] = null;
			}
		}
	}

	const VALIDATORS: Record<string, (key: string) => Promise<boolean>> = {
		anthropic: validateAnthropicKey,
		serper: validateSerperKey,
		perplexity: validatePerplexityKey,
		deepseek: validateDeepSeekKey,
		gemini: validateGeminiKey,
	};

	function isValidKeyFormat(providerId: string, key: string): boolean {
		const trimmed = key.trim();
		if (trimmed.length < 10) return false;
		const prefix = PROVIDERS[providerId]?.keyPrefix;
		if (prefix && !trimmed.startsWith(prefix)) return false;
		return true;
	}

	async function validateProviderKey(providerId: string) {
		const state = providers[providerId];
		if (!state.key.trim()) {
			state.status = "idle";
			return;
		}

		state.status = "validating";
		const validator = VALIDATORS[providerId];

		try {
			const valid = await validator(state.key);
			state.status = valid ? "valid" : "invalid";

			if (valid) {
				// Auto-select for steps
				for (const s of [
					"search",
					"curation",
					"synthesis",
				] as ProviderStep[]) {
					if (!selections[s] && hasCapability(providerId, s)) {
						selections[s] = providerId;
					}
				}
			}
		} catch {
			state.status = "invalid";
		}
	}

	function nextStep() {
		if (step === 1 && !isProviderConfigComplete) {
			setupError = "Enter a valid API key to continue";
			return;
		}
		setupError = "";
		if (document.startViewTransition) {
			document.startViewTransition(() => step++);
		} else {
			step++;
		}
	}

	function prevStep() {
		if (step > 0) {
			if (document.startViewTransition) {
				document.startViewTransition(() => step--);
			} else {
				step--;
			}
		}
	}

	function cancelWizard() {
		goto(hasExistingProfiles ? "/profiles" : "/about");
	}

	const isSynced = $derived(isEditing && getSyncState() !== 'local');

	async function saveProfile() {
		setupError = "";

		if (!formData.name.trim()) {
			setupError = "Name is required";
			return;
		}

		if (!isProviderConfigComplete) {
			setupError = "Configure providers for curation and synthesis";
			return;
		}

		saving = true;
		try {
			const allKeys: Record<string, string> = {};

			for (const [id, state] of Object.entries(providers)) {
				if (state.status === "valid" && state.key) {
					allKeys[id] = state.key;
				}
			}

			const keys: { apiKeys?: Record<string, string> } = {};
			if (Object.keys(allKeys).length > 0) {
				keys.apiKeys = allKeys;
			}

			if (isEditing) {
				updateProfile({
					...formData,
					...keys,
					providerSelections: selections,
				});
			} else {
				createProfile({
					...formData,
					...keys,
					providerSelections: selections,
				});
			}
			goto("/");
		} catch (e: unknown) {
			setupError =
				e instanceof Error ? e.message : "Failed to save profile";
			saving = false;
		}
	}

	function createDemoProfile() {
		saving = true;
		try {
			createProfile({
				name: "Demo",
				apiKeys: { anthropic: "demo-key-placeholder" },
				providerSelections: {
					search: "anthropic",
					curation: "anthropic",
					synthesis: "anthropic",
				},
				languages: ["TypeScript", "Python", "Rust"],
				frameworks: ["React", "Node.js"],
				tools: ["Docker", "PostgreSQL"],
				topics: ["AI/ML & LLMs", "DevOps & Platform"],
				depth: "standard",
				customFocus: "",
			});
			goto("/");
		} catch (e: unknown) {
			setupError =
				e instanceof Error
					? e.message
					: "Failed to create demo profile";
			saving = false;
		}
	}
</script>

{#snippet eyeIcon(visible: boolean)}
	{#if visible}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	{:else}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
			/>
			<path
				d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
			/>
			<path d="M1 1l22 22" />
		</svg>
	{/if}
{/snippet}

<svelte:head>
	<title>diff·log - Setup</title>
</svelte:head>

<main class="narrow">
	<header>
		<div class="logo-mark">&#9670;</div>
		<h1 class="setup-title">
			diff<span class="setup-diamond">&#9670;</span>log
		</h1>
		<p class="setup-subtitle">
			{isEditing ? "Edit Profile" : "Configure Your Diff"}
		</p>
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

	<div
		class="setup-content"
		style:view-transition-name={editingProvider ? "none" : "setup-step"}
	>
		<!-- Step 0: Name -->
		{#if step === 0}
			<div>
				<h2 class="step-title">
					{#if formData.name.trim()}
						This is your "{formData.name.trim()}" profile
					{:else if isEditing || hasExistingProfiles}
						Name this profile
					{:else}
						Welcome
					{/if}
				</h2>
				<p class="step-desc">
					Configure your personalized diff. We'll scan the developer
					ecosystem and surface only what's changed since you last
					checked in.
				</p>
				{#if isEditing}
				<p class="step-desc-link sync-tag-row">
					{#if isSynced}
						<span class="sync-tag sync-tag-shared">synced</span>
						<button
							class="btn-link remove-link"
							onclick={() => (removeModalOpen = true)}
						>
							Remove from server
						</button>
					{:else}
						<span class="sync-tag sync-tag-local">local</span>
						<button
							class="btn-link upload-link"
							onclick={() => (shareModalOpen = true)}
						>
							Upload to server
						</button>
					{/if}
				</p>
			{:else}
				<p class="step-desc-link">
					<a
						href="/profiles"
						class="link-subtle"
						onclick={() =>
							sessionStorage.setItem("openImport", "1")}
						>Have an uploaded profile? Sign in here.</a
					>
				</p>
			{/if}

				<InputField
					label={hasExistingProfiles
						? "Name this profile"
						: "What should we call you?"}
					placeholder={hasExistingProfiles
						? "Profile name"
						: "Enter your name or handle"}
					bind:value={formData.name}
					onkeydown={(e) =>
						e.key === "Enter" && formData.name.trim() && nextStep()}
				/>

				{#if !hasExistingProfiles}
					<div class="demo-option">
						<p class="demo-text">Just want to explore?</p>
						<button class="btn-link" onclick={createDemoProfile}
							>Try demo mode</button
						>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Step 1: API Providers -->
		{#if step === 1}
			<div>
				<h2 class="step-title">Connect API Providers</h2>
				<p class="step-desc">
					Add your API key to generate diffs. You can optionally use
					multiple providers for different steps.
				</p>

				{#if hasExistingKeys}
					<div class="key-import-prompt">
						<div class="key-import-content">
							<span class="key-import-check">&#10003;</span>
							<div class="key-import-text">
								{#if missingKeys.length === 1}
									<span class="key-import-title"
										>You have the {existingKeyNames} key in another
										profile</span
									>
								{:else}
									<span class="key-import-title"
										>You have API keys in other profiles</span
									>
									<span class="key-import-providers"
										>{existingKeyNames}</span
									>
								{/if}
							</div>
						</div>
						<button
							class="btn-secondary btn-import"
							onclick={importExistingKeys}
						>
							{missingKeys.length === 1
								? "Use this key"
								: "Use these keys"}
						</button>
					</div>
				{/if}

				<!-- Provider table -->
				<table class="provider-table">
					<thead>
						<tr>
							<th class="provider-col">Provider</th>
							{#if hasValidOtherProvider || showOtherProviders}
								<th class="step-col">Search</th>
								<th class="step-col">Curation</th>
								<th class="step-col">Synthesis</th>
							{/if}
							<th class="key-col"></th>
						</tr>
					</thead>
					<tbody>
						<!-- Anthropic (always visible) -->
						<tr
							class:provider-row-active={providers.anthropic
								.status === "valid"}
						>
							<td class="provider-name">
								<span>Anthropic</span>
								{#if providers.anthropic.status === "valid"}
									<span class="provider-check">&#10003;</span>
								{/if}
							</td>
							{#if hasValidOtherProvider || showOtherProviders}
								{#each STEPS as s}
									<td
										class="step-cell"
										class:cell-selected={getCellState(
											"anthropic",
											s.id,
										) === "selected"}
										class:cell-available={getCellState(
											"anthropic",
											s.id,
										) === "available"}
										class:cell-unavailable={getCellState(
											"anthropic",
											s.id,
										) === "unavailable"}
										onclick={() =>
											toggleSelection("anthropic", s.id)}
									>
										{#if getCellState("anthropic", s.id) === "selected"}
											<span class="cell-icon"
												>&#9679;</span
											>
										{:else if getCellState("anthropic", s.id) === "available"}
											<span class="cell-icon"
												>&#9675;</span
											>
										{:else}
											<span
												class="cell-icon cell-icon-dim"
												>&#9675;</span
											>
										{/if}
									</td>
								{/each}
							{/if}
							<td class="key-cell">
								<button
									class="btn-key"
									class:btn-key-edit={providers.anthropic
										.status === "valid"}
									class:btn-key-add={providers.anthropic
										.status !== "valid"}
									onclick={() => openKeyModal("anthropic")}
								>
									{providers.anthropic.status === "valid"
										? "Edit"
										: "Add"}
								</button>
							</td>
						</tr>

						<!-- Other providers toggle -->
						{#if !hasValidOtherProvider}
							<tr
								class="provider-row-toggle"
								onclick={() =>
									(showOtherProviders = !showOtherProviders)}
							>
								<td
									colspan={showOtherProviders ? 5 : 2}
									class="provider-toggle-cell"
								>
									<span
										class="provider-toggle-arrow"
										class:provider-toggle-open={showOtherProviders}
										>&#9656;</span
									>
									<span>Other providers</span>
									{#if !showOtherProviders}
										<span class="provider-toggle-hint"
											>Serper, Perplexity, DeepSeek,
											Gemini</span
										>
									{/if}
								</td>
							</tr>
						{/if}

						<!-- Other providers -->
						{#each PROVIDER_LIST.filter((p) => p.id !== "anthropic") as provider}
							{#if showOtherProviders || hasValidOtherProvider}
								<tr
									class:provider-row-active={providers[
										provider.id
									].status === "valid"}
								>
									<td class="provider-name">
										<span>{provider.name}</span>
										{#if providers[provider.id].status === "valid"}
											<span class="provider-check"
												>&#10003;</span
											>
										{/if}
									</td>
									{#each STEPS as s}
										<td
											class="step-cell"
											class:cell-selected={getCellState(
												provider.id,
												s.id,
											) === "selected"}
											class:cell-available={getCellState(
												provider.id,
												s.id,
											) === "available"}
											class:cell-unavailable={getCellState(
												provider.id,
												s.id,
											) === "unavailable"}
											class:cell-unsupported={getCellState(
												provider.id,
												s.id,
											) === "unsupported"}
											onclick={() =>
												toggleSelection(
													provider.id,
													s.id,
												)}
										>
											{#if getCellState(provider.id, s.id) === "selected"}
												<span class="cell-icon"
													>&#9679;</span
												>
											{:else if getCellState(provider.id, s.id) === "available"}
												<span class="cell-icon"
													>&#9675;</span
												>
											{:else if getCellState(provider.id, s.id) === "unavailable"}
												<span
													class="cell-icon cell-icon-dim"
													>&#9675;</span
												>
											{:else}
												<span
													class="cell-icon cell-icon-none"
													>&mdash;</span
												>
											{/if}
										</td>
									{/each}
									<td class="key-cell">
										<button
											class="btn-key"
											class:btn-key-edit={providers[
												provider.id
											].status === "valid"}
											class:btn-key-add={providers[
												provider.id
											].status !== "valid"}
											onclick={() =>
												openKeyModal(provider.id)}
										>
											{providers[provider.id].status ===
											"valid"
												? "Edit"
												: "Add"}
										</button>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>

				{#if isProviderConfigComplete}
					<div class="cost-estimate">
						<span class="cost-label">Est. cost per diff:</span>
						<span class="cost-value"
							>{formatCost(costEstimate.min)} – {formatCost(
								costEstimate.max,
							)}</span
						>
					</div>
				{/if}

				{#if setupError}
					<div class="setup-error">{setupError}</div>
				{/if}

				<!-- Key edit modal -->
				{#if editingProvider}
					<div
						class="key-modal-overlay"
						onclick={(e) =>
							e.target === e.currentTarget && cancelKeyModal()}
					>
						<div class="key-modal">
							<div class="key-modal-header">
								<h3 class="key-modal-title">
									{PROVIDERS[editingProvider].name} API Key
								</h3>
								{#if providers[editingProvider].status === "valid"}
									<span class="key-modal-check">&#10003;</span
									>
								{/if}
							</div>
							<div class="key-modal-body">
								<div class="key-input-group">
									<input
										type={providers[editingProvider].masked
											? "password"
											: "text"}
										class="key-input"
										placeholder={PROVIDERS[editingProvider]
											.keyPlaceholder}
										bind:value={
											providers[editingProvider].key
										}
										oninput={() => {
											if (
												providers[editingProvider]
													.status === "valid" ||
												providers[editingProvider]
													.status === "invalid"
											)
												providers[
													editingProvider
												].status = "idle";
										}}
										onkeydown={(e) =>
											e.key === "Enter" &&
											(providers[editingProvider]
												.status === "valid"
												? closeKeyModal()
												: validateProviderKey(
														editingProvider,
													))}
									/>
									<button
										class="btn-mask"
										onclick={() =>
											toggleMask(editingProvider)}
										title={providers[editingProvider].masked
											? "Show key"
											: "Hide key"}
									>
										{@render eyeIcon(
											!providers[editingProvider].masked,
										)}
									</button>
								</div>
								{#if providers[editingProvider].status === "validating"}
									<div class="key-status">
										<span class="status-validating"
											>Validating...</span
										>
									</div>
								{:else if providers[editingProvider].status === "invalid"}
									<div class="key-status">
										<span class="status-invalid"
											>&#10007; Invalid key</span
										>
									</div>
								{/if}
							</div>
							<div class="key-modal-footer">
								{#if PROVIDERS[editingProvider].docsUrl}
									<a
										href={PROVIDERS[editingProvider]
											.docsUrl}
										target="_blank"
										rel="noopener"
										class="key-docs-link"
										>Get API key &#8599;</a
									>
								{:else}
									<span></span>
								{/if}
								<div class="key-modal-actions">
									<button
										class="btn-secondary"
										onclick={cancelKeyModal}>Cancel</button
									>
									{#if providers[editingProvider].status === "validating"}
										<button class="btn-primary" disabled
											>...</button
										>
									{:else if providers[editingProvider].status === "valid" && providers[editingProvider].key.trim()}
										<button
											class="btn-primary"
											onclick={closeKeyModal}>OK</button
										>
									{:else if originalEditingKey && !providers[editingProvider].key.trim()}
										<button
											class="btn-primary"
											onclick={() => {
												clearProviderKey(
													editingProvider,
												);
												closeKeyModal();
											}}>Remove</button
										>
									{:else}
										<button
											class="btn-primary"
											onclick={() =>
												validateProviderKey(
													editingProvider,
												)}
											disabled={!isValidKeyFormat(
												editingProvider,
												providers[editingProvider].key,
											)}>Verify</button
										>
									{/if}
								</div>
							</div>
						</div>
					</div>
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
							class:depth-card-selected={formData.depth ===
								depth.id}
							onclick={() => (formData.depth = depth.id)}
						>
							<span class="depth-icon">{depth.icon}</span>
							<span class="depth-label">{depth.label}</span>
							<span class="depth-desc">{depth.desc}</span>
						</button>
					{/each}
				</div>

				<div style="margin-top: 2em;">
					<InputField
						label="Any specific focus areas? (optional)"
						placeholder="e.g., 'AI coding assistants', 'Rust in production'"
						bind:value={formData.customFocus}
					/>
				</div>

				{#if setupError}
					<div class="setup-error">{setupError}</div>
				{/if}
			</div>
		{/if}
	</div>

	<div
		class="setup-footer"
		style:view-transition-name={editingProvider ? "none" : "setup-footer"}
	>
		{#if isEditing}
			<button class="btn-secondary" onclick={cancelWizard}>Cancel</button>
		{:else if step > 0}
			<button class="btn-secondary" onclick={prevStep}
				>&#8249; Back</button
			>
		{:else if step === 0 && !hasExistingProfiles}
			<a href="/about" class="btn-secondary">About</a>
		{:else}
			<button class="btn-secondary" onclick={cancelWizard}>Cancel</button>
		{/if}

		<div class="setup-footer-spacer"></div>

		{#if isEditing}
			<!-- Edit mode: Save button always visible + navigation -->
			<button
				class="btn-primary"
				onclick={saveProfile}
				disabled={saving ||
					!formData.name.trim() ||
					!isProviderConfigComplete}
			>
				{saving ? "Saving..." : "Save"}
			</button>
			<div class="step-nav-btns">
				<button
					class="btn-step-nav"
					onclick={prevStep}
					disabled={step === 0}>&#8249;</button
				>
				<button
					class="btn-step-nav"
					onclick={nextStep}
					disabled={step === totalSteps - 1}>&#8250;</button
				>
			</div>
		{:else}
			<!-- Create mode: Continue until last step, then Start -->
			{#if step < totalSteps - 1}
				<button
					class="btn-primary"
					onclick={nextStep}
					disabled={(step === 0 && !formData.name.trim()) ||
						(step === 1 && !isProviderConfigComplete) ||
						saving}
				>
					{saving ? "Creating..." : "Continue ›"}
				</button>
			{:else}
				<button
					class="btn-primary"
					onclick={saveProfile}
					disabled={saving}
				>
					{saving ? "Saving..." : "Start Diffing ◆"}
				</button>
			{/if}
		{/if}
	</div>
</main>

{#if isEditing && activeProfileId.value}
	{#if isSynced}
		<RemoveFromServerModal
			bind:open={removeModalOpen}
			onclose={() => (removeModalOpen = false)}
		/>
	{:else}
		<ShareProfileModal
			bind:open={shareModalOpen}
			profileId={activeProfileId.value}
			onclose={() => (shareModalOpen = false)}
		/>
	{/if}
{/if}

<SiteFooter />

<style>
	/* Wizard-specific styles */
	:global(main.narrow > header) {
		text-align: center;
		margin-bottom: 2rem;
		display: block;
		border-bottom: none;
		padding: 0;
	}

	.step-indicator {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.step-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--border-subtle);
		transition: all 0.3s ease;
	}

	.step-dot-active {
		background: var(--accent);
		box-shadow: 0 0 12px var(--accent-glow);
	}

	.step-dot-complete {
		background: var(--accent-glow);
	}

	.setup-content {
		background: linear-gradient(
			180deg,
			var(--bg-card) 0%,
			var(--bg-card-bottom) 100%
		);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		padding: 2rem;
		view-transition-name: setup-step;
	}

	:global(::view-transition-old(setup-step)),
	:global(::view-transition-new(setup-step)) {
		animation-duration: 0.25s;
		height: 100%;
		overflow: hidden;
	}

	:global(::view-transition-group(setup-step)) {
		animation-duration: 0.25s;
	}

	.step-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		color: var(--text-heading);
		view-transition-name: step-title;
	}

	.step-desc {
		font-size: 0.9rem;
		color: var(--text-subtle);
		margin-bottom: 1.5rem;
		line-height: 1.5;
		view-transition-name: step-desc;
	}

	:global(::view-transition-group(step-title)),
	:global(::view-transition-group(step-desc)) {
		animation-duration: 0.2s;
	}

	.setup-footer {
		display: flex;
		align-items: center;
		margin-top: 1.5rem;
		gap: 1rem;
		view-transition-name: setup-footer;
	}

	:global(::view-transition-group(setup-footer)) {
		animation-duration: 0.2s;
	}

	.setup-footer-spacer {
		flex: 1;
	}

	.step-nav-btns {
		display: flex;
		gap: 0.25rem;
	}

	.btn-step-nav {
		padding: 0 1rem;
		height: calc(0.9rem + 1.75rem);
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-md);
		color: var(--accent);
		font-size: 1.5rem;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-step-nav:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--accent-bg);
	}

	.btn-step-nav:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.demo-option {
		text-align: center;
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.demo-text {
		color: var(--text-hint);
		font-size: 0.85rem;
		margin-bottom: 0.5rem;
	}

	.setup-error {
		color: var(--danger);
		font-size: 0.85rem;
		margin-top: 1rem;
	}

	.key-import-prompt {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
		margin-bottom: 1.5rem;
		background: var(--success-bg, rgba(34, 197, 94, 0.1));
		border: 1px solid var(--success-border, rgba(34, 197, 94, 0.3));
		border-radius: var(--radius);
	}

	.key-import-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.key-import-check {
		color: var(--success);
		font-size: 1rem;
	}

	.key-import-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.key-import-title {
		font-weight: 500;
		color: var(--text-primary);
		font-size: 0.9rem;
	}

	.key-import-providers {
		color: var(--text-subtle);
		font-size: 0.85rem;
	}

	.btn-import {
		flex-shrink: 0;
	}

	.step-desc-link {
		margin-top: 0.5rem;
	}

	.sync-tag-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sync-tag {
		font-size: 0.65rem;
		font-weight: 500;
		padding: 0.15rem 0.4rem;
		border-radius: var(--radius-sm);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.sync-tag-local {
		color: var(--text-subtle);
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid var(--border-subtle);
	}

	.sync-tag-shared {
		color: var(--text-subtle);
		background: var(--info-bg);
		border: 1px solid var(--info-border);
	}

	.remove-link {
		color: var(--danger);
		opacity: 0.7;
	}

	.remove-link:hover {
		color: var(--danger);
		opacity: 1;
	}

	.upload-link {
		color: var(--text-subtle);
		opacity: 0.7;
	}

	.upload-link:hover {
		color: var(--accent);
		opacity: 1;
	}

	/* Cost Estimate */
	.cost-estimate {
		margin-top: 1.5rem;
		padding: 1rem;
		background: var(--accent-bg);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.cost-label {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.cost-value {
		color: var(--accent);
		font-weight: 600;
		font-family: var(--font-mono);
	}

	/* Provider Table */
	.provider-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.provider-table th {
		text-align: left;
		padding: 0.75rem 0.5rem;
		color: var(--text-subtle);
		font-weight: 500;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--border);
	}

	.provider-table td {
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid var(--border-subtle);
	}

	.provider-col {
		width: 35%;
	}

	.step-col {
		width: 15%;
		text-align: center !important;
	}

	.key-col {
		width: 20%;
		text-align: right !important;
	}

	.provider-name {
		font-weight: 500;
		color: var(--text-secondary);
	}

	.provider-row-active .provider-name {
		color: var(--text-primary);
	}

	.provider-check {
		color: var(--success);
		font-size: 0.85rem;
		margin-left: 0.5rem;
	}

	.step-cell {
		text-align: center;
		cursor: default;
		user-select: none;
	}

	.step-cell.cell-available,
	.step-cell.cell-selected {
		cursor: pointer;
	}

	.step-cell.cell-available:hover {
		background: var(--bg-card-hover);
	}

	.cell-icon {
		font-size: 1.1rem;
		line-height: 1;
	}

	.cell-selected .cell-icon {
		color: var(--accent);
	}

	.cell-available .cell-icon {
		color: var(--text-subtle);
	}

	.cell-unavailable .cell-icon {
		color: var(--text-disabled);
		opacity: 0.5;
	}

	.cell-icon-dim {
		color: var(--text-disabled);
		opacity: 0.5;
	}

	.cell-icon-none {
		color: var(--text-disabled);
		opacity: 0.3;
	}

	.key-cell {
		text-align: right;
	}

	.btn-key {
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		border-radius: var(--radius);
		cursor: pointer;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.btn-key-add {
		background: transparent;
		border: 1px dashed var(--border-mid);
		color: var(--text-subtle);
	}

	.btn-key-add:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.btn-key-edit {
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
	}

	.btn-key-edit:hover {
		border-color: var(--text-muted);
		color: var(--text-primary);
	}

	/* Provider toggle row */
	.provider-row-toggle {
		cursor: pointer;
		user-select: none;
	}

	.provider-row-toggle:hover {
		background: var(--bg-card-hover);
	}

	.provider-toggle-cell {
		padding: 0.6rem 0.5rem !important;
		color: var(--text-subtle);
		font-size: 0.8rem;
	}

	.provider-toggle-arrow {
		display: inline-block;
		transition: transform 0.15s;
		margin-right: 0.5rem;
	}

	.provider-toggle-open {
		transform: rotate(90deg);
	}

	.provider-toggle-hint {
		color: var(--text-disabled);
		margin-left: 0.5rem;
	}

	/* Key Modal */
	.key-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		backdrop-filter: blur(2px);
	}

	.key-modal {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 400px;
		margin: 1rem;
		display: flex;
		flex-direction: column;
	}

	.key-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border-subtle);
	}

	.key-modal-check {
		color: var(--accent);
		font-size: 1.1rem;
	}

	.key-modal-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.key-modal-body {
		padding: 1.25rem;
	}

	.key-modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border-subtle);
	}

	.key-modal-actions {
		display: flex;
		gap: 0.5rem;
	}

	.key-input-group {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.key-input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		background: var(--bg-input);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.9rem;
	}

	.key-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.btn-mask {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		color: var(--text-subtle);
	}

	.btn-mask:hover {
		border-color: var(--text-subtle);
		color: var(--text-primary);
	}

	.btn-mask svg {
		display: block;
	}

	.key-status {
		min-height: 1.5rem;
		font-size: 0.85rem;
		margin-bottom: 1rem;
	}

	.status-validating {
		color: var(--text-subtle);
	}

	.status-invalid {
		color: var(--danger);
	}

	.key-docs-link {
		color: var(--text-subtle);
		font-size: 0.85rem;
		text-decoration: none;
	}

	.key-docs-link:hover {
		color: var(--accent);
	}

	@media (max-width: 540px) {
		.provider-col {
			width: auto;
			vertical-align: bottom;
		}

		.step-col {
			width: auto;
			padding: 0.5rem 0.25rem !important;
			font-size: 0.65rem !important;
			writing-mode: vertical-lr;
			text-orientation: mixed;
			text-align: right !important;
			white-space: nowrap;
			vertical-align: middle;
		}

		.step-cell {
			padding: 0.5rem 0.25rem;
		}
	}

	.setup-title {
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: 0.15em;
		margin: 0;
		color: var(--text-heading);
	}

	.setup-diamond {
		font-size: 0.4em;
		vertical-align: 0.3em;
		margin: 0 0.05em;
		opacity: 0.7;
	}

	.setup-subtitle {
		font-size: 0.8rem;
		color: var(--text-hint);
		letter-spacing: 0.1em;
		margin-top: 0.25rem;
	}

	.depth-options {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.depth-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--bg-chip);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
	}

	.depth-card:hover {
		border-color: var(--text-disabled);
	}

	.depth-card-selected {
		background: var(--accent-bg);
		border-color: var(--accent);
	}

	.depth-icon {
		font-size: 1.5rem;
	}

	.depth-label {
		font-weight: 600;
		color: var(--text-heading);
		min-width: 120px;
	}

	.depth-desc {
		font-size: 0.85rem;
		color: var(--text-hint);
	}
</style>
