export type AccountPublicationPreference = "" | "reel" | "feed" | "carousel" | "story";
export type NewsFormatPreference = "single" | "carousel" | "automatic";

const MEDIA_TYPES = new Set<AccountPublicationPreference>(["reel", "feed", "story"]);

export function accountPublicationPreference(
  storedMediaType: unknown,
  newsFormatPreference: unknown,
): AccountPublicationPreference {
  if (storedMediaType === "feed" && newsFormatPreference === "carousel") {
    return "carousel";
  }
  return MEDIA_TYPES.has(storedMediaType as AccountPublicationPreference)
    ? storedMediaType as AccountPublicationPreference
    : "";
}

export function storedMediaTypeForPreference(
  preference: AccountPublicationPreference,
): "" | "reel" | "feed" | "story" {
  return preference === "carousel" ? "feed" : preference;
}

export function newsFormatForPublicationPreference(
  preference: AccountPublicationPreference,
  inheritedPreference: unknown,
): NewsFormatPreference {
  if (preference === "carousel") return "carousel";
  if (preference === "") {
    return inheritedPreference === "carousel" || inheritedPreference === "automatic"
      ? inheritedPreference
      : "single";
  }
  return "single";
}
