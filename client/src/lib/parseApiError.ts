/** Parse failed fetch body for toast / UI messages. */
export async function messageFromResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trim()) return `${res.status} ${res.statusText || "Request failed"}`;
  try {
    const j = JSON.parse(text);
    if (typeof j.error === "string") return j.error;
    if (typeof j.message === "string") return j.message;
    if (Array.isArray(j.errors)) return JSON.stringify(j.errors);
    return text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}
