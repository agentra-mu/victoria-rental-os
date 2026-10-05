import { redirect } from "next/navigation";
import { signIn } from "@/lib/dashboard/auth";

export default function LoginPage() {
  async function login(formData: FormData) {
    "use server";
    if (await signIn(String(formData.get("password") ?? ""))) {
      redirect("/dashboard");
    }
    redirect("/dashboard/login?error=1");
  }
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">
        Victoria Car Rental — Owner
      </h1>
      <form action={login} className="flex flex-col gap-3">
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
