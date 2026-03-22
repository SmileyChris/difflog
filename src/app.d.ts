/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

declare const __APP_VERSION__: string;

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {}
		interface PageData {}
		interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				KV: KVNamespace;
				ANTHROPIC_API_KEY: string;
				STRIPE_SECRET_KEY: string;
				STRIPE_WEBHOOK_SECRET: string;
				STRIPE_PK: string;
			};
			context: ExecutionContext;
			caches: CacheStorage;
		}
	}
}

export {};
