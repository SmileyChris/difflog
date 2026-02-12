import { getProfile, getDiffs, saveDiffs } from '../config';
import { generateDiffContent } from '../../lib/actions/generateDiff';
import type { GenerationDepth } from '../../lib/utils/constants';
import { isConfigurationComplete, STEPS, type ProviderStep } from '../../lib/utils/providers';
import { getPassword } from 'cross-keychain';

const API_HOST = process.env.DIFFLOG_API_HOST || 'https://difflog.dev';
const SERVICE_NAME = 'difflog-cli';
const PROVIDERS = ['anthropic', 'serper', 'perplexity', 'deepseek', 'gemini'] as const;

async function getApiKeys(): Promise<Record<string, string | undefined>> {
	const keys: Record<string, string | undefined> = {};

	for (const provider of PROVIDERS) {
		try {
			const keychainValue = await getPassword(SERVICE_NAME, provider);
			if (keychainValue) {
				keys[provider] = keychainValue;
			} else {
				const envVar = `${provider.toUpperCase()}_API_KEY`;
				keys[provider] = process.env[envVar];
			}
		} catch {
			const envVar = `${provider.toUpperCase()}_API_KEY`;
			keys[provider] = process.env[envVar];
		}
	}

	return keys;
}

export async function generateCommand(): Promise<void> {
	const profile = getProfile();
	if (!profile) {
		process.stderr.write('No profile found. Run: difflog login\n');
		process.exit(1);
	}

	// Get API keys from OS keychain (with fallback to environment variables)
	const apiKeys = await getApiKeys();

	// Use profile's provider selections
	const selections = {
		search: profile.providerSelections?.search ?? null,
		curation: profile.providerSelections?.curation ?? null,
		synthesis: profile.providerSelections?.synthesis ?? null
	};

	// Validate that required steps have keys configured
	if (!isConfigurationComplete(apiKeys, selections)) {
		const missing: string[] = [];
		for (const step of STEPS) {
			if (!step.required) continue;
			const provider = selections[step.id as ProviderStep];
			if (!provider) {
				missing.push(`${step.label}: no provider selected`);
			} else if (!apiKeys[provider]) {
				missing.push(`${step.label}: missing API key for ${provider}`);
			}
		}
		process.stderr.write('Error: AI configuration incomplete.\n\n');
		for (const m of missing) {
			process.stderr.write(`  • ${m}\n`);
		}
		process.stderr.write('\nRun `difflog config` to configure providers and API keys.\n');
		process.exit(1);
	}

	// Get last diff for window calculation
	const diffs = getDiffs();
	const lastDiff = diffs[0];
	const lastDiffDate = lastDiff?.generated_at || null;
	const lastDiffContent = lastDiff?.content;

	// Use profile depth or default to 'standard'
	const depth = (profile.depth as GenerationDepth) || 'standard';

	process.stdout.write('Generating diff...\n');
	process.stdout.write(`Profile: ${profile.name}\n`);
	process.stdout.write(`Depth: ${depth}\n`);
	process.stdout.write(`Synthesis: ${selections.synthesis}\n`);
	if (selections.curation) process.stdout.write(`Curation: ${selections.curation}\n`);
	if (selections.search) process.stdout.write(`Search: ${selections.search}\n`);
	process.stdout.write('\n');

	try {
		// Generate the diff using shared logic
		const { diff } = await generateDiffContent({
			profile: {
				name: profile.name,
				languages: profile.languages,
				frameworks: profile.frameworks,
				tools: profile.tools,
				topics: profile.topics,
				depth,
				resolvedMappings: {}, // TODO: Add support for resolved mappings in CLI
				providerSelections: { synthesis: selections.synthesis || undefined },
				apiKeys
			},
			selectedDepth: depth,
			lastDiffDate,
			lastDiffContent,
			apiHost: API_HOST
		});

		// Save the diff
		const updatedDiffs = [diff, ...diffs];
		saveDiffs(updatedDiffs);

		process.stdout.write('\n✓ Diff generated successfully!\n');
		process.stdout.write(`Title: ${diff.title}\n`);
		process.stdout.write(`Duration: ${diff.duration_seconds}s\n`);
		if (diff.cost) {
			process.stdout.write(`Cost: $${diff.cost.toFixed(4)}\n`);
		}
		process.stdout.write('\nRun `difflog` to view it.\n');
	} catch (error) {
		process.stderr.write(`\nError generating diff: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
		process.exit(1);
	}
}
