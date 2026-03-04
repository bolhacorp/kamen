"use client";

import React from "react";
import Link from "next/link";

export const Header: React.FC = () => {
  return (
    <div className="header-container">
      <div className="header-logo">
        <div className="logo-placeholder"></div>
      </div>
      <div className="kamen-logo">
        <span className="kamen-title">KAMEN</span>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/config"
          className="header-chip opacity-90 hover:opacity-100"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          Config
        </Link>
        <div className="header-chip">
          <span>versão beta</span>
        </div>
      </div>
    </div>
  );
};
