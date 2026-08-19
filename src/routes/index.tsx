import { createFileRoute } from "@tanstack/react-router";
import { HoldApp } from "@/components/hold-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HoldApp />;
}
