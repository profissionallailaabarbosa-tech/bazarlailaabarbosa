import React from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import ScrollToTop from "./components/ScrollToTop";

import Home from "./Pages/Home";
import Cart from "./Pages/Cart";
import Checkout from "./Pages/Checkout";
import Admin from "./Pages/Admin";
import ProductDetails from "./Pages/ProductDetails";
import OrderTracking from "./Pages/OrderTracking"; // <--- Agora vai funcionar!

export default function App() {
  return (
    <div className="bg-white min-h-screen relative flex flex-col">
      <ScrollToTop />
      <Navbar />
      <div className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/produto/:id" element={<ProductDetails />} />
          {/* Rota ativada com segurança */}
          <Route path="/rastrear" element={<OrderTracking />} />
        </Routes>
      </div>
      <Footer />
      <WhatsAppButton /> 
    </div>
  );
}