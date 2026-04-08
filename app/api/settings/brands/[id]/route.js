import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

export async function PATCH(request, { params }) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { id } = await params;
  const body   = await request.json();

  if (body.active !== undefined) {
    const { error } = await supabase
      .from('brand_partners').update({ active: body.active ? 1 : 0 }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request, { params }) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { id } = await params;
  const { error } = await supabase
    .from('brand_partners').update({ deleted: 1 }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
