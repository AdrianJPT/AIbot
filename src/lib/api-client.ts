"use client";

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
  fallbackMessage = "Error",
): Promise<T> {
  const response = await fetch(url, init);

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.length > 0
  ) {
    throw new Error(body.error);
  }

  throw new Error(fallbackMessage);
}
