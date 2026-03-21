import type { MetadataRoute } from "next";

const BASE_URL = "https://www.suprex.dental";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/cart",
          "/checkout",
          "/cabinet",
          "/login",
          "/register",
          "/thank-you",
          "/api/",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
