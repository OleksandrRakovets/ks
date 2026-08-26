/** Phantom nominal marker. Callers obtain branded values from the corresponding schemas, not by constructing this type. */
export type Brand<T, B extends string> = T & { readonly __brand: B }
