import React from 'react';
import { MessageCircle } from 'lucide-react';

export default function WhatsAppFloat() {
  const phone = "5511999999999"; 
  const link = `https://wa.me/${phone}`;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        width: '60px',
        height: '60px',
        backgroundColor: '#25D366',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        zIndex: 1000,
        textDecoration: 'none'
      }}
    >
      <MessageCircle size={35} />
    </a>
  );
}