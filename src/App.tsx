import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Calculator from "./pages/Calculator";
import History from "./pages/History";
import Parties from "./pages/Parties";
import Profile from "./pages/Profile";
import Products from "./pages/Products";
import Orders from "./pages/Orders";
import CreateOrder from "./pages/CreateOrder";
import ExcelImport from "./pages/ExcelImport";
import Inventory from "./pages/Inventory";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/calculator" element={<AppLayout><Calculator /></AppLayout>} />
              <Route path="/history" element={<AppLayout><History /></AppLayout>} />
              <Route path="/parties" element={<AppLayout><Parties /></AppLayout>} />
              <Route path="/products" element={<AppLayout><Products /></AppLayout>} />
              <Route path="/orders" element={<AppLayout><Orders /></AppLayout>} />
              <Route path="/orders/new" element={<AppLayout><CreateOrder /></AppLayout>} />
              <Route path="/excel-import" element={<AppLayout><ExcelImport /></AppLayout>} />
              <Route path="/inventory" element={<AppLayout><Inventory /></AppLayout>} />
              <Route path="/reports" element={<AppLayout><Reports /></AppLayout>} />
              <Route path="/settings" element={<AppLayout><Settings /></AppLayout>} />
              <Route path="/profile" element={<AppLayout><Profile /></AppLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
