const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://rjnqevwqczktuyijhrmt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqbnFldndxY3prdHV5aWpocm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4ODUwNDMsImV4cCI6MjA4NTQ2MTA0M30.qXi04DhAEHSp3HYz0eHa_lf1jB8ae2TVjkZ1nJg9sZg";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { data: layout, error } = await supabase
        .from('story_layouts')
        .select('*')
        .eq('view_type', 'release')
        .eq('season', 2)
        .maybeSingle();

    if (error) {
        console.error(error);
        return;
    }

    const { data: masters } = await supabase.from('master_stories').select('id, label, importance');
    const masterMap = new Map(masters.map(m => [m.id, m]));

    console.log("Nodes Found:");
    const relevantNodes = layout.nodes.filter(n => {
        const m = masterMap.get(n.story_id);
        return m && (m.label.includes('얼어붙은') || m.label.includes('빵점') || m.label.includes('늑대'));
    });

    relevantNodes.forEach(n => {
        const m = masterMap.get(n.story_id);
        console.log(`- ID: ${n.id}, Label: ${m.label}, Importance: ${m.importance}`);
    });

    console.log("\nEdges in Layout:");
    layout.edges.forEach(e => {
        const srcNode = layout.nodes.find(n => n.id === e.source);
        const tgtNode = layout.nodes.find(n => n.id === e.target);
        const srcM = masterMap.get(srcNode?.story_id);
        const tgtM = masterMap.get(tgtNode?.story_id);

        if (srcM?.label.includes('얼어붙은') || tgtM?.label.includes('얼어붙은')) {
            console.log(`- ${srcM?.label} -> ${tgtM?.label} (${e.id})`);
        }
        if (srcM?.label.includes('빵점') || tgtM?.label.includes('빵점')) {
            console.log(`- ${srcM?.label} -> ${tgtM?.label} (${e.id})`);
        }
    });
}

check();
