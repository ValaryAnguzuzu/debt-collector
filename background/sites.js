function normalizeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function matchesSite(url, sites = []) {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }

  return sites.some((site) => hostname === site || hostname.endsWith(`.${site}`));
}

export function classifyUrl(url, bannedSites = [], productiveSites = []) {
  const banned = matchesSite(url, bannedSites);
  const productive = matchesSite(url, productiveSites);

  return {
    hostname: normalizeHost(url),
    isBanned: banned,
    isProductive: productive
  };
}
