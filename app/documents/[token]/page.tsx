import type { Metadata } from "next";
import { COMPANY_NAME } from "@/lib/agent/config";
import { getDocumentsDeps } from "@/lib/documents/db";
import { PRIVACY_NOTE } from "@/lib/documents/config";
import { validateUploadToken } from "@/lib/domain/validateUploadToken";
import { formatMauritiusDateTime } from "@/lib/whatsapp/format";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = {
  title: `Upload documents — ${COMPANY_NAME}`,
};

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  return trimmed ? (trimmed.split(/\s+/)[0] ?? null) : null;
}

function InvalidLink() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">
        This link isn&apos;t valid anymore
      </h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        It may have expired, or we&apos;re not expecting documents for this
        booking right now. Please message us on WhatsApp and we&apos;ll send you
        a fresh link.
      </p>
    </main>
  );
}

export default async function DocumentUploadPage({
  params,
}: PageProps<"/documents/[token]">) {
  const { token } = await params;
  const { domainDb, messaging } = getDocumentsDeps();

  const validation = await validateUploadToken(domainDb, token, new Date());
  if (!validation.ok) return <InvalidLink />;

  const { booking } = validation;
  const [vehicle, customer] = await Promise.all([
    booking.vehicleId ? domainDb.getVehicleById(booking.vehicleId) : null,
    messaging.getCustomerById(booking.customerId),
  ]);
  const name = firstName(customer?.fullName);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4 pb-10">
      <header className="pt-4">
        <p className="text-sm text-neutral-500">{COMPANY_NAME}</p>
        <h1 className="mt-1 text-xl font-semibold">
          {name ? `Hi ${name}, l` : "L"}et&apos;s get your documents sorted
        </h1>
        <dl className="mt-3 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
          <div>Booking #{booking.bookingNumber}</div>
          {vehicle && (
            <div>
              {vehicle.make} {vehicle.model}
            </div>
          )}
          {booking.pickupAt && booking.returnAt && (
            <div>
              {formatMauritiusDateTime(booking.pickupAt)} →{" "}
              {formatMauritiusDateTime(booking.returnAt)}
            </div>
          )}
        </dl>
      </header>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Please upload clear photos of your passport and driving permit. JPEG,
        PNG, HEIC or PDF, up to 10MB each.
      </p>

      <UploadForm token={token} />

      <p className="mt-auto text-xs text-neutral-500 dark:text-neutral-500">
        {PRIVACY_NOTE}
      </p>
    </main>
  );
}
