import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";

const navItems = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "RD Calculator", to: "/calculator" },
  { label: "Orders", to: "/orders" },
  { label: "Create Order", to: "/orders/new" },
  { label: "Pending Orders", to: "/pending" },
  { label: "Dispatch", to: "/dispatch" },
  { label: "Parties", to: "/parties" },
  { label: "Products", to: "/products" },
  { label: "Inventory", to: "/inventory" },
  { label: "History", to: "/history" },
  { label: "Reports", to: "/reports" },
  { label: "Profile", to: "/profile" },
  { label: "Settings", to: "/settings" },
];

const CommandMenu = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    document.addEventListener("keydown", down);

    return () => document.removeEventListener("keydown", down);
  }, []);

  const filtered = navItems.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg border overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            placeholder="Search pages..."
            className="w-full p-3 outline-none bg-transparent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {filtered.map((item) => (
            <button
              key={item.to}
              onClick={() => {
                navigate(item.to);
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-4 py-3 hover:bg-muted transition"
            >
              {item.label}
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandMenu;
