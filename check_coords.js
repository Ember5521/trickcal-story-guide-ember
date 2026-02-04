const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://rjnqevwqczktuyijhrmt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqbnFldndxY3prdHV5aWpocm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODUwNDMsImV4cCI6MjA4NTQ2MTA0M30.qXi04DhAEHSp3HYz0eHa_lf1jB8ae2TVjkZ1nJg9sZg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { data: layout } = await supabase
        .from('story_layouts')
        .select('*')
        .eq('view_type', 'release')
        .eq('season', 2)
        .maybeSingle();

    const { data: masters } = await supabase.from('master_stories').select('id, label');
    const masterMap = new Map(masters.map(m => [m.id, m]));

    const targetLabels = ['로네(시장)', '수수께끼', '각오한 길'];

    console.log("Nodes Found:");
    layout.nodes.forEach(n => {
        const m = masterMap.get(n.story_id);
        if (m && targetLabels.some(tl => m.label.includes(tl))) {
            console.log(`- Label: ${m.label}, ID: ${n.id}, x: ${n.x}, y: ${n.y}, w: ${n.w}, h: ${n.h}`);
        }
    });
}

check();
