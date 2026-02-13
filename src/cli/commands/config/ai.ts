import { getProfile, saveProfile, clearProviderSelections, trackProfileModified, trackKeysModified } from '../../config';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';
import { syncUpload } from '../../sync';
import { PROVIDER_IDS } from '../../../lib/utils/providers';
import { RESET, DIM, BOLD, CYAN, GREEN, BRIGHT_YELLOW, RED, SERVICE_NAME, BIN } from '../../ui';

const PROVIDERS = PROVIDER_IDS;
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

	process.stdout.write(`${DIM}AI Configuration:${RESET}\n`);
	process.stdout.write(`  ${DIM}API Keys:${RESET}\n`);
	for (const provider of PROVIDERS) {
		const status = configured.has(provider) ? `${GREEN}✓${RESET}` : `${DIM}✗${RESET}`;
		const label = PROVIDER_LABELS[provider];
		process.stdout.write(`    ${status} ${label}\n`);
	}

	if (profile.providerSelections) {
		process.stdout.write(`\n  ${DIM}Provider Selections:${RESET}\n`);
		process.stdout.write(`    ${DIM}Search:${RESET}    ${profile.providerSelections.search || 'none'}\n`);
		process.stdout.write(`    ${DIM}Curation:${RESET}  ${profile.providerSelections.curation || 'none'}\n`);
		process.stdout.write(`    ${DIM}Synthesis:${RESET} ${profile.providerSelections.synthesis || 'anthropic'}\n`);
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
				process.stdout.write(`${DIM}Usage: ${BIN} config ai key <add|rm> <provider> [key]${RESET}\n`);
				return;
			}

			if (action === 'add') {
				const provider = args[2]?.toLowerCase() as Provider;
				const key = args[3];
				if (!provider || !PROVIDERS.includes(provider)) {
					process.stdout.write(`${BRIGHT_YELLOW}!${RESET} Invalid provider. Use: ${PROVIDERS.join(', ')}\n`);
					return;
				}
				if (!key) {
					process.stdout.write(`${DIM}Usage: ${BIN} config ai key add <provider> <key>${RESET}\n`);
					return;
				}
				try {
					await setPassword(SERVICE_NAME, provider, key);
					trackKeysModified();
					process.stdout.write(`${GREEN}✓${RESET} Stored ${BOLD}${provider}${RESET} API key\n`);
					await syncUpload();
				} catch (err) {
					process.stdout.write(`${RED}✗${RESET} Error: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
				}
			} else if (action === 'rm') {
				const provider = args[2]?.toLowerCase() as Provider;
				if (!provider || !PROVIDERS.includes(provider)) {
					process.stdout.write(`${BRIGHT_YELLOW}!${RESET} Invalid provider. Use: ${PROVIDERS.join(', ')}\n`);
					return;
				}
				try {
					await deletePassword(SERVICE_NAME, provider);
					clearProviderSelections(provider);
					trackKeysModified();
					process.stdout.write(`${GREEN}✓${RESET} Deleted ${BOLD}${provider}${RESET} API key\n`);
					await syncUpload();
				} catch (err) {
					process.stdout.write(`${RED}✗${RESET} Error: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
				}
			} else {
				process.stdout.write(`${DIM}Usage: ${BIN} config ai key <add|rm> <provider> [key]${RESET}\n`);
			}
			break;
		}

		case 'set': {
			const search = args[1]?.toLowerCase();
			const curation = args[2]?.toLowerCase();
			const synthesis = args[3]?.toLowerCase();

			if (!search || !curation || !synthesis) {
				process.stdout.write(`${DIM}Usage: ${BIN} config ai set <search|none> <curation> <synthesis>${RESET}\n`);
				return;
			}

			const validProviders = [...PROVIDERS, 'none'];
			if (!validProviders.includes(search) || !validProviders.includes(curation) || !validProviders.includes(synthesis)) {
				process.stdout.write(`${BRIGHT_YELLOW}!${RESET} Invalid provider. Use: ${PROVIDERS.join(', ')}, or 'none' for search\n`);
				return;
			}

			const providerSelections = {
				search: search === 'none' ? null : search,
				curation,
				synthesis
			};

			saveProfile({ ...profile, providerSelections });
			trackProfileModified();
			trackKeysModified();
			process.stdout.write(`${GREEN}✓${RESET} Provider selections updated\n`);
			process.stdout.write(`  ${DIM}Search:${RESET}    ${providerSelections.search || 'none'}\n`);
			process.stdout.write(`  ${DIM}Curation:${RESET}  ${providerSelections.curation}\n`);
			process.stdout.write(`  ${DIM}Synthesis:${RESET} ${providerSelections.synthesis}\n`);
			await syncUpload();
			break;
		}

		default:
			process.stdout.write(`${DIM}Usage: ${BIN} config ai [key|set]${RESET}\n`);
	}
}
