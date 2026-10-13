import { createFileRoute } from "@tanstack/react-router";
import { TremorApp } from "@/components/mc/TremorApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tremor — Portable Movement Assessment Prototype" },
      { name: "description", content: "Experimental tablet-based movement and voice assessment. Processed on your device. Not a medical diagnosis." },
      { property: "og:title", content: "Tremor — Portable Movement Assessment" },
      { property: "og:description", content: "Four guided tests, about 2 minutes, processed locally. Experimental, not a diagnosis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TremorApp,
});

