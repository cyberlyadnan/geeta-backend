/**
 * GST state codes. Place of supply is a two-digit code, but customer records in this system store
 * a free-text state name, so a name→code lookup is unavoidable. The GSTIN prefix is always
 * preferred when the customer has one — this table is the fallback for unregistered customers.
 */
export const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  orissa: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

export const STATE_NAME_BY_CODE: Record<string, string> = Object.entries(GST_STATE_CODES).reduce<
  Record<string, string>
>((acc, [name, code]) => {
  if (!acc[code]) acc[code] = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return acc;
}, {});

export function stateCodeFromName(state?: string | null): string | null {
  if (!state) return null;
  return GST_STATE_CODES[state.trim().toLowerCase()] ?? null;
}

export function stateNameFromCode(code?: string | null): string | null {
  if (!code) return null;
  return STATE_NAME_BY_CODE[code] ?? null;
}
