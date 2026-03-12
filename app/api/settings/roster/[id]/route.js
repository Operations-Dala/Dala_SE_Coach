import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body    = await request.json();
  const updates = {};

  if (body.se_name  !== undefined) updates.se_name  = body.se_name;
  if (body.region   !== undefined) updates.region   = body.region;
  if (body.zone     !== undefined) updates.zone     = body.zone;
  if (body.status   !== undefined) updates.status   = body.status;
  if (body.position !== undefined) updates.position = body.position;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('team_roster').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(_, { params }) {
  const { id } = await params;
  const { error } = await supabase
    .from('team_roster').update({ deleted: 1 }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
