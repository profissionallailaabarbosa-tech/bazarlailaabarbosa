import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import ScrollToTop from "./components/ScrollToTop";
import { ComoComprar, Envios, Trocas } from "./Pages/InfoPages";

const Home = lazy(() => import("./Pages/Home"));
const Cart = lazy(() => import("./Pages/Cart"));
const Checkout = lazy(() => import("./Pages/Checkout"));
const Admin = lazy(() => import("./Pages/Admin"));
const ProductDetails = lazy(() => import("./Pages/ProductDetails"));
const OrderTracking = lazy(() => import("./Pages/OrderTracking"));

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
