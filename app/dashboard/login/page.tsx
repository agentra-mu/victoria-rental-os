import { redirect } from "next/navigation";
import { getAuthClient, getStaff } from "@/lib/dashboard/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  async function login(formData: FormData) {
    "use server";
    const auth = await getAuthClient();
    const { error: signInError } = await auth.auth.signInWithPassword({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    if (signInError || !(await getStaff())) {
      // Signed in to Auth but not an active staff user → sign out again.
      await auth.auth.signOut();
      redirect("/dashboard/login?error=1");
    }
    redirect("/dashboard");
  }
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-teal-700 text-xl font-bold text-white">
            V
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Victoria Car Rental
          </h1>
          <p className="text-sm text-zinc-500">Staff sign in</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
              Wrong email or password, or you don&apos;t have access.
            </p>
          )}
          <form action={login} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                className="border p-2.5 font-normal"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="border p-2.5 font-normal"
                required
              />
            </label>
            <button className="rounded-lg bg-teal-700 p-2.5 font-medium text-white shadow-sm hover:bg-teal-800">
              Sign in
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
