import React, { Suspense, lazy, useEffect, useRef } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import ScrollToTop from "./components/ScrollToTop";
import { ComoComprar, Envios, Trocas } from "./Pages/InfoPages";

const lazyWithRetry = (importer, retryKey) =>
  lazy(async () => {
    const storageKey = `lazy-retry:${retryKey}`;

    try {
      const module = await importer();
      sessionStorage.removeItem(storageKey);
      return module;
    } catch (error) {
      const alreadyRetried = sessionStorage.getItem(storageKey) === "1";
      const message = String(error?.message || "");
      const isChunkError =
        /Failed to fetch dynamically imported module/i.test(message) ||
        /Importing a module script failed/i.test(message) ||
        /Loading chunk/i.test(message) ||
        /ChunkLoadError/i.test(message);

      if (isChunkError && !alreadyRetried) {
        sessionStorage.setItem(storageKey, "1");
        window.location.reload();
        return new Promise(() => {});
      }

      sessionStorage.removeItem(storageKey);
      throw error;
    }
  });

const Home = lazyWithRetry(() => import("./Pages/Home"), "home");
const Cart = lazyWithRetry(() => import("./Pages/Cart"), "cart");
const Checkout = lazyWithRetry(() => import("./Pages/Checkout"), "checkout");
const Admin = lazyWithRetry(() => import("./Pages/Admin"), "admin");
const ProductDetails = lazyWithRetry(() => import("./Pages/ProductDetails"), "product-details");
const OrderTracking = lazyWithRetry(() => import("./Pages/OrderTracking"), "order-tracking");

const PageFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center px-4 text-sm font-medium text-rose-500">
    Carregando página...
  </div>
);

const PENDING_PAYMENT_STORAGE_KEY = "pending_checkout_order";
const MAX_PENDING_PAYMENT_AGE_MS = 1000 * 60 * 30;
const BUILD_CHECK_INTERVAL_MS = 1000 * 60 * 2;
const APP_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID || "";

function PaymentReturnGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname === "/checkout" || location.pathname === "/admin") return;

    const tryResumePendingPayment = () => {
      try {
        const raw = localStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
        if (!raw) return;

        const pendingPayment = JSON.parse(raw);
        const orderId = Number(pendingPayment?.order_id);
        const createdAt = pendingPayment?.created_at ? new Date(pendingPayment.created_at).getTime() : 0;
        const isFresh = Number.isFinite(createdAt) && Date.now() - createdAt < MAX_PENDING_PAYMENT_AGE_MS;

        if (!Number.isFinite(orderId) || !isFresh) return;

        navigate(`/checkout?payment=pending&order=${orderId}&resume=1`, { replace: true });
      } catch {
        // ignore invalid local state
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        tryResumePendingPayment();
      }
    };

    tryResumePendingPayment();
    window.addEventListener("focus", tryResumePendingPayment);
    window.addEventListener("pageshow", tryResumePendingPayment);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", tryResumePendingPayment);
      window.removeEventListener("pageshow", tryResumePendingPayment);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [location.pathname, navigate]);

  return null;
}

function BuildVersionGuard() {
  const hasTriggeredReloadRef = useRef(false);

  useEffect(() => {
    if (!APP_BUILD_ID) return undefined;

    let cancelled = false;

    const checkForNewBuild = async () => {
      if (cancelled || hasTriggeredReloadRef.current) return;

      try {
        const response = await fetch(`/index.html?build-check=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) return;

        const html = await response.text();
        const match = html.match(/<meta\s+name=["']app-build-id["']\s+content=["']([^"']+)["']/i);
        const latestBuildId = match?.[1];

        if (latestBuildId && latestBuildId !== APP_BUILD_ID) {
          hasTriggeredReloadRef.current = true;
          window.location.reload();
        }
      } catch {
        // ignore background version check failures
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForNewBuild();
      }
    };

    checkForNewBuild();
    const intervalId = window.setInterval(checkForNewBuild, BUILD_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkForNewBuild);
    window.addEventListener("pageshow", checkForNewBuild);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkForNewBuild);
      window.removeEventListener("pageshow", checkForNewBuild);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      <ScrollToTop />
      <BuildVersionGuard />
      <PaymentReturnGuard />
      <Navbar />
      <div className="flex-grow">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/produto/:id" element={<ProductDetails />} />
            <Route path="/rastrear" element={<OrderTracking />} />
            <Route path="/ajuda/como-comprar" element={<ComoComprar />} />
            <Route path="/ajuda/envios" element={<Envios />} />
            <Route path="/ajuda/trocas" element={<Trocas />} />
          </Routes>
        </Suspense>
      </div>
      <Footer />
      <WhatsAppButton />
      <Analytics />
    </div>
  );
}
