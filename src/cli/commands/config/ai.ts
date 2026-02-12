import { getProfile, saveProfile } from '../../config';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';

const SERVICE_NAME = 'difflog-cli';
const PROVIDERS = ['anthropic', 'serper', 'perplexity', 'deepseek', 'gemini'] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_LABELS: Record<Provider, string> = {
	anthropic: 'Anthropic (Claude)',
	serper: 'Serper (web search)',
	perplexity: 'Perplexity',
	deepseek: 'DeepSeek',
	gemini: 'Google Gemini'
};

async function getConfiguredKeys(): Promise<Set<Provider>> {
	const configured = new Set<Provider>();
	for (const provider of PROVIDERS) {
		try {
			const key = await getPassword(SERVICE_NAME, provider);
			if (key) configured.add(provider);
		} catch {
			// Not configured
		}
	}
	return configured;
}

export async function showAiConfig(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	const configured = await getConfiguredKeys();

	process.stdout.write('AI Configuration:\n');
	process.stdout.write('  API Keys:\n');
	for (const provider of PROVIDERS) {
		const status = configured.has(provider) ? '✓' : '✗';
		const label = PROVIDER_LABELS[provider];
		process.stdout.write(`    ${status} ${label}\n`);
	}

	if (profile.providerSelections) {
		process.stdout.write('\n  Provider Selections:\n');
		process.stdout.write(`    Search:    ${profile.providerSelections.search || 'none'}\n`);
		process.stdout.write(`    Curation:  ${profile.providerSelections.curation || 'none'}\n`);
		process.stdout.write(`    Synthesis: ${profile.providerSelections.synthesis || 'anthropic'}\n`);
	}
	process.stdout.write('\n');
}

export async function handleAi(args: string[]): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	const subcommand = args[0];

	if (!subcommand) {
		// Just show AI config
		await showAiConfig();
		return;
	}

	switch (subcommand) {
		case 'key': {
			const action = args[1];
			if (!action) {
				process.stdout.write('Usage: difflog config ai key <add|rm> <provider> [key]\n');
				return;
			}

			if (action === 'add') {
				const provider = args[2]?.toLowerCase() as Provider;
				const key = args[3];
				if (!provider || !PROVIDERS.includes(provider)) {
					process.stdout.write(`Invalid provider. Use: ${PROVIDERS.join(', ')}\n`);
					return;
				}
				if (!key) {
					process.stdout.write('Usage: difflog config ai key add <provider> <key>\n');
					return;
				}
				try {
					await setPassword(SERVICE_NAME, provider, key);
					process.stdout.write(`✓ Stored ${provider} API key\n`);
				} catch (err) {
					process.stdout.write(`Error: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
				}
			} else if (action === 'rm') {
				const provider = args[2]?.toLowerCase() as Provider;
				if (!provider || !PROVIDERS.includes(provider)) {
					process.stdout.write(`Invalid provider. Use: ${PROVIDERS.join(', ')}\n`);
					return;
				}
				try {
					await deletePassword(SERVICE_NAME, provider);
					process.stdout.write(`✓ Deleted ${provider} API key\n`);
				} catch (err) {
					process.stdout.write(`Error: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
				}
			} else {
				process.stdout.write('Usage: difflog config ai key <add|rm> <provider> [key]\n');
			}
			break;
		}

		case 'set': {
			const search = args[1]?.toLowerCase();
			const curation = args[2]?.toLowerCase();
			const synthesis = args[3]?.toLowerCase();

			if (!search || !curation || !synthesis) {
				process.stdout.write('Usage: difflog config ai set <search|none> <curation> <synthesis>\n');
				return;
			}

			const validProviders = [...PROVIDERS, 'none'];
			if (!validProviders.includes(search) || !validProviders.includes(curation) || !validProviders.includes(synthesis)) {
				process.stdout.write(`Invalid provider. Use: ${PROVIDERS.join(', ')}, or 'none' for search\n`);
				return;
			}

			const providerSelections = {
				search: search === 'none' ? null : search,
				curation,
				synthesis
			};

			saveProfile({ ...profile, providerSelections });
			process.stdout.write(`✓ Provider selections updated\n`);
			process.stdout.write(`  Search:    ${providerSelections.search || 'none'}\n`);
			process.stdout.write(`  Curation:  ${providerSelections.curation}\n`);
			process.stdout.write(`  Synthesis: ${providerSelections.synthesis}\n`);
			break;
		}

		default:
			process.stdout.write('Usage: difflog config ai [key|set]\n');
	}
}
