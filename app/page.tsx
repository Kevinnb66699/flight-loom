import type { Metadata } from "next";
import { FlightLoom } from "./components/FlightLoom";

export const metadata: Metadata = {
  title: "Flight Loom — Turn drone video into interactive art",
  description:
    "See how a drone video's visible motion and colors become a living digital textile you can remix.",
};

export default function Home() {
  return <FlightLoom />;
}
