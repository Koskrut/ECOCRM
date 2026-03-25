"use client";

import { EntitySection } from "@/components/sections/EntitySection";
import { ContactTimeline } from "./ContactTimeline";

type Props = {
  aboutSection: React.ReactNode;
  apiBaseUrl: string;
  contactId: string;
  sectionAboutTitle: string;
  sectionActivityTitle: string;
  openCompanyButton: React.ReactNode;
};

/** Двоколонковий огляд: профіль | активність (§7 декомпозиція ContactModal). */
export function ContactCardOverviewLayout({
  aboutSection,
  apiBaseUrl,
  contactId,
  sectionAboutTitle,
  sectionActivityTitle,
  openCompanyButton,
}: Props) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
      <div className="min-h-0 overflow-auto border-zinc-200 lg:border-r lg:pr-4">
        <EntitySection title={sectionAboutTitle} rightAction={openCompanyButton}>
          {aboutSection}
        </EntitySection>
      </div>
      <div className="min-h-0 overflow-auto pt-4 lg:pt-0 lg:pl-4">
        <EntitySection title={sectionActivityTitle}>
          <ContactTimeline apiBaseUrl={apiBaseUrl} contactId={contactId} showActivityButtons />
        </EntitySection>
      </div>
    </div>
  );
}
