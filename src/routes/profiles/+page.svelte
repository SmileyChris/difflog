<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { profiles, activeProfileId, type Profile } from '$lib/stores/profiles.svelte';
	import { histories } from '$lib/stores/history.svelte';
	import { bookmarks } from '$lib/stores/stars.svelte';
	import {
		switchProfileWithSync,
		deleteProfileWithSync,
		importProfile as importProfileApi,
		shareProfile as shareProfileApi,
		rememberPassword,
		hasRememberedPasswordFor,
		checkSyncStatus,
		updatePasswordSync
	} from '$lib/stores/sync.svelte';
	import { SyncDropdown, SiteFooter, PageHeader, ModalDialog, InputField } from '$lib/components';

	// Import modal state
	let showImport = $state(false);
	let importProfileId = $state('');
	let importPassword = $state('');
	let importRemember = $state(true);
	let importError = $state('');
	let importing = $state(false);

	// Share modal state
	let showShare = $state(false);
	let shareProfileId = $state('');
	let sharePassword = $state('');
	let sharePasswordConfirm = $state('');
	let shareRemember = $state(true);
	let shareError = $state('');
	let sharing = $state(false);

	// Share info modal state
	let showInfo = $state(false);
	let infoProfileId = $state('');
	let qrDataUrl = $state('');
	let copied = $state(false);

	// Password update modal state
	let showPasswordUpdate = $state(false);
	let passwordUpdateProfileId = $state('');
	let currentPassword = $state('');
	let newPassword = $state('');
	let newPasswordConfirm = $state('');
	let passwordUpdateError = $state('');
	let passwordUpdating = $state(false);
	let passwordUpdateSuccess = $state(false);

	// Dialog refs
	let importDialog: { open: () => void; close: () => void };
	let shareDialog: { open: () => void; close: () => void };
	let infoDialog: { open: () => void; close: () => void };
	let passwordDialog: { open: () => void; close: () => void };

	onMount(() => {
		if (sessionStorage.getItem('openImport')) {
			sessionStorage.removeItem('openImport');
			showImport = true;
		}
	});

	$effect(() => {
		if (showImport && importDialog) importDialog.open();
		else if (importDialog) importDialog.close();
	});

	$effect(() => {
		if (showShare && shareDialog) shareDialog.open();
		else if (shareDialog) shareDialog.close();
	});

	$effect(() => {
		if (showInfo && infoDialog) infoDialog.open();
		else if (infoDialog) infoDialog.close();
	});

	$effect(() => {
		if (showPasswordUpdate && passwordDialog) passwordDialog.open();
		else if (passwordDialog) passwordDialog.close();
	});

	function handleSwitchProfile(id: string) {
		switchProfileWithSync(id);
		goto('/');
	}

	function handleDeleteProfile(id: string) {
		const profile = profiles.value[id];
		if (confirm(`Delete "${profile?.name || 'this profile'}"? This cannot be undone.`)) {
			deleteProfileWithSync(id);
		}
	}

	async function handleImportProfile() {
		const id = importProfileId.trim();
		if (!id || !importPassword) return;

		importError = '';

		if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
			importError = 'Invalid profile ID format';
			return;
		}

		importing = true;
		try {
			await importProfileApi(id, importPassword);
			if (importRemember) {
				rememberPassword(importPassword);
			}
			goto('/');
		} catch (e: unknown) {
			importError = e instanceof Error ? e.message : 'Failed to import profile';
		} finally {
			importing = false;
		}
	}

	function startShare(id: string) {
		shareProfileId = id;
		sharePassword = '';
		sharePasswordConfirm = '';
		shareError = '';
		showShare = true;
	}

	async function doShareProfile() {
		if (!sharePassword || sharePassword !== sharePasswordConfirm) return;

		shareError = '';
		sharing = true;

		try {
			switchProfileWithSync(shareProfileId);
			await shareProfileApi(sharePassword);
			const profile = profiles.value[shareProfileId];
			profiles.value = {
				...profiles.value,
				[shareProfileId]: { ...profile, syncedAt: new Date().toISOString() }
			};
			if (shareRemember) {
				rememberPassword(sharePassword);
			}
			showShare = false;
			checkSyncStatus();
		} catch (e: unknown) {
			shareError = e instanceof Error ? e.message : 'Failed to share profile';
		} finally {
			sharing = false;
		}
	}

	async function showShareInfo(id: string) {
		infoProfileId = id;
		copied = false;
		qrDataUrl = '';
		showInfo = true;

		try {
			if (!(window as any).qrcode) {
				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script');
					script.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
					script.onload = () => resolve();
					script.onerror = () => reject();
					document.head.appendChild(script);
				});
			}
			const qr = (window as any).qrcode(0, 'M');
			qr.addData(id);
			qr.make();
			qrDataUrl = qr.createDataURL(6, 4);
		} catch {
			// QR generation failed
		}
	}

	async function copyId() {
		try {
			await navigator.clipboard.writeText(infoProfileId);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback
		}
	}

	function startPasswordUpdate(id: string) {
		passwordUpdateProfileId = id;
		currentPassword = '';
		newPassword = '';
		newPasswordConfirm = '';
		passwordUpdateError = '';
		passwordUpdateSuccess = false;
		showPasswordUpdate = true;
	}

	async function doPasswordUpdate() {
		if (!currentPassword || !newPassword) return;
		if (newPassword !== newPasswordConfirm) {
			passwordUpdateError = 'Passwords do not match';
			return;
		}
		if (newPassword.length < 8) {
			passwordUpdateError = 'Password must be at least 8 characters';
			return;
		}

		passwordUpdateError = '';
		passwordUpdating = true;

		try {
			if (passwordUpdateProfileId !== activeProfileId.value) {
				switchProfileWithSync(passwordUpdateProfileId);
			}

			await updatePasswordSync(currentPassword, newPassword);
			passwordUpdateSuccess = true;

			setTimeout(() => {
				if (passwordUpdateSuccess) {
					showPasswordUpdate = false;
					passwordUpdateSuccess = false;
				}
			}, 2000);
		} catch (e: unknown) {
			passwordUpdateError = e instanceof Error ? e.message : 'Failed to update password';
		} finally {
			passwordUpdating = false;
		}
	}

	function formatSyncDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function getDiffCount(id: string): number {
		return (histories.value[id] || []).length;
	}

	function getStarCount(id: string): number {
		return (bookmarks.value[id] || []).length;
	}

	function handleImportClose() {
		showImport = false;
		importError = '';
	}

	function handleShareClose() {
		showShare = false;
		shareError = '';
	}

	function handleInfoClose() {
		showInfo = false;
	}

	function handlePasswordClose() {
		showPasswordUpdate = false;
		passwordUpdateError = '';
		passwordUpdateSuccess = false;
	}
</script>

<svelte:head>
	<title>diff·log - Profiles</title>
</svelte:head>

<main id="content">
	<PageHeader pageTitle="profiles" subtitle="Manage your profiles" icon="user" />

	{#if Object.keys(profiles.value).length > 0}
		<div class="profiles-section">
			<h2 class="profiles-section-title">Your Profiles</h2>
			{#if Object.keys(profiles.value).length > 1}
				<p class="profiles-section-desc">Click to switch</p>
			{/if}

			<div class="profiles-list">
				{#each Object.entries(profiles.value) as [id, profile] (id)}
					<div class="profile-card-full" class:profile-card-full-active={id === activeProfileId.value}>
						<div class="profile-card-full-header" onclick={() => handleSwitchProfile(id)}>
							<div class="profile-card-icon">
								<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
									<circle cx="12" cy="11" r="4" />
									<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
								</svg>
							</div>
							<div class="profile-card-full-title">
								<div class="profile-card-name">
									<span>{profile.name}</span>
									{#if profile.syncedAt}
										<span class="profile-status profile-status-shared">synced {formatSyncDate(profile.syncedAt)}</span>
										<button class="profile-status-share" onclick={(e) => { e.stopPropagation(); showShareInfo(id); }}>&#8599; share</button>
									{:else if profile.syncedAt === null}
										<span class="profile-status profile-status-warning" title="Profile not found on server">not on server</span>
									{:else}
										<span class="profile-status profile-status-local">local</span>
									{/if}
									{#if !profile.syncedAt}
										<button class="profile-status-share" onclick={(e) => { e.stopPropagation(); startShare(id); }}>&#8599; upload</button>
									{/if}
								</div>
								<div class="profile-card-id">
									<span>{id.slice(0, 8)}</span>
									{#if id === activeProfileId.value}
										<SyncDropdown />
									{:else if profile.syncedAt}
										<span class="sync-status-static" title={hasRememberedPasswordFor(id) ? 'Synced' : 'Password required'}>
											<span class="sync-status-cloud">&#9729;</span>
											{#if !hasRememberedPasswordFor(id)}
												<span class="sync-status-indicator sync-status-pending">&#9670;</span>
											{/if}
										</span>
									{/if}
								</div>
							</div>
							<div class="profile-card-full-actions">
								<a
									class="profile-card-edit"
									href="/setup?edit=0"
									onclick={(e) => { e.stopPropagation(); switchProfileWithSync(id); }}
									title="Edit profile"
								>&#9998;</a>
								{#if profile.syncedAt}
									<button
										class="profile-card-password"
										onclick={(e) => { e.stopPropagation(); startPasswordUpdate(id); }}
										title="Change password"
									>***</button>
								{/if}
								<button
									class="profile-card-remove"
									onclick={(e) => { e.stopPropagation(); handleDeleteProfile(id); }}
									title="Delete profile"
								>&times;</button>
							</div>
						</div>
						<div class="profile-card-full-details" onclick={() => handleSwitchProfile(id)}>
							{#if profile.languages?.length}
								<div class="profile-detail-row">
									<span class="profile-detail-label">Languages</span>
									<span class="profile-detail-value">{profile.languages.join(', ')}</span>
								</div>
							{/if}
							{#if profile.frameworks?.length}
								<div class="profile-detail-row">
									<span class="profile-detail-label">Frameworks</span>
									<span class="profile-detail-value">{profile.frameworks.join(', ')}</span>
								</div>
							{/if}
							{#if profile.tools?.length}
								<div class="profile-detail-row">
									<span class="profile-detail-label">Tools</span>
									<span class="profile-detail-value">{profile.tools.join(', ')}</span>
								</div>
							{/if}
							{#if profile.topics?.length}
								<div class="profile-detail-row">
									<span class="profile-detail-label">Topics</span>
									<span class="profile-detail-value">{profile.topics.join(', ')}</span>
								</div>
							{/if}
							<div class="profile-detail-row profile-detail-counts">
								<a href="/archive" class="profile-count profile-count-link" onclick={(e) => { e.stopPropagation(); if (activeProfileId.value !== id) switchProfileWithSync(id); }}>
									<span class="profile-count-icon">&#9632;</span>
									<span class="link-secondary">{getDiffCount(id)} {getDiffCount(id) === 1 ? 'diff' : 'diffs'}</span>
								</a>
								{#if getStarCount(id) > 0}
									<span class="profile-count profile-count-stars">
										<span class="profile-count-icon">★</span>
										<span>{getStarCount(id)} {getStarCount(id) === 1 ? 'star' : 'stars'}</span>
									</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Action Cards -->
	<div class="profiles-actions">
		<a href="/setup" class="profile-card profile-card-action">
			<div class="profile-card-action-icon">+</div>
			<div class="profile-card-name">Create New</div>
			<div class="profile-card-id">Configure your personalized diff</div>
		</a>

		<button class="profile-card profile-card-action profile-card-action-alt" onclick={() => (showImport = true)}>
			<div class="profile-card-action-icon">&#8595;</div>
			<div class="profile-card-name">Import Existing</div>
			<div class="profile-card-id">Add from another device</div>
		</button>
	</div>

	<!-- Import Modal -->
	<ModalDialog
		bind:this={importDialog}
		title="Import Shared Profile"
		subtitle="Sync a profile that's been uploaded to the server from another device."
		error={importError}
		size="sm"
		dark={true}
		onclose={handleImportClose}
	>
		<InputField
			label="Profile ID"
			placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
			bind:value={importProfileId}
		/>

		<InputField
			label="Password"
			type="password"
			placeholder="Enter the share password"
			bind:value={importPassword}
			onkeydown={(e) => e.key === 'Enter' && handleImportProfile()}
		/>

		<label class="remember-password">
			<input type="checkbox" bind:checked={importRemember} />
			<span>Remember password</span>
		</label>

		{#snippet footer()}
			<button class="btn-secondary" onclick={() => (showImport = false)}>Cancel</button>
			<button
				class="btn-primary"
				onclick={handleImportProfile}
				disabled={!importProfileId.trim() || !importPassword || importing}
			>
				{importing ? 'Importing...' : 'Import'}
			</button>
		{/snippet}
	</ModalDialog>

	<!-- Share Modal -->
	<ModalDialog
		bind:this={shareDialog}
		title="Upload Profile"
		subtitle="Your profile data and API key will be encrypted with your password, then uploaded securely."
		error={shareError}
		size="sm"
		dark={true}
		onclose={handleShareClose}
	>
		<div class="prof-info">
			<div class="prof-info-item">
				<span class="prof-info-icon">&#128274;</span>
				<span>Password encrypts your API key locally</span>
			</div>
			<div class="prof-info-item">
				<span class="prof-info-icon">&#9729;</span>
				<span>Encrypted data stored on server</span>
			</div>
			<div class="prof-info-item">
				<span class="prof-info-icon">&#128273;</span>
				<span>Only someone with the password can decrypt</span>
			</div>
		</div>

		<InputField
			label="Choose a password"
			type="password"
			placeholder="Enter a secure password"
			bind:value={sharePassword}
		/>

		<InputField
			label="Confirm password"
			type="password"
			placeholder="Re-enter password"
			bind:value={sharePasswordConfirm}
			onkeydown={(e) => e.key === 'Enter' && doShareProfile()}
		/>

		<label class="remember-password">
			<input type="checkbox" bind:checked={shareRemember} />
			<span>Remember password</span>
		</label>

		{#snippet footer()}
			<button class="btn-secondary" onclick={() => (showShare = false)}>Cancel</button>
			<button
				class="btn-primary"
				onclick={doShareProfile}
				disabled={!sharePassword || sharePassword !== sharePasswordConfirm || sharing}
			>
				{sharing ? 'Uploading...' : 'Upload'}
			</button>
		{/snippet}
	</ModalDialog>

	<!-- Share Info Modal -->
	<ModalDialog
		bind:this={infoDialog}
		title="Share Profile"
		subtitle="Share this profile with another device or person"
		size="sm"
		dark={true}
		onclose={handleInfoClose}
	>
		{#if qrDataUrl}
			<div class="share-qr-container">
				<img src={qrDataUrl} alt="QR Code" class="share-qr" />
			</div>
		{/if}

		<div class="share-id-box">
			<label class="input-label">Profile ID</label>
			<div class="share-id-row">
				<code class="share-id-code">{infoProfileId}</code>
				<button class="btn-copy" onclick={copyId}>
					{copied ? 'Copied!' : 'Copy'}
				</button>
			</div>
		</div>

		<p class="share-note">The recipient will need this ID and your password to import the profile.</p>

		{#snippet footer()}
			<button class="btn-secondary" onclick={() => (showInfo = false)}>Close</button>
		{/snippet}
	</ModalDialog>

	<!-- Password Update Modal -->
	<ModalDialog
		bind:this={passwordDialog}
		title="Change Password"
		subtitle={passwordUpdateSuccess ? undefined : "Update your sync password. All data will be re-encrypted with the new password."}
		error={passwordUpdateError}
		size="sm"
		dark={true}
		onclose={handlePasswordClose}
	>
		{#if !passwordUpdateSuccess}
			<div class="share-info">
				<div class="share-info-item">
					<span class="share-info-icon">&#128274;</span>
					<span>Your API key and data will be re-encrypted</span>
				</div>
				<div class="share-info-item">
					<span class="share-info-icon">&#9729;</span>
					<span>Server data updated atomically</span>
				</div>
				<div class="share-info-item">
					<span class="share-info-icon">&#128273;</span>
					<span>Old password will no longer work</span>
				</div>
			</div>

			<InputField
				label="Current password"
				type="password"
				placeholder="Enter your current password"
				bind:value={currentPassword}
			/>

			<InputField
				label="New password"
				type="password"
				placeholder="At least 8 characters"
				bind:value={newPassword}
			/>

			<InputField
				label="Confirm new password"
				type="password"
				placeholder="Re-enter new password"
				bind:value={newPasswordConfirm}
				onkeydown={(e) => e.key === 'Enter' && doPasswordUpdate()}
			/>
		{:else}
			<div class="sync-result">
				<div class="sync-result-icon">&#10003;</div>
				<p class="sync-result-text">Password updated successfully!</p>
			</div>
		{/if}

		{#snippet footer()}
			{#if !passwordUpdateSuccess}
				<button class="btn-secondary" onclick={() => (showPasswordUpdate = false)}>Cancel</button>
				<button
					class="btn-primary"
					onclick={doPasswordUpdate}
					disabled={!currentPassword || !newPassword || newPassword !== newPasswordConfirm || passwordUpdating}
				>
					{passwordUpdating ? 'Updating...' : 'Update Password'}
				</button>
			{:else}
				<button class="btn-primary" onclick={() => (showPasswordUpdate = false)}>Done</button>
			{/if}
		{/snippet}
	</ModalDialog>
</main>

<SiteFooter version="2.0.4" />
