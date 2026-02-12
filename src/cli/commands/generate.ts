import { getProfile, getDiffs, saveDiffs } from '../config';
import { generateDiffContent } from '../../lib/actions/generateDiff';
import type { GenerationDepth } from '../../lib/utils/constants';
import { getPassword } from 'cross-keychain';

const API_HOST = process.env.DIFFLOG_API_HOST || 'https://difflog.dev';
const SERVICE_NAME = 'difflog-cli';
const PROVIDERS = ['anthropic', 'serper', 'perplexity', 'deepseek', 'gemini'] as const;

async function getApiKeys(): Promise<{
	anthropic?: string;
	serper?: string;
	perplexity?: string;
	deepseek?: string;
	gemini?: string;
}> {
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

	// Check if at least one synthesis provider key is available
	const hasSynthesisKey = !!(apiKeys.anthropic || apiKeys.deepseek || apiKeys.gemini || apiKeys.perplexity);
	if (!hasSynthesisKey) {
		process.stderr.write('Error: No AI provider API key found.\n\n');
		process.stderr.write('Configure API keys:\n');
		process.stderr.write('  difflog config\n\n');
		process.stderr.write('Or set environment variables:\n');
		process.stderr.write('  export ANTHROPIC_API_KEY=sk-ant-...\n\n');
		process.stderr.write('Then run: difflog generate\n');
		process.exit(1);
	}

	// Get last diff for window calculation
	const diffs = getDiffs();
	const lastDiff = diffs[0];
	const lastDiffDate = lastDiff?.generated_at || null;
	const lastDiffContent = lastDiff?.content;

	// Use profile depth or default to 'standard'
	const depth = (profile.depth as GenerationDepth) || 'standard';

	// Determine synthesis provider based on available keys
	let synthesisProvider = 'anthropic';
	if (apiKeys.anthropic) synthesisProvider = 'anthropic';
	else if (apiKeys.deepseek) synthesisProvider = 'deepseek';
	else if (apiKeys.gemini) synthesisProvider = 'gemini';
	else if (apiKeys.perplexity) synthesisProvider = 'perplexity';

	process.stdout.write('Generating diff...\n');
	process.stdout.write(`Profile: ${profile.name}\n`);
	process.stdout.write(`Depth: ${depth}\n`);
	process.stdout.write(`Provider: ${synthesisProvider}\n\n`);

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
				providerSelections: { synthesis: synthesisProvider },
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
