import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles.css";
import { TremorApp } from "@/components/mc/TremorApp";

createRoot(document.getElementById("root")!).render(<StrictMode><TremorApp /></StrictMode>);
