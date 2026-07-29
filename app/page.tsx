import type { Metadata } from "next";
import { FlightLoom } from "./components/FlightLoom";

export const metadata: Metadata = {
  title: "Flight Loom — Weave motion into art",
  description:
    "An interactive audiovisual tapestry woven from the motion and color of drone flight.",
};

export default function Home() {
  return <FlightLoom />;
}
