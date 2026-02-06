/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

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
			};
			context: ExecutionContext;
			caches: CacheStorage;
		}
	}
}

export {};
