import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Package,
  Boxes,
  Truck,
  ContactRound,
  ClipboardList,
  Wallet,
  Users,
  History,
  Sparkles,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "../modules/auth/auth";
import { Button } from "../shared/components/ui/button";
const links = [
  { to: "/", name: "Resumen", icon: LayoutDashboard, admin: true },
  { to: "/vender", name: "Vender", icon: ShoppingCart },
  { to: "/ventas", name: "Ventas", icon: ReceiptText },
  { to: "/existencias", name: "Existencias", icon: Package },
  { to: "/productos", name: "Productos", icon: Boxes, admin: true },
  { to: "/lotes", name: "Lotes", icon: Boxes, admin: true },
  { to: "/proveedores", name: "Proveedores", icon: Truck, admin: true },
  { to: "/creditos", name: "Créditos", icon: ContactRound, admin: true },
  { to: "/proformas", name: "Proformas", icon: ClipboardList },
  { to: "/caja", name: "Caja", icon: Wallet, admin: true },
  { to: "/usuarios", name: "Usuarios", icon: Users, admin: true },
  { to: "/auditoria", name: "Auditoría", icon: History, admin: true },
  { to: "/asistente", name: "Asistente", icon: Sparkles, admin: true },
];
export default function Layout() {
  const { profile, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState("");
  const loc = useLocation();
  useEffect(() => {
    setMenu(false);
    document.getElementById("page-title")?.focus();
  }, [loc.pathname]);
  const allowed = links.filter((l) => !l.admin || profile?.role === "admin");
  const title = links.find((l) => l.to === loc.pathname)?.name ?? "Detalle";
  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className="topbar">
        <NavLink
          to={profile?.role === "admin" ? "/" : "/vender"}
          className="brand"
        >
          <img src="/brand.svg" alt="" />
          ACEMAR
        </NavLink>
        <nav aria-label="Navegación principal" className="desktop-nav">
          <NavLink to="/vender">
            <ShoppingCart size={19} />
            Ventas
          </NavLink>
          <NavLink to="/existencias">
            <Package size={19} />
            Inventario
          </NavLink>
          {profile?.role === "admin" && (
            <NavLink to="/">
              <LayoutDashboard size={19} />
              Administración
            </NavLink>
          )}
        </nav>
        <div className="account">
          <span className="avatar">{profile?.name.charAt(0)}</span>
          <div>
            <strong>{profile?.name}</strong>
            <small>
              {profile?.role === "admin"
                ? "Administrador"
                : `Mostrador ${profile?.counter}`}
            </small>
          </div>
          <Button
            variant="ghost"
            aria-label="Cerrar sesión"
            onClick={() => void logout().catch((e) => setError(e.message))}
          >
            <LogOut size={19} />
          </Button>
        </div>
        <button
          className="icon-btn mobile-menu"
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-controls="side-nav"
          aria-label="Abrir navegación"
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <div className="workspace">
        <aside id="side-nav" className={`sidebar ${menu ? "is-open" : ""}`}>
          <span className="nav-label">ESPACIO DE TRABAJO</span>
          <nav aria-label="Módulos">
            {allowed.map(({ to, name, icon: Icon }) => (
              <NavLink to={to} key={to} end={to === "/"}>
                <Icon size={19} />
                {name}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="status-dot" />
            ACEMAR Web<small>Gestión comercial</small>
          </div>
        </aside>
        <main id="main" className="main">
          <div className="breadcrumb">
            ACEMAR <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        <NavLink to="/vender">
          <ShoppingCart />
          Vender
        </NavLink>
        <NavLink to="/ventas">
          <ReceiptText />
          Ventas
        </NavLink>
        <NavLink to="/existencias">
          <Package />
          Inventario
        </NavLink>
        <button onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <Menu />
          Más
        </button>
      </nav>
    </>
  );
}
