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
    const str = JSON.stringify(obj);
    // Replace project IDs in public URLs using regex for wider compatibility (replaceAll is ES2021+)
    const regex = new RegExp(devProjId, 'g');
    const transformed = str.replace(regex, deployProjId);
    return JSON.parse(transformed);
}

export async function POST(req: Request) {
    try {
        const { password } = await req.json();

        const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const devKey = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const deployUrl = process.env.DEPLOY_SUPABASE_URL;
        const deployKey = process.env.DEPLOY_SUPABASE_SERVICE_ROLE_KEY;

        if (!deployUrl || !deployKey || deployUrl === 'your_production_supabase_url') {
            return NextResponse.json({ error: '운영 서버 설정이 완료되지 않았습니다.' }, { status: 500 });
        }

        const devSupabase = createClient(devUrl, devKey);
        const deploySupabase = createClient(deployUrl, deployKey);

        // 1. Password Verification
        const { data: adminSettings, error: adminError } = await devSupabase
            .from('admin_settings')
            .select('password')
            .eq('id', 1)
            .single();

        if (adminError || !adminSettings || adminSettings.password !== password) {
            return NextResponse.json({ error: '인증 실패: 잘못된 비밀번호입니다.' }, { status: 401 });
        }

        const results: any = { storage: {}, tables: {} };

        // 2. Storage Sync (story-images)
        console.log(">>> [Sync] Starting Storage Sync...");
        try {
            const bucketName = 'story-images';
            const allFiles = await listAllFiles(devSupabase, bucketName);
            console.log(`>>> [Sync] Found ${allFiles.length} files in dev storage.`);
            let syncCount = 0;

            for (const filePath of allFiles) {
                console.log(`>>> [Sync] Migrating: ${filePath}`);
                // Download from Dev
                const { data: fileData, error: downloadError } = await devSupabase.storage
                    .from(bucketName)
                    .download(filePath);

                if (downloadError) {
                    console.error(`>>> [Sync] Failed to download ${filePath}:`, downloadError.message);
                    continue;
                }

                // Upload to Deploy
                const { error: uploadError } = await deploySupabase.storage
                    .from(bucketName)
                    .upload(filePath, fileData, { upsert: true });

                if (uploadError) {
                    console.error(`>>> [Sync] Failed to upload ${filePath}:`, uploadError.message);
                } else {
                    syncCount++;
                }
            }
            results.storage = `${syncCount} files synced to storage`;
            console.log(`>>> [Sync] Storage sync complete: ${syncCount} files.`);
        } catch (storageErr: any) {
            console.error(">>> [Sync] Storage sync error:", storageErr.message);
            results.storage = `Error: ${storageErr.message}`;
        }

        // 3. Prepare IDs for Transformation
        const devProjId = devUrl.split('//')[1]?.split('.')[0];
        const deployProjId = deployUrl?.split('//')[1]?.split('.')[0];
        console.log(`>>> [Sync] Transforming IDs: ${devProjId} -> ${deployProjId}`);

        // 4. Tables Sync
        const tablesToSync = ['master_stories', 'story_layouts', 'admin_settings'];

        for (const table of tablesToSync) {
            console.log(`>>> [Sync] Syncing table: ${table}...`);
            const { data: devData, error: fetchError } = await devSupabase.from(table).select('*');

            if (fetchError) {
                console.error(`>>> [Sync] Fetch error for ${table}:`, fetchError.message);
                results.tables[table] = `Fetch Error: ${fetchError.message}`;
                continue;
            }

            if (!devData || devData.length === 0) {
                results.tables[table] = 'No data';
                continue;
            }

            // Transform URLs in the records
            const transformedData = transformUrls(devData, devProjId, deployProjId);

            const { error: upsertError } = await deploySupabase
                .from(table)
                .upsert(transformedData);

            if (upsertError) {
                console.error(`>>> [Sync] Upsert error for ${table}:`, upsertError.message);
                results.tables[table] = `Upsert Error: ${upsertError.message}`;
            } else {
                console.log(`>>> [Sync] Successfully synced ${devData.length} records for ${table}.`);
                results.tables[table] = `Success: ${devData.length} records`;
            }
        }

        return NextResponse.json({
            message: '동기화 완료 (DB + Storage)',
            details: results
        });

    } catch (error: any) {
        console.error('Sync Error:', error);
        return NextResponse.json({ error: `서버 오류: ${error.message}` }, { status: 500 });
    }
}
