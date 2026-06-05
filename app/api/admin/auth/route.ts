/**
 * Sundial v2 — Admin Auth Endpoint
 *
 * POST /api/admin/auth
 *   Validates password and returns an auth cookie.
 *   Dead simple for dev — in production replace with
 *   NextAuth.js or Clerk.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json() as { password: string };
    const expected = process.env.ADMIN_TOKEN ?? "sundial2026";

    if (password !== expected) {
      return NextResponse.json(
        { success: false, error: "Invalid password" },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true });

    // Set an HTTP-only cookie with the token
    // TODO: Replace with a real signed JWT session cookie
    res.cookies.set("sundial_admin", expected, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
      sameSite: "lax",
      // secure: true, // TODO: Enable in production
    });

    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("sundial_admin");
  return res;
}
