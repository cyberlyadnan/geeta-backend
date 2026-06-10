/** Official Geeta Printers support contact — used by auth & vendor status APIs. */
export const businessContact = {
  businessName: 'Geeta Printers',
  website: 'https://www.geetaprinters.in',
  phones: {
    primary: {
      display: '+91 78190 78700',
      tel: 'tel:+917819078700',
    },
    secondary: {
      display: '+91 93198 23229',
      tel: 'tel:+919319823229',
    },
  },
  whatsapp: {
    href: 'https://wa.me/917819078700',
  },
  email: 'geetauvsre@gmail.com',
} as const;

export function resolveSupportContact() {
  const primary =
    process.env['SUPPORT_PHONE_PRIMARY'] ??
    process.env['SUPPORT_PHONE'] ??
    businessContact.phones.primary.display;
  const secondary =
    process.env['SUPPORT_PHONE_SECONDARY'] ?? businessContact.phones.secondary.display;
  const email = process.env['SUPPORT_EMAIL'] ?? businessContact.email;

  return {
    supportPhone: primary,
    supportPhoneSecondary: secondary,
    supportEmail: email,
  };
}
