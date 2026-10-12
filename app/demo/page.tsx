import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PERSONAS } from "@/lib/demo/personas";
import DemoClient from "./DemoClient";

export const metadata: Metadata = {
  title: "Victoria Car Rental — chat demo",
  robots: { index: false, follow: false },
};

// Read env at request time, not build time.
export const dynamic = "force-dynamic";

export default function DemoPage() {
  if (process.env.DEMO_MODE !== "true") notFound();
  return (
    <DemoClient
      chatUrl={process.env.NEXT_PUBLIC_N8N_CHAT_URL ?? ""}
      personas={PERSONAS}
    />
  );
}
