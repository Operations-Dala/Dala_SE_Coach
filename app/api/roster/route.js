import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { data, error } = await supabase
    .from('team_roster')
    .select('se_name, status, zone, position')
    .eq('deleted', 0)
    .order('se_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
