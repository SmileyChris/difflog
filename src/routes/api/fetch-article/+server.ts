/**
 * GET /api/fetch-article?url=...
 * Server-side article text extraction. Fetches the URL from Cloudflare,
 * strips HTML tags, and returns plain text. Used as fallback when Jina Reader
 * can't access the content.
 */

import type { RequestHandler } from './$types';

const MAX_CONTENT_LENGTH = 5000;
const FETCH_TIMEOUT = 10000;

function stripHtml(html: string): string {
	return html
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
		.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
		.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

export const GET: RequestHandler = async ({ url }) => {
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		new URL(targetUrl);
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

		const res = await fetch(targetUrl, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; difflog/1.0)',
				'Accept': 'text/html,application/xhtml+xml,text/plain'
			}
		});

		clearTimeout(timeout);

		if (!res.ok) {
			return new Response(JSON.stringify({ error: `Upstream returned ${res.status}` }), {
				status: 502,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const contentType = res.headers.get('content-type') || '';
		const raw = await res.text();

		const text = contentType.includes('text/html') ? stripHtml(raw) : raw;

		return new Response(JSON.stringify({ text: text.slice(0, MAX_CONTENT_LENGTH) }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Fetch failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
