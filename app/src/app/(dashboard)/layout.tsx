import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { logoutAction } from "@/actions/auth";
import { PrototypeBanner } from "@/components/features/prototype-banner";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/cases", label: "Cases" },
  { href: "/approvals", label: "Approvals" },
  { href: "/policy-rules", label: "Policy & Rules" },
  { href: "/insights", label: "Insights" },
  { href: "/orders", label: "Orders" },
  { href: "/shipments", label: "Shipments" },
  { href: "/operations-summary", label: "Operations Summary" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col gap-1 border-r border-border p-4">
        <div className="mb-4 text-sm font-semibold">Claims Hub</div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            {n.label}
          </Link>
        ))}
        <div className="mt-auto flex flex-col gap-2 text-xs text-muted-foreground">
          <span>{actor.name} ({actor.role})</span>
          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit">Sign out</Button>
          </form>
        </div>
      </aside>
      <div className="flex-1">
        <PrototypeBanner />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
