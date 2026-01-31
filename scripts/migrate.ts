import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const OLD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const OLD_SERVICE_KEY = process.env.DEV_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const NEW_URL = process.env.NEW_SUPABASE_URL!;
const NEW_SERVICE_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY!;

console.log('OLD_URL:', OLD_URL);
console.log('NEW_URL:', NEW_URL);

if (!OLD_URL || !OLD_SERVICE_KEY) {
    console.error('Error: OLD_URL or OLD_SERVICE_KEY is missing');
    process.exit(1);
}

if (!NEW_URL || !NEW_SERVICE_KEY || NEW_URL === 'your_new_supabase_url') {
    console.error('Error: Please set NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const oldClient = createClient(OLD_URL, OLD_SERVICE_KEY);
const newClient = createClient(NEW_URL, NEW_SERVICE_KEY);

async function listAllFiles(supabase: SupabaseClient, bucketName: string, folder: string = 'nodes'): Promise<string[]> {
    const { data, error } = await supabase.storage.from(bucketName).list(folder);
    if (error) throw error;

    let files: string[] = [];
    for (const item of data || []) {
        const fullPath = `${folder}/${item.name}`;
        if (!item.id) { // It's a directory
            const subFiles = await listAllFiles(supabase, bucketName, fullPath);
            files = files.concat(subFiles);
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

function transformUrls(obj: any, oldId: string, newId: string): any {
    if (!obj || !oldId || !newId) return obj;
    const str = JSON.stringify(obj);
    const regex = new RegExp(oldId, 'g');
    const transformed = str.replace(regex, newId);
    return JSON.parse(transformed);
}

async function migrate() {
    console.log('--- Starting Migration ---');
    const oldId = OLD_URL.split('//')[1]?.split('.')[0];
    const newId = NEW_URL.split('//')[1]?.split('.')[0];

    // 1. Migrate Tables
    const tables = ['admin_settings', 'master_stories', 'story_layouts'];
    for (const table of tables) {
        console.log(`Migrating table: ${table}...`);
        const { data, error } = await oldClient.from(table).select('*');
        if (error) {
            console.error(`Error fetching from ${table}:`, error.message);
            continue;
        }

        if (data && data.length > 0) {
            const transformedData = transformUrls(data, oldId, newId);
            const { error: upsertError } = await newClient.from(table).upsert(transformedData);
            if (upsertError) {
                console.error(`Error upserting to ${table}:`, upsertError.message);
            } else {
                console.log(`Successfully migrated ${data.length} rows to ${table}.`);
            }
        }
    }

    // 2. Migrate Storage
    const bucketName = 'story-images';
    console.log(`Migrating storage bucket: ${bucketName}...`);
    try {
        const allFiles = await listAllFiles(oldClient, bucketName);
        console.log(`Found ${allFiles.length} files in ${bucketName}.`);

        for (const filePath of allFiles) {
            console.log(`Copying ${filePath}...`);
            const { data: fileData, error: downloadError } = await oldClient.storage
                .from(bucketName)
                .download(filePath);

            if (downloadError) {
                console.error(`Error downloading ${filePath}:`, downloadError.message);
                continue;
            }

            const { error: uploadError } = await newClient.storage
                .from(bucketName)
                .upload(filePath, fileData, { upsert: true });

            if (uploadError) {
                console.error(`Error uploading ${filePath}:`, uploadError.message);
            }
        }
    } catch (err: any) {
        console.error(`Storage migration error:`, err.message);
    }

    console.log('--- Migration Finished ---');
}

migrate();
