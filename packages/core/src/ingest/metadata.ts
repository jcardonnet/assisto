export function contextsFromOption(context: string | undefined): string[] {
  const value = context?.trim();
  return value ? [value] : [];
}
