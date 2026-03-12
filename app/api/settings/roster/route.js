import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('team_roster').select('*').eq('deleted', 0).order('se_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Full SEs first, then trial
  const sorted = (data || []).sort((a, b) => {
    if (a.status === b.status) return a.se_name.localeCompare(b.se_name);
    return a.status === 'full' ? -1 : 1;
  });
  return NextResponse.json(sorted);
}

export async function POST(request) {
  const { se_name, region, zone, status, position } = await request.json();
  if (!se_name?.trim()) {
    return NextResponse.json({ error: 'se_name is required' }, { status: 400 });
  }

  const { data: exists } = await supabase
    .from('team_roster').select('id').eq('se_name', se_name.trim()).eq('deleted', 0).maybeSingle();
  if (exists) return NextResponse.json({ error: 'SE already exists in roster' }, { status: 409 });

  const { data, error } = await supabase
    .from('team_roster')
    .insert({ se_name: se_name.trim(), region: region || '', zone: zone || '', status: status || 'full', position: position || 'sales_executive' })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id, se_name: data.se_name }, { status: 201 });
}
