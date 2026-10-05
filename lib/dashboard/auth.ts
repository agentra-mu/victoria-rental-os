import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "dashboard_auth";

export async function isAuthed(): Promise<boolean> {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return false;
  return (await cookies()).get(COOKIE)?.value === pw;
}

export async function requireAuth(): Promise<void> {
  if (!(await isAuthed())) redirect("/dashboard/login");
}

export async function signIn(password: string): Promise<boolean> {
  if (
    !process.env.DASHBOARD_PASSWORD ||
    password !== process.env.DASHBOARD_PASSWORD
  )
    return false;
  (await cookies()).set(COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return true;
}
