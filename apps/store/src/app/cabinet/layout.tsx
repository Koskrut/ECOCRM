import type { Metadata } from "next";
import { CabinetShell } from "./CabinetShell";

export const metadata: Metadata = {
  title: "Кабінет",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CabinetLayout({ children }: { children: React.ReactNode }) {
  return <CabinetShell>{children}</CabinetShell>;
}
