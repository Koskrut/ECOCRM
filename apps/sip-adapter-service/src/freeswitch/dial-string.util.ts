/** E.164 (+380…) → dial string for sofia gateway (configurable prefix). */
export function destinationToDialString(destination: string, prefix = ""): string {
  const digits = destination.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("380") && digits.length === 12) {
    return `${prefix}${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `${prefix}38${digits}`;
  }
  return `${prefix}${digits}`;
}

export function buildOriginateVars(input: {
  cliNumber: string;
  publicIp: string;
  callId: string;
}): string {
  const vars = [
    `origination_caller_id_number=${input.cliNumber}`,
    "absolute_codec_string=PCMA",
    "rtp_ptime=20",
    `sip_contact_host=${input.publicIp}`,
    `external_rtp_ip=${input.publicIp}`,
    `external_sip_ip=${input.publicIp}`,
    `crm_call_id=${input.callId}`,
  ];
  return `{${vars.join(",")}}`;
}
