/** fetch() + JSON parsing, with error messages that name the file that failed. */
export async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`Network error while loading ${url}. Check your connection and try again.`, { cause });
  }
  if (!response.ok) {
    throw new Error(`Couldn't load ${url} (HTTP ${response.status}).`);
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new Error(`${url} is not valid JSON.`, { cause });
  }
}
