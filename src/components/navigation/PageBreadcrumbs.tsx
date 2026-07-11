// src/components/navigation/PageBreadcrumbs.tsx
//
// Renders "Module › Group › Page" for the current route by looking it up in
// the centralized navigation registry — no page-by-page breadcrumb props.

import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useNavigation } from "@/lib/navigation/useNavigation";

export default function PageBreadcrumbs() {
  const location = useLocation();
  const { byRoute, getPath } = useNavigation();

  const current = byRoute.get(location.pathname);
  if (!current) return null;

  // Module is implicit context, not a clickable crumb of its own (it has no route),
  // so lead with it as plain text then walk any nested group items down to the page.
  const chain = getPath(current.id);

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <span className="text-muted-foreground/70">{current.module}</span>
        </BreadcrumbItem>
        {chain.map((item, idx) => {
          const isLast = idx === chain.length - 1;
          return (
            <Fragment key={item.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast || !item.route ? (
                  <BreadcrumbPage>{item.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.route}>{item.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
