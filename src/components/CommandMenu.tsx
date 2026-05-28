import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const pages = [
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

export default function CommandMenu() {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }

      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", down);

    return () => {
      document.removeEventListener("keydown", down);
    };
  }, []);

  const filtered = pages.filter((page) =>
    page.label.toLowerCase().includes(query.toLowerCase())
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "100px",
      }}
    >
      <div
        style={{
          width: "500px",
          background: "white",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <input
          autoFocus
          type="text"
          placeholder="Search pages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "16px",
            border: "none",
            outline: "none",
            fontSize: "16px",
            borderBottom: "1px solid #eee",
          }}
        />

        <div
          style={{
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          {filtered.map((page) => (
            <button
              key={page.to}
              onClick={() => {
                navigate(page.to);
                setOpen(false);
              }}
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "none",
                background: "white",
                textAlign: "left",
                cursor: "pointer",
                borderBottom: "1px solid #f3f3f3",
              }}
            >
              {page.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
