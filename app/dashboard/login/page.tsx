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
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">
        Victoria Car Rental — Staff
      </h1>
      {error && (
        <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
          Wrong email or password, or you don&apos;t have access.
        </p>
      )}
      <form action={login} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="Email"
          className="rounded border p-2"
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          className="rounded border p-2"
          required
        />
        <button className="rounded bg-black p-2 text-white">Sign in</button>
      </form>
    </main>
  );
}
