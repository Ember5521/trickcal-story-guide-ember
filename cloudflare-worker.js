export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/' || path === '/favicon.ico') {
            return new Response('Supabase Storage Proxy', { status: 200 });
        }

        const DEV_PROJECT_ID = 'rjnqevwqczktuyijhrmt';
        const PROD_PROJECT_ID = 'kbhohauajgmucxiilywk';

        const parts = path.split('/').filter(Boolean);
        let projectID = PROD_PROJECT_ID;
        let supabasePath = path;

        if (parts.length > 0 && (parts[0] === DEV_PROJECT_ID || parts[0] === PROD_PROJECT_ID || parts[0].length === 20)) {
            projectID = parts[0];
            supabasePath = '/' + parts.slice(1).join('/');
        } else {
            const referrer = request.headers.get('referer') || '';
            if (referrer.includes('localhost') || referrer.includes('127.0.0.1')) {
                projectID = DEV_PROJECT_ID;
            }
        }

        const SUPABASE_URL = `https://${projectID}.supabase.co/storage/v1/object/public${supabasePath}`;

        const cache = caches.default;
        let response = await cache.match(request);

        if (!response) {
            const originalResponse = await fetch(SUPABASE_URL, {
                headers: { 'User-Agent': 'Cloudflare Worker Proxy' },
            });

            if (!originalResponse.ok) return originalResponse;

            response = new Response(originalResponse.body, originalResponse);
            response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
            response.headers.set('Access-Control-Allow-Origin', '*'); // CORS 허용
            response.headers.set('x-debug-project', projectID); // 디버깅용

            ctx.waitUntil(cache.put(request, response.clone()));
        }

        return response;
    },
};
