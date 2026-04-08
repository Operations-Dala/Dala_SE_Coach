import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Temporary diagnostic endpoint — remove after debugging CSRF issue
export async function GET(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return NextResponse.json({
    url: request.url,
    origin_header: request.headers.get('origin'),
    host: request.headers.get('host'),
    x_forwarded_proto: request.headers.get('x-forwarded-proto'),
    x_forwarded_host: request.headers.get('x-forwarded-host'),
    x_forwarded_for: request.headers.get('x-forwarded-for'),
    all_headers: headers,
  });
}
