import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';
import { extractDocxText } from '@/lib/doc-parser';

export async function GET(request, { params }) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { name } = await params;
  const seName = decodeURIComponent(name);
  const { data } = await supabase
    .from('se_profiles')
    .select('se_name, file_name, uploaded_at')
    .eq('se_name', seName)
    .maybeSingle();
  return NextResponse.json(data || { se_name: seName, traits_text: null, file_name: null });
}

export async function POST(request, { params }) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { name } = await params;
  const seName   = decodeURIComponent(name);
  const formData = await request.formData();
  const file     = formData.get('file');

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const buffer     = Buffer.from(await file.arrayBuffer());
  const traitsText = await extractDocxText(buffer);

  const { error } = await supabase
    .from('se_profiles')
    .upsert({ se_name: seName, traits_text: traitsText, file_name: file.name }, { onConflict: 'se_name' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, se_name: seName, file_name: file.name });
}

export async function DELETE(request, { params }) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { name } = await params;
  const seName = decodeURIComponent(name);
  const { error } = await supabase.from('se_profiles').delete().eq('se_name', seName);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
