import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Recursive listing helper (Moved outside to comply with ES5 strict mode rules)
async function listAllFiles(supabase: SupabaseClient, bucketName: string, path: string = 'nodes'): Promise<string[]> {
    const { data, error } = await supabase.storage.from(bucketName).list(path);
    if (error) throw error;

    let files: string[] = [];
    for (const item of data || []) {
        const fullPath = `${path}/${item.name}`;
        if (!item.id) { // It's a directory
            const subFiles = await listAllFiles(supabase, bucketName, fullPath);
            files = files.concat(subFiles);
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

// URL Transformation Logic helper
function transformUrls(obj: any, devProjId: string, deployProjId: string): any {
    if (!obj || !devProjId || !deployProjId) return obj;
    const proxyUrl = process.env.NEXT_PUBLIC_IMAGE_PROXY_URL || '';
    let str = JSON.stringify(obj);

    // 1. Replace project IDs in public URLs
    const regex = new RegExp(devProjId, 'g');
    str = str.replace(regex, deployProjId);

    // 2. Wrap Supabase storage URLs with Cloudflare proxy if configured
    if (proxyUrl) {
        // Find public storage URLs and transform them to proxied versions
        // Format: https://proxy-url.workers.dev/PROJECT_ID/path/to/image
        const storageRegex = new RegExp(`https://${deployProjId}\\.supabase\\.co/storage/v1/object/public/([^"\\s]+)`, 'g');
        str = str.replace(storageRegex, `${proxyUrl}/${deployProjId}/$1`);
    }

    return JSON.parse(str);
}

export async function POST(req: Request) {
    try {
        const { password, mode = 'push' } = await req.json(); // mode: 'push' (dev->deploy), 'pull' (deploy->dev)

        const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const devKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const deployUrl = process.env.DEPLOY_SUPABASE_URL;
        const deployKey = process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY;

        if (!deployUrl || !deployKey || deployUrl === 'your_production_supabase_url') {
            return NextResponse.json({ error: '운영 서버 설정이 완료되지 않았습니다.' }, { status: 500 });
        }

        const devSupabase = createClient(devUrl, devKey);
        const deploySupabase = createClient(deployUrl, deployKey);

        // 1. Password Verification (Always check against Dev DB for simplicity)
        const { data: adminSettings, error: adminError } = await devSupabase
            .from('admin_settings')
            .select('password')
            .eq('id', 1)
            .single();

        if (adminError || !adminSettings || adminSettings.password !== password) {
            return NextResponse.json({ error: '인증 실패: 잘못된 비밀번호입니다.' }, { status: 401 });
        }

        // Define Source/Target based on mode
        const sourceSupabase = mode === 'pull' ? deploySupabase : devSupabase;
        const targetSupabase = mode === 'pull' ? devSupabase : deploySupabase;

        const results: any = { storage: {}, tables: {} };

        // 2. Storage Sync (story-images) - Efficient version
        console.log(`>>> [Sync] Starting Storage Sync (${mode})...`);
        try {
            const bucketName = 'story-images';
            const sourceFiles = await listAllFiles(sourceSupabase, bucketName);
            const targetFiles = await listAllFiles(targetSupabase, bucketName);
            const targetFileSet = new Set(targetFiles);

            console.log(`>>> [Sync] Found ${sourceFiles.length} files in source, ${targetFiles.length} in target.`);

            let syncCount = 0;
            let skipCount = 0;

            for (const filePath of sourceFiles) {
                // Skip if already exists on target
                if (targetFileSet.has(filePath)) {
                    skipCount++;
                    continue;
                }

                // Download from Source
                const { data: fileData, error: downloadError } = await sourceSupabase.storage
                    .from(bucketName)
                    .download(filePath);

                if (downloadError) continue;

                // Upload to Target
                await targetSupabase.storage
                    .from(bucketName)
                    .upload(filePath, fileData, { upsert: true });

                syncCount++;
            }
            results.storage = `${syncCount} files synced, ${skipCount} skipped (already exists)`;
        } catch (storageErr: any) {
            results.storage = `Error: ${storageErr.message}`;
        }

        // 3. Prepare IDs for Transformation
        const devProjId = devUrl.split('//')[1]?.split('.')[0];
        const deployProjId = deployUrl?.split('//')[1]?.split('.')[0];

        // Transform direction depends on mode
        const fromId = mode === 'pull' ? deployProjId : devProjId;
        const toId = mode === 'pull' ? devProjId : deployProjId;

        // 4. Get last sync time from Target
        const { data: targetAdmin } = await targetSupabase
            .from('admin_settings')
            .select('last_synced_at')
            .eq('id', 1)
            .single();

        const lastSyncedAt = targetAdmin?.last_synced_at;
        console.log(`>>> [Sync] Last synced at: ${lastSyncedAt || 'Never'}`);

        // 5. Tables Sync
        const tablesToSync = ['master_stories', 'story_layouts', 'admin_settings', 'app_updates'];

        for (const table of tablesToSync) {
            let query = sourceSupabase.from(table).select('*');

            // Apply incremental filter if lastSyncedAt exists and table has updated_at
            // (admin_settings doesn't have updated_at, we sync it fully as it's small)
            if (lastSyncedAt && table !== 'admin_settings') {
                query = query.gt('updated_at', lastSyncedAt);
            }

            const { data: sourceData, error: fetchError } = await query;

            if (fetchError || !sourceData) {
                results.tables[table] = `Fetch Error or No changes`;
                continue;
            }

            if (sourceData.length === 0) {
                results.tables[table] = `Up to date (0 changes)`;
                continue;
            }

            // Transform URLs
            const transformedData = transformUrls(sourceData, fromId, toId);

            const { error: upsertError } = await targetSupabase
                .from(table)
                .upsert(transformedData);

            if (upsertError) {
                results.tables[table] = `Upsert Error: ${upsertError.message}`;
            } else {
                results.tables[table] = `Synced: ${sourceData.length} records`;
            }
        }

        // 6. Update last_synced_at on Target
        await targetSupabase
            .from('admin_settings')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', 1);

        return NextResponse.json({
            message: `동기화 완료 (${mode === 'pull' ? '운영 -> 개발' : '개발 -> 운영'})`,
            details: results
        });

    } catch (error: any) {
        return NextResponse.json({ error: `서버 오류: ${error.message}` }, { status: 500 });
    }
}
