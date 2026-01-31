export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Example: https://worker.yourname.workers.dev/story-images/nodes/image.png
        // Extract bucket and path
        const path = url.pathname; // includes leading slash

        if (path === '/' || path === '/favicon.ico') {
            return new Response('Supabase Storage Proxy', { status: 200 });
        }

        // Configure your Supabase project ID here or via environment variables
        const SUPABASE_PROJECT_ID = env.SUPABASE_PROJECT_ID || 'rjnqevwqczktuyijhrmt';
        const SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public${path}`;

        // Cloudflare Cache API
        const cache = caches.default;
        let response = await cache.match(request);

        if (!response) {
            console.log(`Cache miss for ${path}. Fetching from Supabase...`);

            const originalResponse = await fetch(SUPABASE_URL, {
                headers: {
                    'User-Agent': 'Cloudflare Worker Proxy',
                },
            });

            if (!originalResponse.ok) {
                return originalResponse;
            }

            // Create a new response to add cache headers
            response = new Response(originalResponse.body, originalResponse);

            // Set Cache-Control headers for long-term caching
            // public: cacheable by anyone
            // max-age: 1 year (31536000 seconds)
            // immutable: if URL is same, content never changes
            response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
            response.headers.set('Vary', 'Accept');

            // Store in Cloudflare cache
            ctx.waitUntil(cache.put(request, response.clone()));
        } else {
            console.log(`Cache hit for ${path}.`);
        }

        return response;
    },
};
