import { PAY_CRITICAL_CSS } from "./pay-critical-css";

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAY_CRITICAL_CSS }} />
      {children}
    </>
  );
}
