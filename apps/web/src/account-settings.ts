export function normalizeProfileName(name: string): string {
  return name.trim();
}

export function passwordsMatch(newPassword: string, confirmation: string): boolean {
  return newPassword === confirmation;
}

export function isValidNewPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 72;
}
