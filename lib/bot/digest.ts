/**
 * Deterministic "Return to bot" digest — what the team and customer said
 * while a person had the chat. No model involved: message counts, the time
 * span, and the last few team messages verbatim.
 */
const LINE = /^\[(.+?)\] (Customer|Team): ([\s\S]*)$/;

export interface DigestLine {
  at: string;
  who: "Customer" | "Team";
  body: string;
}

export function parseTranscript(transcript: string): DigestLine[] {
  const out: DigestLine[] = [];
  for (const raw of transcript.split("\n")) {
    const m = LINE.exec(raw);
    if (m) out.push({ at: m[1], who: m[2] as DigestLine["who"], body: m[3] });
    else if (out.length > 0 && raw.trim())
      out[out.length - 1].body += `\n${raw}`;
  }
  return out;
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Mauritius",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

export function buildTakeoverDigest(
  transcript: string,
  lastTeamMessages = 5,
): string {
  const lines = parseTranscript(transcript);
  if (lines.length === 0)
    return "No messages were exchanged during the takeover.";
  const team = lines.filter((l) => l.who === "Team");
  const customer = lines.length - team.length;
  const out = [
    `${lines.length} message${lines.length === 1 ? "" : "s"} during the takeover (${team.length} from the team, ${customer} from the customer), ${fmt(lines[0].at)} → ${fmt(lines[lines.length - 1].at)} (Mauritius time).`,
  ];
  if (team.length > 0) {
    out.push(
      `Last ${Math.min(lastTeamMessages, team.length)} team message${team.length === 1 ? "" : "s"}:`,
    );
    for (const l of team.slice(-lastTeamMessages))
      out.push(`- [${fmt(l.at)}] ${l.body}`);
  }
  return out.join("\n");
}
