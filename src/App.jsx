import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      <ScrollToTop />
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
