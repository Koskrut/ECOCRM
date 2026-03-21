/**
 * Інлайн-стилі для /pay/* — якщо зовнішній chunk `/_next/static/.../css` не завантажується
 * (проксі, VPN, nginx), сторінка оплати лишається читабельною.
 */
export const PAY_CRITICAL_CSS = `
.pay-public-page {
  min-height: 100dvh;
  min-height: 100vh;
  margin: 0;
  background: #fafafa;
  color: #18181b;
  padding: 2rem 1rem;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 0.875rem;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
}
.pay-public-page *, .pay-public-page *::before, .pay-public-page *::after { box-sizing: border-box; }
.pay-public-inner { max-width: 28rem; margin-left: auto; margin-right: auto; }
.pay-public-head { text-align: center; margin-bottom: 1.5rem; }
.pay-public-head h1 { margin: 0; font-size: 1.125rem; font-weight: 600; letter-spacing: -0.02em; color: #18181b; }
.pay-public-head p { margin: 0.25rem 0 0; font-size: 0.75rem; color: #71717a; }
.pay-public-err {
  border-radius: 0.75rem;
  border: 1px solid #fecaca;
  background: #fef2f2;
  padding: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: #991b1b;
}
.pay-public-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-radius: 1rem;
  border: 1px solid #e4e4e7;
  background: #fff;
  padding: 1.25rem;
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
.pay-public-center { text-align: center; }
.pay-public-label-xs { font-size: 0.75rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; }
.pay-public-status { margin-top: 0.25rem; font-size: 1rem; font-weight: 600; color: #18181b; }
.pay-public-banner {
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: center;
  font-size: 0.75rem;
}
.pay-public-banner--paid { background: #ecfdf5; color: #065f46; }
.pay-public-banner--expired { background: #fffbeb; color: #92400e; }
.pay-public-banner--muted { background: #f4f4f5; color: #3f3f46; }
.pay-public-sumwrap {
  border-radius: 0.5rem;
  background: rgb(236 253 245 / 0.9);
  padding: 0.75rem 1rem;
  text-align: center;
}
.pay-public-sumwrap .pay-public-label-xs { color: #065f46; text-transform: none; letter-spacing: normal; }
.pay-public-amount { margin-top: 0.25rem; font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #052e16; }
.pay-public-fields { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.875rem; }
.pay-public-field-label { font-size: 0.75rem; font-weight: 500; color: #71717a; }
.pay-public-field-val { margin-top: 0.125rem; }
.pay-public-mono { font-family: ui-monospace, monospace; font-size: 0.75rem; word-break: break-all; }
.pay-public-purpose { white-space: pre-wrap; }
.pay-public-muted-xs { font-size: 0.75rem; color: #a1a1aa; }
.pay-public-actions { display: flex; flex-direction: column; gap: 0.5rem; }
.pay-public-btn-pay {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: #15803d;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.75rem 1rem;
  text-align: center;
  text-decoration: none;
}
.pay-public-btn-pay:hover { background: #166534; }
.pay-public-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.pay-public-btn-sec {
  flex: 1 1 8rem;
  border-radius: 0.5rem;
  border: 1px solid #e4e4e7;
  background: #fafafa;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #27272a;
  cursor: pointer;
}
.pay-public-btn-sec:hover { background: #f4f4f5; }
.pay-public-qr { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; border-top: 1px solid #f4f4f5; padding-top: 1rem; margin-top: 0.25rem; }
.pay-public-qr img { height: 12rem; width: 12rem; border-radius: 0.5rem; border: 1px solid #e4e4e7; background: #fff; padding: 0.5rem; object-fit: contain; }
.pay-public-fallback { text-align: center; font-size: 0.875rem; color: #71717a; }
.pay-public-fallback button {
  font-weight: 500;
  color: #166534;
  text-decoration: underline;
  text-underline-offset: 2px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: inherit;
  font-family: inherit;
}
`;
