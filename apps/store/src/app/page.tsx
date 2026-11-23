import type { Metadata } from "next";
import { HomeShowcase } from "@/components/HomeShowcase";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return <HomeShowcase />;
}
