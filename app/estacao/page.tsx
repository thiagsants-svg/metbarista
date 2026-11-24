"use client";

/** The Station's old address: bookmarks and installed apps still open it */

import { useEffect } from "react";

export default function EstacaoRedirect() {
  // Keeps ?demo=… and anything else after the path
  useEffect(() => { window.location.replace(`/station/${window.location.search}${window.location.hash}`); }, []);
  return null;
}
