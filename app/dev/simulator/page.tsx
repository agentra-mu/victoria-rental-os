import { notFound } from "next/navigation";
import Simulator from "./Simulator";

export default function SimulatorPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_SIMULATOR !== "true"
  )
    notFound();
  return <Simulator />;
}
