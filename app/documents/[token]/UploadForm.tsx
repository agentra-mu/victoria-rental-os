"use client";

import { useRef, useState } from "react";

const SLOTS = [
  { docType: "PASSPORT", label: "Passport" },
  { docType: "DRIVING_PERMIT", label: "Driving permit" },
] as const;

type DocType = (typeof SLOTS)[number]["docType"];
type SlotStatus = "idle" | "uploading" | "done" | "error";

interface SlotState {
  status: SlotStatus;
  fileName: string | null;
  previewUrl: string | null;
  error: string | null;
}

const INITIAL_SLOT: SlotState = {
  status: "idle",
  fileName: null,
  previewUrl: null,
  error: null,
};

export function UploadForm({ token }: { token: string }) {
  const [slots, setSlots] = useState<Record<DocType, SlotState>>({
    PASSPORT: { ...INITIAL_SLOT },
    DRIVING_PERMIT: { ...INITIAL_SLOT },
  });

  const bothDone =
    slots.PASSPORT.status === "done" && slots.DRIVING_PERMIT.status === "done";

  async function handleFile(docType: DocType, file: File) {
    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null;

    setSlots((prev) => ({
      ...prev,
      [docType]: {
        status: "uploading",
        fileName: file.name,
        previewUrl,
        error: null,
      },
    }));

    try {
      const body = new FormData();
      body.set("docType", docType);
      body.set("file", file);

      const response = await fetch(`/api/documents/${token}`, {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: { message: string };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error?.message ?? "Upload failed — please try again.",
        );
      }

      setSlots((prev) => ({
        ...prev,
        [docType]: { ...prev[docType], status: "done" },
      }));
    } catch (error) {
      setSlots((prev) => ({
        ...prev,
        [docType]: {
          ...prev[docType],
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed.",
        },
      }));
    }
  }

  if (bothDone) {
    return (
      <div
        role="status"
        className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100"
      >
        <p className="font-medium">
          Thanks — we&apos;re checking your documents.
        </p>
        <p className="mt-1 text-sm">
          We&apos;ll message you on WhatsApp once they&apos;re reviewed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {SLOTS.map(({ docType, label }) => (
        <UploadSlot
          key={docType}
          docType={docType}
          label={label}
          state={slots[docType]}
          onFile={(file) => handleFile(docType, file)}
        />
      ))}
    </div>
  );
}

function UploadSlot({
  docType,
  label,
  state,
  onFile,
}: {
  docType: DocType;
  label: string;
  state: SlotState;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `upload-${docType}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="font-medium">
          {label}
        </label>
        {state.status === "done" && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Uploaded ✓
          </span>
        )}
        {state.status === "uploading" && (
          <span className="text-sm text-neutral-500">Uploading…</span>
        )}
      </div>

      {state.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote/optimizable image
        <img
          src={state.previewUrl}
          alt={`Preview of your ${label.toLowerCase()}`}
          className="mt-3 h-32 w-full rounded-md object-cover"
        />
      )}
      {!state.previewUrl && state.fileName && (
        <p className="mt-2 text-sm text-neutral-500">{state.fileName}</p>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
        capture="environment"
        className="sr-only"
        aria-describedby={state.error ? errorId : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state.status === "uploading"}
        className="mt-3 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {state.status === "done"
          ? "Replace photo"
          : "Take photo or choose file"}
      </button>

      {state.error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </div>
  );
}
