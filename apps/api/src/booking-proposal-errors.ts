export const bookingProposalIssues = [
  'missing',
  'wrong_action',
  'incomplete',
  'expired',
  'client_mismatch',
  'unavailable',
  'replaced',
  'undelivered',
  'binding_mismatch',
] as const;

export type BookingProposalIssue = typeof bookingProposalIssues[number];

export function bookingProposalError(issue: BookingProposalIssue, message = 'Booking proposal cannot be confirmed') {
  return Object.assign(new Error(message), { code: 'BOOKING_PROPOSAL_STATE', proposalIssue: issue });
}

export function bookingProposalFactError(factIssues: string[], message = 'Booking proposal facts were not verified') {
  return Object.assign(new Error(message), { code: 'BOOKING_PROPOSAL_FACT_MISMATCH', factIssues });
}
